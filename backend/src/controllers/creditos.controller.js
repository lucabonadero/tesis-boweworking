import pool from "../config/db.js";
import { creditosParaMontos, referenciaCompra } from "../services/creditos.service.js";
import {
  obtenerSaldo,
  obtenerPesosPorCredito,
  listarMovimientos,
  listarPaquetes,
  obtenerPaquete,
  crearCompra,
  guardarPreferenciaCompra,
} from "../repositories/creditos.repository.js";

/** El staff no tiene saldo propio: los créditos son del usuario final. */
function exigirCliente(req, res) {
  if (req.usuario?.tipo !== "cliente") {
    res.status(403).json({
      message: "Los créditos son de las cuentas de usuario, no del personal",
      codigo: "SIN_CUENTA_DE_CREDITOS",
    });
    return false;
  }
  return true;
}

/** GET /api/creditos/saldo (RF10) */
export const obtenerMiSaldo = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const [{ saldo, actualizadoAt }, pesosPorCredito] = await Promise.all([
      obtenerSaldo(pool, req.usuario.id),
      obtenerPesosPorCredito(pool),
    ]);

    res.json({ saldo, pesosPorCredito, actualizadoAt });
  } catch (error) {
    console.error("Error al obtener el saldo de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/creditos/movimientos (RF06) */
export const obtenerMisMovimientos = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const { limit, offset } = req.query;
    const { movimientos, total } = await listarMovimientos(pool, req.usuario.id, { limit, offset });

    res.json({ movimientos, total, limit, offset });
  } catch (error) {
    console.error("Error al listar los movimientos de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/creditos/paquetes — los que se ofrecen en el pop-up de compra. */
export const obtenerPaquetesActivos = async (_req, res) => {
  try {
    const paquetes = await listarPaquetes(pool, { soloActivos: true });
    res.json({ paquetes });
  } catch (error) {
    console.error("Error al listar los paquetes de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** Precio por hora de un recurso, ya resuelto contra su fila. */
async function precioRecurso(idRecurso, tipoReserva, minutos) {
  const { rows } = await pool.query(
    'SELECT "PrecioHora", "PrecioSemanal", "PrecioMensual" FROM "Recursos" WHERE "idRecurso" = $1',
    [idRecurso]
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  if (tipoReserva === "semanal") return Number.parseFloat(r.PrecioSemanal) || 0;
  if (tipoReserva === "mensual") return Number.parseFloat(r.PrecioMensual) || 0;

  const precioHora = Number.parseFloat(r.PrecioHora) || 0;
  return precioHora * (minutos / 60);
}

function minutosEntre(horaIni, horaFin) {
  const aMin = (h) => {
    const [hh, mm] = String(h ?? "").split(":").map(Number);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  const ini = aMin(horaIni);
  const fin = aMin(horaFin);
  if (ini == null || fin == null || fin <= ini) return 0;
  return fin - ini;
}

/**
 * POST /api/creditos/cotizar
 * Costo en créditos de la selección actual, para mostrarlo antes de reservar.
 * No reserva ni bloquea nada.
 */
export const cotizarReserva = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const { items, HorarioReserva, HorarioFin, TipoReserva } = req.body;
    const minutos = TipoReserva === "turno" ? minutosEntre(HorarioReserva, HorarioFin) : 0;

    if (TipoReserva === "turno" && minutos <= 0) {
      return res.status(400).json({ message: "El horario de inicio y fin no es válido" });
    }

    const montos = [];
    for (const item of items) {
      const monto = await precioRecurso(item.idRecurso, TipoReserva, minutos);
      if (monto === null) {
        return res.status(404).json({ message: `Recurso ${item.idRecurso} no encontrado` });
      }
      montos.push(monto);
    }

    const [pesosPorCredito, { saldo }] = await Promise.all([
      obtenerPesosPorCredito(pool),
      obtenerSaldo(pool, req.usuario.id),
    ]);

    const creditosNecesarios = creditosParaMontos(montos, pesosPorCredito);
    const montoEnPesos = montos.reduce((acc, m) => acc + m, 0);

    res.json({
      creditosNecesarios,
      montoEnPesos: Math.round(montoEnPesos * 100) / 100,
      saldo,
      alcanza: saldo >= creditosNecesarios,
      creditosFaltantes: Math.max(0, creditosNecesarios - saldo),
      pesosPorCredito,
    });
  } catch (error) {
    console.error("Error al cotizar la reserva en créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * POST /api/creditos/comprar
 * Crea la compra y su preferencia de Mercado Pago (RF09).
 *
 * El cliente solo manda el id del paquete: el precio sale de la fila leída acá,
 * nunca del navegador.
 */
export const comprarCreditos = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(503).json({ message: "Mercado Pago no está configurado en el servidor" });
  }

  try {
    const paquete = await obtenerPaquete(pool, req.body.paqueteId);
    if (!paquete || !paquete.activo) {
      return res.status(404).json({ message: "Paquete no disponible", codigo: "PAQUETE_NO_DISPONIBLE" });
    }

    const precio = Number.parseFloat(paquete.precio);
    if (!(precio > 0)) {
      return res.status(400).json({
        message: "Este paquete no tiene precio de venta. Pedile al coworking que lo acredite manualmente.",
        codigo: "PAQUETE_SIN_PRECIO",
      });
    }

    const compra = await crearCompra(pool, {
      clienteUsuarioId: req.usuario.id,
      paqueteId: paquete.id,
      creditos: paquete.creditos,
      precio,
    });

    const frontend = (process.env.FRONTEND_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
    const backend = (
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
    ).trim().replace(/\/+$/, "");
    const vuelta = `${frontend}/pago/confirmacion?compra=${compra.id}`;

    const preferencia = {
      items: [
        {
          title: `${paquete.creditos} créditos - ${paquete.nombre}`,
          quantity: 1,
          unit_price: precio,
          currency_id: "ARS",
        },
      ],
      external_reference: referenciaCompra(compra.id),
      back_urls: {
        success: vuelta,
        failure: `${vuelta}&resultado=error`,
        pending: `${vuelta}&resultado=pendiente`,
      },
      ...(vuelta.startsWith("https://") ? { auto_return: "approved" } : {}),
      notification_url: `${backend}/api/pagos/webhook`,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferencia),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("Error de Mercado Pago al crear la preferencia de créditos:", mpData);
      return res.status(502).json({ message: "No pudimos iniciar el pago", detail: mpData.message });
    }

    await guardarPreferenciaCompra(pool, compra.id, mpData.id);

    res.status(201).json({
      compraId: compra.id,
      creditos: paquete.creditos,
      precio,
      preferenceId: mpData.id,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
    });
  } catch (error) {
    console.error("Error al iniciar la compra de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
