import crypto from "crypto";
import pool from "../config/db.js";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET?.trim();

let avisoSecretoFaltante = false;

function esStaffPago(usuario) {
  return usuario?.rol === "admin" || usuario?.rol === "staff";
}

function esClientePago(usuario) {
  return usuario?.rol === "cliente" || usuario?.tipo === "cliente";
}

function urlBase(envUrl, fallback) {
  const u = (envUrl || fallback || "").trim().replace(/\/+$/, "");
  return u || null;
}

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

// Devuelve 'reserva_fija', 'multirecurso' o null — sirve para interpretar montos en los reportes.
async function inferClasificacionPago(idReserva) {
  try {
    const { rows } = await pool.query(
      'SELECT "idSerie", "idReservaGrupo" FROM "Reservas" WHERE "idReserva" = $1',
      [idReserva]
    );
    if (!rows[0]) return null;
    if (rows[0].idSerie != null) return "reserva_fija";
    if (rows[0].idReservaGrupo != null) {
      const { rows: c } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM "Reservas" WHERE "idReservaGrupo" = $1',
        [rows[0].idReservaGrupo]
      );
      if ((c[0]?.n ?? 0) > 1) return "multirecurso";
    }
    return null;
  } catch (e) {
    if (e.code === "42703") return null;
    throw e;
  }
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

// Persiste solo el estado de cobro en Transaccion; no toca el ciclo de vida de la reserva
// (activa / completada por asistencia / cancelada, etc.).
async function persistirPagoMercadoPago(payment, paymentId) {
  if (!payment.external_reference) return { skipped: true };

  const idReserva = parseInt(payment.external_reference, 10);
  if (Number.isNaN(idReserva)) return { skipped: true };

  const estadoPago = mapearEstadoMP(payment.status);
  const pid = String(paymentId);
  const clasificacion = await inferClasificacionPago(idReserva);

  const transaccionExiste = await pool.query(
    'SELECT "idTransaccion", "mp_payment_id", "EstadoPago" FROM "Transaccion" WHERE "idReserva" = $1',
    [idReserva]
  );

  if (transaccionExiste.rows.length > 0) {
    const row = transaccionExiste.rows[0];
    if (String(row.mp_payment_id || "") === pid && row.EstadoPago === estadoPago) {
      return { idReserva, estadoPago, idempotent: true };
    }
    await pool.query(
      `UPDATE "Transaccion"
       SET "EstadoPago" = $1, "mp_payment_id" = $2, "TipoPago" = 'online', "MetodoPago" = 'mercadopago',
           "ClasificacionPago" = COALESCE("ClasificacionPago", $4)
       WHERE "idReserva" = $3`,
      [estadoPago, pid, idReserva, clasificacion]
    );
  } else {
    await pool.query(
      `INSERT INTO "Transaccion" ("idReserva", "MetodoPago", "EstadoPago", "TipoPago", "mp_payment_id", "ClasificacionPago")
       VALUES ($1, 'mercadopago', $2, 'online', $3, $4)`,
      [idReserva, estadoPago, pid, clasificacion]
    );
  }

  return { idReserva, estadoPago, idempotent: false };
}

export const crearPreferencia = async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(503).json({ message: "Mercado Pago no configurado. Configure MP_ACCESS_TOKEN." });
    }

    const { idReserva: idReservaRaw, idSerie: idSerieRaw, idReservaGrupo: idGrupoRaw } = req.body;
    let idSerie = idSerieRaw != null ? Number(idSerieRaw) : null;
    const idReservaSingle = idReservaRaw != null ? Number(idReservaRaw) : null;
    const idReservaGrupo = idGrupoRaw != null ? Number(idGrupoRaw) : null;

    if (
      (!idSerie || !Number.isFinite(idSerie) || idSerie <= 0) &&
      (idReservaGrupo == null || !Number.isFinite(idReservaGrupo)) &&
      idReservaSingle != null &&
      Number.isFinite(idReservaSingle) &&
      idReservaSingle > 0
    ) {
      const { rows: probe } = await pool.query('SELECT "idSerie" FROM "Reservas" WHERE "idReserva" = $1', [
        idReservaSingle,
      ]);
      if (probe[0]?.idSerie != null) {
        idSerie = Number(probe[0].idSerie);
      }
    }

    let idReservaPago;
    let monto;
    let title;
    let idsTransaccionReserva = [];
    let clasificacionPago = null;

    if (idSerie != null && Number.isFinite(idSerie) && idSerie > 0) {
      clasificacionPago = "reserva_fija";
      const { rows: serieRows } = await pool.query(
        `SELECT r."idReserva", r."DNI", rs."precioFinalTotal",
                rec."Nombre" AS recurso_nombre, e."Nombre" AS espacio_nombre,
                rs."anio", rs."mes", rs."nOcurrencias",
                rs."periodoDesde", rs."periodoHasta"
         FROM "ReservaSerie" rs
         INNER JOIN "Reservas" r ON r."idSerie" = rs."idSerie"
         LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
         LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
         WHERE rs."idSerie" = $1
         ORDER BY r."DiaReserva" ASC, r."idReserva" ASC`,
        [idSerie]
      );
      if (serieRows.length === 0) {
        return res.status(404).json({ message: "Serie de reservas no encontrada." });
      }
      const tokenDni = req.usuario?.dni != null ? String(req.usuario.dni).trim() : "";
      const ownerDni = serieRows[0].DNI != null ? String(serieRows[0].DNI).trim() : "";
      if (esClientePago(req.usuario) && !esStaffPago(req.usuario)) {
        if (!tokenDni || ownerDni !== tokenDni) {
          return res.status(403).json({ message: "No podés iniciar el pago de una reserva que no es tuya." });
        }
      }
      idReservaPago = serieRows[0].idReserva;
      idsTransaccionReserva = serieRows.map((x) => x.idReserva);
      monto = parseFloat(serieRows[0].precioFinalTotal) || 0;
      const sn = serieRows[0];
      const rango =
        sn.periodoDesde && sn.periodoHasta
          ? `${sn.periodoDesde} → ${sn.periodoHasta}`
          : sn.anio && sn.mes
            ? `${sn.anio}-${String(sn.mes).padStart(2, "0")}`
            : "";
      title = `Reserva fija 4 semanas (${sn.nOcurrencias} turnos${rango ? ` · ${rango}` : ""}) ${sn.espacio_nombre || ""} - ${sn.recurso_nombre || ""}`.trim();
    } else if (idReservaGrupo != null && Number.isFinite(idReservaGrupo) && idReservaGrupo > 0) {
      clasificacionPago = "multirecurso";
      const { rows: grupoRows } = await pool.query(
        `SELECT r."idReserva", r."DNI", r."Monto",
                rec."Nombre" AS recurso_nombre, e."Nombre" AS espacio_nombre
         FROM "Reservas" r
         LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
         LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
         WHERE r."idReservaGrupo" = $1
         ORDER BY r."idReserva" ASC`,
        [idReservaGrupo]
      );
      if (grupoRows.length === 0) {
        return res.status(404).json({ message: "Reserva grupal no encontrada." });
      }
      const tokenDni = req.usuario?.dni != null ? String(req.usuario.dni).trim() : "";
      const ownerDni = grupoRows[0].DNI != null ? String(grupoRows[0].DNI).trim() : "";
      if (esClientePago(req.usuario) && !esStaffPago(req.usuario)) {
        if (!tokenDni || ownerDni !== tokenDni) {
          return res.status(403).json({ message: "No podés iniciar el pago de una reserva que no es tuya." });
        }
      }
      idReservaPago = grupoRows[0].idReserva;
      idsTransaccionReserva = grupoRows.map((x) => x.idReserva);
      monto = grupoRows.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
      const esp = grupoRows[0].espacio_nombre || "";
      const nombres = grupoRows.map((x) => x.recurso_nombre).filter(Boolean);
      const recTxt = nombres.length > 2 ? `${nombres.length} lugares` : nombres.join(" + ");
      title = `Reserva múltiple (${grupoRows.length}) ${esp} — ${recTxt}`.trim();
    } else if (idReservaSingle != null && Number.isFinite(idReservaSingle) && idReservaSingle > 0) {
      idReservaPago = idReservaSingle;
      const { rows } = await pool.query(
        `SELECT r.*, rec."Nombre" AS recurso_nombre, e."Nombre" AS espacio_nombre
         FROM "Reservas" r
         LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
         LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
         WHERE r."idReserva" = $1`,
        [idReservaPago]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada." });
      const reserva = rows[0];
      if (esClientePago(req.usuario) && !esStaffPago(req.usuario)) {
        const tokenDni = req.usuario.dni != null ? String(req.usuario.dni).trim() : "";
        const resDni = reserva.DNI != null ? String(reserva.DNI).trim() : "";
        if (!tokenDni || resDni !== tokenDni) {
          return res.status(403).json({ message: "No podés iniciar el pago de una reserva que no es tuya." });
        }
      }
      monto = parseFloat(reserva.Monto) || 0;
      title = `Reserva ${reserva.espacio_nombre || ""} - ${reserva.recurso_nombre || ""}`.trim();
      idsTransaccionReserva = [idReservaPago];
    } else {
      return res.status(400).json({ message: "Enviá idReserva, idSerie o idReservaGrupo." });
    }

    if (monto <= 0) {
      return res.status(400).json({
        message:
          "El monto debe ser mayor a 0 para pagar online. Contacta al administrador para que asigne el precio.",
      });
    }

    const existente = await pool.query(
      'SELECT "idTransaccion", "EstadoPago" FROM "Transaccion" WHERE "idReserva" = $1',
      [idReservaPago]
    );
    if (existente.rows.length > 0 && existente.rows[0].EstadoPago === "Pagado") {
      return res.status(409).json({ message: "Esta reserva ya está pagada." });
    }

    const frontend = urlBase(process.env.FRONTEND_URL, "http://localhost:5173");
    if (!frontend) {
      return res.status(503).json({ message: "Configure FRONTEND_URL en .env (URL del frontend, ej. http://localhost:5173)." });
    }

    const q = encodeURIComponent(String(idReservaPago));
    const successUrl = `${frontend}/pago/confirmacion?idReserva=${q}`;
    const failureUrl = `${frontend}/pago/confirmacion?idReserva=${q}&resultado=error`;
    const pendingUrl = `${frontend}/pago/confirmacion?idReserva=${q}&resultado=pendiente`;

    const preference = {
      items: [
        {
          title: title || "Reserva Boweworking",
          quantity: 1,
          unit_price: monto,
          currency_id: "ARS",
        },
      ],
      external_reference: String(idReservaPago),
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      ...(successUrl.startsWith("https://") ? { auto_return: "approved" } : {}),
      notification_url: `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`}/api/pagos/webhook`,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP error:", mpData);
      return res.status(502).json({ message: "Error al crear preferencia en Mercado Pago.", detail: mpData.message });
    }

    let idTransaccion;
    if (existente.rows.length > 0) {
      idTransaccion = existente.rows[0].idTransaccion;
      await pool.query(
        `UPDATE "Transaccion"
         SET "mp_preference_id" = $1, "TipoPago" = 'online', "MetodoPago" = 'mercadopago', "EstadoPago" = 'Pendiente',
             "ClasificacionPago" = COALESCE($3, "ClasificacionPago")
         WHERE "idReserva" = $2`,
        [mpData.id, idReservaPago, clasificacionPago]
      );
    } else {
      const ins = await pool.query(
        `INSERT INTO "Transaccion" ("idReserva", "MetodoPago", "EstadoPago", "TipoPago", "mp_preference_id", "ClasificacionPago")
         VALUES ($1, 'mercadopago', 'Pendiente', 'online', $2, $3)
         RETURNING "idTransaccion"`,
        [idReservaPago, mpData.id, clasificacionPago]
      );
      idTransaccion = ins.rows[0].idTransaccion;
    }

    try {
      await pool.query('DELETE FROM "TransaccionReserva" WHERE "idTransaccion" = $1', [idTransaccion]);
      for (const rid of idsTransaccionReserva) {
        await pool.query(
          `INSERT INTO "TransaccionReserva" ("idTransaccion", "idReserva") VALUES ($1, $2)
           ON CONFLICT ("idTransaccion", "idReserva") DO NOTHING`,
          [idTransaccion, rid]
        );
      }
    } catch (e) {
      if (e.code !== "42P01") throw e;
    }

    res.json({
      preferenceId: mpData.id,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
    });
  } catch (error) {
    console.error("Error al crear preferencia MP:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
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
    const result = await persistirPagoMercadoPago(payment, paymentId);

    if (!result.skipped) {
      console.log(
        `[MP Webhook] payment ${paymentId} -> ${result.estadoPago} | reserva ${result.idReserva}${result.idempotent ? " (idempotente)" : ""}`
      );
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error en webhook MP:", error);
    res.sendStatus(500);
  }
};

async function assertPuedeConsultarPagoMp(usuario, idReserva) {
  const staff = esStaffPago(usuario);
  if (staff) return { ok: true };

  const cliente = esClientePago(usuario);
  if (!cliente) {
    return { ok: false, status: 403, message: "No autorizado a consultar el estado de pago." };
  }
  if (!idReserva || Number.isNaN(idReserva)) {
    return { ok: false, status: 403, message: "No autorizado a consultar este pago." };
  }
  const tokenDni = usuario.dni != null ? String(usuario.dni).trim() : "";
  const { rows } = await pool.query('SELECT "DNI" FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
  if (rows.length === 0) {
    return { ok: false, status: 403, message: "No autorizado a consultar este pago." };
  }
  const resDni = rows[0].DNI != null ? String(rows[0].DNI).trim() : "";
  if (!tokenDni || resDni !== tokenDni) {
    return { ok: false, status: 403, message: "No autorizado a consultar este pago." };
  }
  return { ok: true };
}

export const verificarPago = async (req, res) => {
  try {
    const { paymentId } = req.params;
    if (!paymentId) return res.status(400).json({ message: "paymentId es requerido." });
    if (!MP_ACCESS_TOKEN) return res.status(503).json({ message: "Mercado Pago no configurado." });

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!paymentRes.ok) {
      return res.status(404).json({ message: "Pago no encontrado en Mercado Pago." });
    }

    const payment = await paymentRes.json();
    const estadoPago = mapearEstadoMP(payment.status);

    let idReserva = null;
    if (payment.external_reference) {
      const parsed = parseInt(payment.external_reference, 10);
      idReserva = Number.isNaN(parsed) ? null : parsed;
    }

    const autorizacion = await assertPuedeConsultarPagoMp(req.usuario, idReserva);
    if (!autorizacion.ok) {
      return res.status(autorizacion.status).json({ message: autorizacion.message });
    }

    if (idReserva != null) {
      await persistirPagoMercadoPago(payment, paymentId);
    }

    res.json({ estadoPago });
  } catch (error) {
    console.error("Error al verificar pago MP:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

export const obtenerEstadoPago = async (req, res) => {
  try {
    const idReserva = parseInt(req.params.idReserva, 10);
    if (Number.isNaN(idReserva)) {
      return res.status(400).json({ message: "idReserva inválido." });
    }

    const u = req.usuario;
    const staff = u?.rol === "admin" || u?.rol === "staff";
    const cliente = u?.rol === "cliente" || u?.tipo === "cliente";

    if (!staff && !cliente) {
      return res.status(403).json({ message: "No autorizado a consultar el estado de pago." });
    }

    if (cliente && !staff) {
      const tokenDni = u.dni != null ? String(u.dni).trim() : "";
      const { rows: reservaRows } = await pool.query(
        'SELECT "DNI" FROM "Reservas" WHERE "idReserva" = $1',
        [idReserva]
      );
      if (reservaRows.length === 0) {
        return res.status(404).json({ message: "Reserva no encontrada." });
      }
      const resDni = reservaRows[0].DNI != null ? String(reservaRows[0].DNI).trim() : "";
      if (!tokenDni || resDni !== tokenDni) {
        return res.status(403).json({ message: "No podés consultar el pago de una reserva que no es tuya." });
      }
    }

    const { rows } = await pool.query(`SELECT * FROM "Transaccion" WHERE "idReserva" = $1`, [idReserva]);
    if (rows.length === 0) return res.status(404).json({ message: "No hay transaccion para esta reserva." });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener estado de pago:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};
