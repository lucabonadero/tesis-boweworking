import crypto from "crypto";
import pool from "../config/db.js";
import { parsearReferenciaCompra, estadoCompraParaPago } from "../services/creditos.service.js";
import {
  bloquearCompra,
  bloquearSaldo,
  aplicarMovimiento,
  marcarCompraAcreditada,
  marcarCompraRechazada,
} from "../repositories/creditos.repository.js";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET?.trim();

let avisoSecretoFaltante = false;

// Firma de notificaciones de Mercado Pago: HMAC-SHA256 sobre la plantilla oficial
// id:[data.id];request-id:[x-request-id];ts:[ts];
function parsearEncabezadoFirma(xSignature) {
  if (!xSignature || typeof xSignature !== "string") return {};
  const map = {};
  for (const part of xSignature.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return map;
}

function verificarFirmaWebhook(req) {
  if (!MP_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "MP_WEBHOOK_SECRET no configurado (obligatorio en producción)" };
    }
    if (!avisoSecretoFaltante) {
      avisoSecretoFaltante = true;
      console.warn(
        "[MP Webhook] MP_WEBHOOK_SECRET no definido: la firma no se valida (solo desarrollo). Configurá el secreto del webhook en el panel de MP."
      );
    }
    return { ok: true, skipped: true };
  }

  const sig = parsearEncabezadoFirma(req.headers["x-signature"]);
  const requestId = req.headers["x-request-id"];
  const ts = sig.ts;
  const v1 = sig.v1;
  const dataIdRaw = req.query["data.id"] ?? req.body?.data?.id;

  if (!requestId || !ts || !v1 || dataIdRaw == null || String(dataIdRaw).trim() === "") {
    return { ok: false, reason: "Faltan x-signature / x-request-id / data.id" };
  }

  const dataId = String(dataIdRaw).toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");

  if (expected !== v1) {
    return { ok: false, reason: "Firma no coincide" };
  }
  return { ok: true, skipped: false };
}

export function mapearEstadoMP(mpStatus) {
  switch (mpStatus) {
    case "approved":
      return "Pagado";
    case "pending":
    case "in_process":
    case "authorized":
      return "Pendiente";
    case "rejected":
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "Rechazado";
    default:
      return "Pendiente";
  }
}

/**
 * Acredita una compra de créditos a partir del pago de Mercado Pago.
 *
 * Idempotente: Mercado Pago reintenta la misma notificación, así que una compra
 * ya acreditada se ignora en silencio. Todo en una transacción con la compra y
 * el saldo bloqueados.
 */
async function acreditarCompraCreditos(compraId, payment, paymentId) {
  const estadoDestino = estadoCompraParaPago(payment.status);
  if (!estadoDestino) return { skipped: true, motivo: "pago en curso" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const compra = await bloquearCompra(client, compraId);
    if (!compra) {
      await client.query("ROLLBACK");
      return { skipped: true, motivo: "compra inexistente" };
    }

    if (compra.estado !== "pendiente") {
      await client.query("ROLLBACK");
      return { compraId, estado: compra.estado, idempotent: true };
    }

    if (estadoDestino === "rechazada") {
      await marcarCompraRechazada(client, compraId, String(paymentId));
      await client.query("COMMIT");
      return { compraId, estado: "rechazada", idempotent: false };
    }

    const saldoActual = await bloquearSaldo(client, compra.cliente_usuario_id);
    const saldoPosterior = saldoActual + compra.creditos;

    await aplicarMovimiento(client, {
      clienteUsuarioId: compra.cliente_usuario_id,
      tipo: "compra_paquete",
      cantidad: compra.creditos,
      saldoPosterior,
      motivo: `Compra de ${compra.creditos} créditos`,
      compraId: compra.id,
    });
    await marcarCompraAcreditada(client, compraId, String(paymentId));

    await client.query("COMMIT");
    return { compraId, estado: "acreditada", saldoPosterior, idempotent: false };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Las reservas se pagan con créditos desde este módulo: el checkout de reserva
 * quedó fuera de servicio. Para comprar créditos, POST /api/creditos/comprar.
 */
export const crearPreferencia = async (_req, res) => {
  res.status(410).json({
    message: "Las reservas se pagan con créditos. Comprá créditos desde tu cuenta.",
    codigo: "PAGO_RESERVA_DISCONTINUADO",
  });
};

export const webhook = async (req, res) => {
  const sigResult = verificarFirmaWebhook(req);
  if (!sigResult.ok) {
    console.warn("[MP Webhook] rechazado:", sigResult.reason);
    return res.sendStatus(401);
  }

  try {
    let paymentId;
    const { type, data } = req.body || {};

    if (type === "payment" && data?.id) {
      paymentId = data.id;
    } else if (req.query.topic === "payment" && req.query.id) {
      paymentId = req.query.id;
    }

    if (!paymentId) return res.sendStatus(200);
    if (!MP_ACCESS_TOKEN) return res.sendStatus(200);

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!paymentRes.ok) {
      console.error("[MP Webhook] error al consultar pago", paymentId, paymentRes.status);
      return res.sendStatus(500);
    }

    const payment = await paymentRes.json();

    // Una referencia sin el prefijo 'creditos-' es un pago de reserva antiguo:
    // ese flujo está discontinuado y la notificación se ignora.
    const compraId = parsearReferenciaCompra(payment.external_reference);
    if (compraId == null) {
      console.log(`[MP Webhook] payment ${paymentId} ignorado: no es una compra de créditos`);
      return res.sendStatus(200);
    }

    const result = await acreditarCompraCreditos(compraId, payment, paymentId);
    if (!result.skipped) {
      console.log(
        `[MP Webhook] payment ${paymentId} -> compra ${result.compraId} ${result.estado}${result.idempotent ? " (idempotente)" : ""}`
      );
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error en webhook MP:", error);
    res.sendStatus(500);
  }
};

/**
 * GET /api/pagos/verificar/:paymentId
 * Vuelta del checkout: acredita sin esperar al webhook, que puede demorar.
 */
export const verificarPago = async (req, res) => {
  if (!MP_ACCESS_TOKEN) {
    return res.status(503).json({ message: "Mercado Pago no está configurado en el servidor" });
  }

  try {
    const { paymentId } = req.params;

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!paymentRes.ok) {
      return res.status(502).json({ message: "No pudimos consultar el pago en Mercado Pago" });
    }

    const payment = await paymentRes.json();
    const compraId = parsearReferenciaCompra(payment.external_reference);
    if (compraId == null) {
      return res.status(404).json({ message: "El pago no corresponde a una compra de créditos" });
    }

    const result = await acreditarCompraCreditos(compraId, payment, paymentId);
    res.json({ estadoPago: payment.status, compraId, ...result });
  } catch (error) {
    console.error("Error al verificar el pago:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/pagos/estado/:idReserva
 * El pago de reserva quedó discontinuado; se conserva la ruta para no romper
 * clientes viejos que la sigan consultando.
 */
export const obtenerEstadoPago = async (_req, res) => {
  res.status(410).json({
    message: "Las reservas se pagan con créditos.",
    codigo: "PAGO_RESERVA_DISCONTINUADO",
  });
};
