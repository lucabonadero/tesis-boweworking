/**
 * Acceso a datos del sistema de créditos.
 *
 * Cada función recibe `db`: el pool para lecturas sueltas, o un client de
 * transacción para las escrituras. Así el descuento de la reserva reutiliza
 * estas funciones dentro de su propia transacción.
 */

import { PESOS_POR_CREDITO_DEFECTO } from "../services/creditos.service.js";

const COLUMNAS_PAQUETE = `
  id, nombre, creditos, precio, descripcion, activo, created_at, actualizado_at
`;

/** pg devuelve NUMERIC como string: se normaliza para que el precio viaje como número. */
function conPrecioNumerico(fila) {
  if (!fila) return fila;
  return { ...fila, precio: Number.parseFloat(fila.precio) };
}

/**
 * Si la fila de config no existe se cae a la misma constante que usa el
 * servicio: un valor distinto acá haría que la reserva cueste otra cantidad de
 * créditos que la cotización, sin que nada falle a la vista.
 */
export async function obtenerPesosPorCredito(db) {
  const { rows } = await db.query(
    "SELECT pesos_por_credito FROM creditos_config WHERE id = 1"
  );
  if (rows.length === 0) return PESOS_POR_CREDITO_DEFECTO;

  const tasa = Number.parseFloat(rows[0].pesos_por_credito);
  return Number.isFinite(tasa) && tasa > 0 ? tasa : PESOS_POR_CREDITO_DEFECTO;
}

/** Un usuario sin fila todavía tiene saldo 0. */
export async function obtenerSaldo(db, clienteUsuarioId) {
  const { rows } = await db.query(
    "SELECT saldo, actualizado_at FROM creditos_saldo WHERE cliente_usuario_id = $1",
    [clienteUsuarioId]
  );
  if (rows.length === 0) return { saldo: 0, actualizadoAt: null };
  return { saldo: Number(rows[0].saldo), actualizadoAt: rows[0].actualizado_at };
}

/**
 * Bloquea la fila de saldo y devuelve el saldo vigente.
 *
 * DEBE llamarse dentro de una transacción: el FOR UPDATE se sostiene hasta el
 * COMMIT. Es lo que impide que dos reservas simultáneas del mismo usuario lean
 * el mismo saldo y lo sobregiren. El ON CONFLICT crea la fila la primera vez
 * sin fallar si otra transacción la creó en el intervalo.
 */
export async function bloquearSaldo(db, clienteUsuarioId) {
  await db.query(
    `INSERT INTO creditos_saldo (cliente_usuario_id, saldo)
     VALUES ($1, 0)
     ON CONFLICT (cliente_usuario_id) DO NOTHING`,
    [clienteUsuarioId]
  );

  const { rows } = await db.query(
    "SELECT saldo FROM creditos_saldo WHERE cliente_usuario_id = $1 FOR UPDATE",
    [clienteUsuarioId]
  );
  return Number(rows[0].saldo);
}

/**
 * Escribe el nuevo saldo e inserta la fila del libro. Las dos escrituras van
 * juntas: el libro nunca puede quedar desfasado del saldo.
 */
export async function aplicarMovimiento(
  db,
  {
    clienteUsuarioId,
    tipo,
    cantidad,
    saldoPosterior,
    motivo = null,
    idReserva = null,
    compraId = null,
    adminUsuarioId = null,
  }
) {
  await db.query(
    `UPDATE creditos_saldo
     SET saldo = $2, actualizado_at = NOW()
     WHERE cliente_usuario_id = $1`,
    [clienteUsuarioId, saldoPosterior]
  );

  const { rows } = await db.query(
    `INSERT INTO creditos_movimiento (
       cliente_usuario_id, tipo, cantidad, saldo_posterior,
       motivo, id_reserva, compra_id, admin_usuario_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [clienteUsuarioId, tipo, cantidad, saldoPosterior, motivo, idReserva, compraId, adminUsuarioId]
  );
  return rows[0];
}

export async function listarMovimientos(db, clienteUsuarioId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT id, tipo, cantidad, saldo_posterior, motivo,
            id_reserva, compra_id, created_at
     FROM creditos_movimiento
     WHERE cliente_usuario_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [clienteUsuarioId, limit, offset]
  );

  const { rows: conteo } = await db.query(
    "SELECT COUNT(*) AS total FROM creditos_movimiento WHERE cliente_usuario_id = $1",
    [clienteUsuarioId]
  );

  return { movimientos: rows, total: Number.parseInt(conteo[0].total, 10) };
}

export async function listarPaquetes(db, { soloActivos = false } = {}) {
  const filtro = soloActivos ? "WHERE activo = TRUE" : "";
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_PAQUETE}
     FROM creditos_paquete
     ${filtro}
     ORDER BY creditos ASC, id ASC`
  );
  return rows.map(conPrecioNumerico);
}

export async function obtenerPaquete(db, id) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_PAQUETE} FROM creditos_paquete WHERE id = $1`,
    [id]
  );
  return conPrecioNumerico(rows[0] ?? null);
}

export async function crearPaquete(db, { nombre, creditos, precio, descripcion }) {
  const { rows } = await db.query(
    `INSERT INTO creditos_paquete (nombre, creditos, precio, descripcion)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNAS_PAQUETE}`,
    [nombre, creditos, precio, descripcion]
  );
  return conPrecioNumerico(rows[0]);
}

/** `activo` permite reactivar un paquete dado de baja. Null si el id no existe. */
export async function actualizarPaquete(db, id, { nombre, creditos, precio, descripcion, activo }) {
  const { rows } = await db.query(
    `UPDATE creditos_paquete
     SET nombre = $2, creditos = $3, precio = $4, descripcion = $5,
         activo = COALESCE($6, activo), actualizado_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNAS_PAQUETE}`,
    [id, nombre, creditos, precio, descripcion, activo ?? null]
  );
  return conPrecioNumerico(rows[0] ?? null);
}

/**
 * Baja lógica. Nunca DELETE: las compras históricas referencian la fila y el
 * administrador necesita seguir viendo qué paquete se compró.
 */
export async function desactivarPaquete(db, id) {
  const { rows } = await db.query(
    `UPDATE creditos_paquete
     SET activo = FALSE, actualizado_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNAS_PAQUETE}`,
    [id]
  );
  return conPrecioNumerico(rows[0] ?? null);
}

/**
 * Los créditos y el precio se copian del paquete: si el admin lo edita después,
 * la compra conserva lo que el cliente realmente pagó.
 */
export async function crearCompra(db, { clienteUsuarioId, paqueteId, creditos, precio }) {
  const { rows } = await db.query(
    `INSERT INTO creditos_compra (cliente_usuario_id, paquete_id, creditos, precio)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clienteUsuarioId, paqueteId, creditos, precio]
  );
  return conPrecioNumerico(rows[0]);
}

export async function guardarPreferenciaCompra(db, compraId, mpPreferenceId) {
  await db.query(
    "UPDATE creditos_compra SET mp_preference_id = $2 WHERE id = $1",
    [compraId, mpPreferenceId]
  );
}

/** DEBE usarse dentro de una transacción: sostiene el lock hasta el COMMIT. */
export async function bloquearCompra(db, compraId) {
  const { rows } = await db.query(
    "SELECT * FROM creditos_compra WHERE id = $1 FOR UPDATE",
    [compraId]
  );
  return conPrecioNumerico(rows[0] ?? null);
}

export async function marcarCompraAcreditada(db, compraId, mpPaymentId) {
  await db.query(
    `UPDATE creditos_compra
     SET estado = 'acreditada', mp_payment_id = $2, acreditada_at = NOW()
     WHERE id = $1`,
    [compraId, mpPaymentId]
  );
}

export async function marcarCompraRechazada(db, compraId, mpPaymentId) {
  await db.query(
    `UPDATE creditos_compra
     SET estado = 'rechazada', mp_payment_id = $2
     WHERE id = $1`,
    [compraId, mpPaymentId]
  );
}

export async function obtenerCompra(db, compraId) {
  const { rows } = await db.query("SELECT * FROM creditos_compra WHERE id = $1", [compraId]);
  return conPrecioNumerico(rows[0] ?? null);
}

/**
 * Créditos netos que la reserva todavía tiene consumidos (RF11 - RF13).
 *
 * Suma los descuentos y resta los reintegros ya emitidos, para que una segunda
 * cancelación no vuelva a devolver lo mismo. El movimiento del grupo se ancla a
 * una sola reserva, así que se consultan todos los ids del grupo.
 */
export async function creditosConsumidosPorReserva(db, idsReserva) {
  const ids = Array.isArray(idsReserva) ? idsReserva : [idsReserva];
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'descuento_reserva' THEN -cantidad ELSE 0 END), 0) AS descontados,
       COALESCE(SUM(CASE WHEN tipo = 'reintegro_cancelacion' THEN cantidad ELSE 0 END), 0) AS reintegrados
     FROM creditos_movimiento
     WHERE id_reserva = ANY($1::int[])`,
    [ids]
  );
  const descontados = Number(rows[0]?.descontados ?? 0);
  const reintegrados = Number(rows[0]?.reintegrados ?? 0);
  return { descontados, reintegrados, disponibles: Math.max(0, descontados - reintegrados) };
}

/* ── Panel financiero ─────────────────────────────────────────────
 * El ingreso real del coworking son las compras de paquetes acreditadas.
 * Las reservas descuentan saldo ya pagado, así que no se suman acá.
 */

/** Solo 'acreditada' es plata cobrada: las pendientes son checkouts sin completar. */
const SQL_COMPRA_ACREDITADA = `cc.estado = 'acreditada'`;

/**
 * Un cobro presencial mal cargado se revierte a 'anulada': sale del total de
 * ingresos, pero el panel igual lo informa para que un reverso no sea un hueco
 * silencioso en la caja.
 */
const SQL_COMPRA_ANULADA = `cc.estado = 'anulada'`;

/**
 * Totales del panel. `paquetesVendidos` y los conteos no son sensibles;
 * el llamador decide si expone además los montos (solo propietarios).
 */
export async function resumenFinancieroCreditos(db) {
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${SQL_COMPRA_ACREDITADA})::int          AS paquetes_vendidos,
      COUNT(*) FILTER (WHERE cc.estado = 'pendiente')::int           AS compras_pendientes,
      COUNT(DISTINCT cc.cliente_usuario_id)
        FILTER (WHERE ${SQL_COMPRA_ACREDITADA})::int                 AS compradores,
      COALESCE(SUM(cc.creditos) FILTER (WHERE ${SQL_COMPRA_ACREDITADA}), 0)::int AS creditos_vendidos,
      COALESCE(SUM(cc.precio) FILTER (WHERE ${SQL_COMPRA_ACREDITADA}), 0)::numeric AS total_ingresos,
      COALESCE(SUM(cc.precio) FILTER (
        WHERE ${SQL_COMPRA_ACREDITADA} AND cc.acreditada_at::date = CURRENT_DATE
      ), 0)::numeric AS ingresos_hoy,
      COUNT(*) FILTER (
        WHERE ${SQL_COMPRA_ACREDITADA} AND cc.acreditada_at::date = CURRENT_DATE
      )::int AS ventas_hoy,
      COUNT(*) FILTER (WHERE ${SQL_COMPRA_ANULADA})::int AS compras_anuladas,
      COALESCE(SUM(cc.creditos) FILTER (WHERE ${SQL_COMPRA_ANULADA}), 0)::int AS creditos_anulados,
      COALESCE(SUM(cc.precio) FILTER (WHERE ${SQL_COMPRA_ANULADA}), 0)::numeric AS total_anulado
    FROM creditos_compra cc
  `);

  const f = rows[0] ?? {};
  return {
    paquetesVendidos: f.paquetes_vendidos ?? 0,
    comprasPendientes: f.compras_pendientes ?? 0,
    compradores: f.compradores ?? 0,
    creditosVendidos: f.creditos_vendidos ?? 0,
    ventasHoy: f.ventas_hoy ?? 0,
    comprasAnuladas: f.compras_anuladas ?? 0,
    creditosAnulados: f.creditos_anulados ?? 0,
    totalIngresos: Number.parseFloat(f.total_ingresos) || 0,
    ingresosHoy: Number.parseFloat(f.ingresos_hoy) || 0,
    totalAnulado: Number.parseFloat(f.total_anulado) || 0,
  };
}

/** Ingreso por día, para el gráfico. Se agrupa por fecha de acreditación (caja real). */
export async function ingresosPorDiaCreditos(db, { dias = 30 } = {}) {
  const { rows } = await db.query(
    `SELECT
       cc.acreditada_at::date            AS fecha,
       COUNT(*)::int                     AS ventas,
       COALESCE(SUM(cc.precio), 0)::numeric AS monto
     FROM creditos_compra cc
     WHERE ${SQL_COMPRA_ACREDITADA}
       AND cc.acreditada_at >= CURRENT_DATE - ($1::int - 1)
     GROUP BY 1
     ORDER BY 1 ASC`,
    [dias]
  );
  return rows.map((r) => ({
    fecha: r.fecha,
    ventas: r.ventas,
    monto: Number.parseFloat(r.monto) || 0,
  }));
}

/**
 * Listado de compras con quién compró y qué paquete.
 *
 * El conteo comparte el FROM con la consulta de filas: la búsqueda por texto
 * pega contra las tablas unidas, así que un COUNT sin los JOIN daría un total
 * distinto al de la página y la paginación quedaría descolgada.
 */
export async function listarComprasCreditos(
  db,
  { limit = 20, offset = 0, estado, desde, hasta, busqueda } = {}
) {
  const cond = [];
  const params = [];

  if (estado) {
    params.push(estado);
    cond.push(`cc.estado = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    cond.push(`COALESCE(cc.acreditada_at, cc.created_at) >= $${params.length}::date`);
  }
  if (hasta) {
    params.push(hasta);
    cond.push(`COALESCE(cc.acreditada_at, cc.created_at) < ($${params.length}::date + 1)`);
  }
  if (busqueda) {
    params.push(`%${busqueda}%`);
    const i = params.length;
    cond.push(`(
      cu.nombre ILIKE $${i} OR cu.apellido ILIKE $${i} OR cu.email ILIKE $${i}
      OR cu.dni ILIKE $${i} OR cp.nombre ILIKE $${i}
    )`);
  }

  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const desde_ = `
    FROM creditos_compra cc
    LEFT JOIN "ClienteUsuario" cu ON cu.id = cc.cliente_usuario_id
    LEFT JOIN creditos_paquete cp ON cp.id = cc.paquete_id
  `;

  const { rows: conteo } = await db.query(
    `SELECT COUNT(*)::int AS c ${desde_} ${where}`,
    params
  );

  const { rows } = await db.query(
    `SELECT
       cc.id, cc.creditos, cc.precio, cc.estado,
       cc.created_at, cc.acreditada_at, cc.mp_payment_id, cc.mp_preference_id,
       cc.origen, cc.metodo_pago, cc.anulada_at,
       cu.id AS cliente_id, cu.email AS cliente_email, cu.dni AS cliente_dni,
       TRIM(CONCAT_WS(' ', cu.nombre, cu.apellido)) AS cliente_nombre,
       cp.nombre AS paquete_nombre
     ${desde_}
     ${where}
     ORDER BY COALESCE(cc.acreditada_at, cc.created_at) DESC, cc.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    items: rows.map((r) => ({ ...r, precio: Number.parseFloat(r.precio) || 0 })),
    total: conteo[0]?.c ?? 0,
  };
}

/* ── Compras presenciales ────────────────────────────────────────
 * El coworking también vende paquetes en mostrador. Son ingreso real, así que
 * viven en creditos_compra junto a las de Mercado Pago, distinguidas por
 * `origen` para poder auditar quién las cargó.
 */

/** Nace acreditada: la plata ya está en la caja cuando el staff la registra. */
export async function crearCompraPresencial(
  db,
  { clienteUsuarioId, paqueteId, creditos, precio, metodoPago, registradaPorUsuarioId }
) {
  const { rows } = await db.query(
    `INSERT INTO creditos_compra (
       cliente_usuario_id, paquete_id, creditos, precio,
       estado, origen, metodo_pago, registrada_por_usuario_id, acreditada_at
     ) VALUES ($1, $2, $3, $4, 'acreditada', 'presencial', $5, $6, NOW())
     RETURNING *`,
    [clienteUsuarioId, paqueteId, creditos, precio, metodoPago, registradaPorUsuarioId]
  );
  return conPrecioNumerico(rows[0]);
}

/**
 * Anula una compra presencial mal cargada. No se borra la fila: queda el
 * rastro de qué se anuló y quién lo hizo.
 */
export async function anularCompraPresencial(db, compraId, anuladaPorUsuarioId) {
  const { rows } = await db.query(
    `UPDATE creditos_compra
     SET estado = 'anulada', anulada_at = NOW(), anulada_por_usuario_id = $2
     WHERE id = $1
     RETURNING *`,
    [compraId, anuladaPorUsuarioId]
  );
  return conPrecioNumerico(rows[0] ?? null);
}
