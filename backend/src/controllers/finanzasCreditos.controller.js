import pool from "../config/db.js";
import {
  resumenFinancieroCreditos,
  ingresosPorDiaCreditos,
  listarComprasCreditos,
  crearCompraPresencial,
  anularCompraPresencial,
  obtenerPaquete,
  bloquearCompra,
  bloquearSaldo,
  aplicarMovimiento,
} from "../repositories/creditos.repository.js";

/**
 * Panel financiero sobre compras de paquetes de créditos.
 *
 * El ingreso del coworking entra por acá: las reservas descuentan saldo que ya
 * fue cobrado al comprar el paquete, así que sumarlas duplicaría la facturación.
 *
 * Privacidad (requisito de negocio): los montos son solo para los socios
 * propietarios, que en este sistema son exactamente los usuarios con rol
 * "admin". El staff con permiso ver_financiero ve los conteos, nunca la plata.
 */
export async function esPropietario(usuario) {
  if (!usuario || usuario.tipo === "cliente") return false;

  // El token dura 8h: si a un admin le bajan el rol, el JWT viejo seguiría
  // diciendo "admin". Para un dato sensible se relee la fila real.
  const { rows } = await pool.query("SELECT rol FROM usuarios WHERE id = $1", [usuario.id]);
  return rows[0]?.rol === "admin";
}

/**
 * Resuelve el rol una sola vez por request y lo deja en `req.esPropietario`.
 *
 * Sin esto cada handler repetía la misma consulta a `usuarios`, y los que
 * combinan resumen y listado la hacían después de ya haber leído las compras.
 * Se monta en el router, así que para cuando corre un handler el flag ya está.
 */
export const resolverPropietario = async (req, _res, next) => {
  try {
    req.esPropietario = await esPropietario(req.usuario);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Se filtran acá y no en el SQL para que el monto no salga nunca del servidor.
 *
 * `totalAnulado` también es plata: el staff ve cuántas compras se revirtieron,
 * nunca por cuánto.
 */
function sinMontos(resumen) {
  const { totalIngresos, ingresosHoy, totalAnulado, ...visible } = resumen;
  return { ...visible, montosOcultos: true };
}

/** GET /api/finanzas/creditos/resumen */
export const obtenerResumenFinanciero = async (req, res) => {
  try {
    const resumen = await resumenFinancieroCreditos(pool);
    const propietario = req.esPropietario;

    res.json({
      ...(propietario ? { ...resumen, montosOcultos: false } : sinMontos(resumen)),
      puedeVerMontos: propietario,
    });
  } catch (error) {
    console.error("Error al obtener el resumen financiero de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/finanzas/creditos/ingresos-por-dia — serie del gráfico, solo propietarios. */
export const obtenerIngresosPorDia = async (req, res) => {
  try {
    if (!req.esPropietario) {
      return res.status(403).json({
        message: "Solo los socios propietarios pueden ver los ingresos del coworking",
        codigo: "SOLO_PROPIETARIOS",
      });
    }

    const dias = Math.min(Math.max(Number.parseInt(req.query.dias, 10) || 30, 1), 365);
    res.json({ dias, serie: await ingresosPorDiaCreditos(pool, { dias }) });
  } catch (error) {
    console.error("Error al obtener los ingresos por día:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/finanzas/creditos/compras
 * El staff ve el detalle de qué se vendió; el precio de cada compra se omite
 * si no es propietario, para no reconstruir la facturación sumando filas.
 */
export const obtenerCompras = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const { estado, desde, hasta } = req.query;
    const busqueda = String(req.query.q ?? "").trim() || undefined;

    const { items, total } = await listarComprasCreditos(pool, {
      limit,
      offset,
      estado,
      desde,
      hasta,
      busqueda,
    });

    const propietario = req.esPropietario;
    const visibles = propietario
      ? items
      : items.map(({ precio, ...resto }) => resto);

    res.json({ items: visibles, total, limit, offset, puedeVerMontos: propietario });
  } catch (error) {
    console.error("Error al listar las compras de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* ── Cobro presencial de paquetes ──────────────────────────────── */

const METODOS_PRESENCIALES = ["Efectivo", "Transferencia", "QR", "Tarjeta"];

/**
 * POST /api/finanzas/creditos/compras/presencial
 *
 * Vende un paquete cobrado en mostrador: crea la compra ya acreditada y suma
 * los créditos al saldo del usuario en la misma transacción, para que no pueda
 * quedar plata registrada sin créditos entregados (ni al revés).
 */
export const registrarCompraPresencial = async (req, res) => {
  const { clienteUsuarioId, paqueteId, metodoPago } = req.body ?? {};

  if (!clienteUsuarioId || !paqueteId) {
    return res.status(400).json({ message: "Elegí el usuario y el paquete" });
  }
  if (!METODOS_PRESENCIALES.includes(metodoPago)) {
    return res.status(400).json({
      message: `Método de pago inválido. Usá uno de: ${METODOS_PRESENCIALES.join(", ")}`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: usuarios } = await client.query(
      'SELECT id FROM "ClienteUsuario" WHERE id = $1',
      [clienteUsuarioId]
    );
    if (usuarios.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "El usuario no existe" });
    }

    // El precio sale de la fila del paquete, nunca del navegador.
    const paquete = await obtenerPaquete(client, paqueteId);
    if (!paquete) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "El paquete no existe" });
    }
    if (!paquete.activo) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Ese paquete está dado de baja",
        codigo: "PAQUETE_NO_DISPONIBLE",
      });
    }

    const compra = await crearCompraPresencial(client, {
      clienteUsuarioId,
      paqueteId: paquete.id,
      creditos: paquete.creditos,
      precio: paquete.precio,
      metodoPago,
      registradaPorUsuarioId: req.usuario.id,
    });

    const saldoActual = await bloquearSaldo(client, clienteUsuarioId);
    const saldoPosterior = saldoActual + paquete.creditos;

    await aplicarMovimiento(client, {
      clienteUsuarioId,
      tipo: "compra_paquete",
      cantidad: paquete.creditos,
      saldoPosterior,
      motivo: `Compra presencial de ${paquete.creditos} créditos (${metodoPago})`,
      compraId: compra.id,
      adminUsuarioId: req.usuario.id,
    });

    await client.query("COMMIT");
    res.status(201).json({ compra, saldoPosterior });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    console.error("Error al registrar la compra presencial:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/finanzas/creditos/compras/:id
 *
 * Revierte un cobro presencial mal cargado: descuenta los créditos entregados
 * y marca la compra como anulada. Las compras de Mercado Pago no se tocan acá:
 * su reverso es un reembolso en la plataforma, no un borrado local.
 */
export const anularCompra = async (req, res) => {
  const compraId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(compraId)) {
    return res.status(400).json({ message: "Id de compra inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const compra = await bloquearCompra(client, compraId);
    if (!compra) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "La compra no existe" });
    }
    if (compra.origen !== "presencial") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Solo se pueden revertir los cobros presenciales. Una compra de Mercado Pago se reembolsa desde la plataforma.",
        codigo: "SOLO_PRESENCIAL",
      });
    }
    if (compra.estado !== "acreditada") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Esta compra ya no está acreditada",
        codigo: "ESTADO_INVALIDO",
      });
    }

    const saldoActual = await bloquearSaldo(client, compra.cliente_usuario_id);
    const saldoPosterior = saldoActual - compra.creditos;

    // Puede quedar negativo si el usuario ya gastó los créditos mal acreditados:
    // preferimos reflejar la deuda antes que perder el rastro de la reversión.
    await aplicarMovimiento(client, {
      clienteUsuarioId: compra.cliente_usuario_id,
      tipo: "ajuste_admin",
      cantidad: -compra.creditos,
      saldoPosterior,
      motivo: `Reversión de compra presencial #${compra.id}`,
      compraId: compra.id,
      adminUsuarioId: req.usuario.id,
    });

    const anulada = await anularCompraPresencial(client, compraId, req.usuario.id);

    await client.query("COMMIT");
    res.json({ compra: anulada, saldoPosterior });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    console.error("Error al anular la compra:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/**
 * GET /api/finanzas/creditos/clientes?q=...
 *
 * Buscador mínimo para elegir a quién se le vende un paquete en mostrador.
 * Vive acá y no en el módulo de usuarios porque quien cobra puede no tener
 * permiso de gestionar usuarios: devuelve solo lo justo para identificar a la
 * persona, sin datos de cuenta.
 */
export const buscarClientes = async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ items: [] });

  try {
    const { rows } = await pool.query(
      `SELECT id, email, dni,
              TRIM(CONCAT_WS(' ', nombre, apellido)) AS nombre
       FROM "ClienteUsuario"
       WHERE estado_cuenta IS DISTINCT FROM 'bloqueado'
         AND (nombre ILIKE $1 OR apellido ILIKE $1 OR email ILIKE $1 OR dni ILIKE $1)
       ORDER BY nombre NULLS LAST
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json({ items: rows });
  } catch (error) {
    console.error("Error al buscar clientes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
