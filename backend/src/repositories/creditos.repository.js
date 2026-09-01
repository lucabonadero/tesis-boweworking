/**
 * Acceso a datos del sistema de créditos.
 *
 * Cada función recibe `db`: el pool para lecturas sueltas, o un client de
 * transacción para las escrituras. Así el descuento de la reserva reutiliza
 * estas funciones dentro de su propia transacción.
 */

const COLUMNAS_PAQUETE = `
  id, nombre, creditos, precio, descripcion, activo, created_at, actualizado_at
`;

/** pg devuelve NUMERIC como string: se normaliza para que el precio viaje como número. */
function conPrecioNumerico(fila) {
  if (!fila) return fila;
  return { ...fila, precio: Number.parseFloat(fila.precio) };
}

export async function obtenerPesosPorCredito(db) {
  const { rows } = await db.query(
    "SELECT pesos_por_credito FROM creditos_config WHERE id = 1"
  );
  if (rows.length === 0) return 100;
  return Number.parseFloat(rows[0].pesos_por_credito);
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
