import pool from "../config/db.js";
import {
  validarVentanaOperativaTurno,
  validarDiaReservaNoEnElPasado,
  validarInicioTurnoNoEnElPasado,
  validarRecepcionNoAnticipada,
} from "../services/coworkingHours.service.js";
import { bloquearEspaciosDeRecursos } from "../services/reservaConcurrency.service.js";
import { mensajeTurnoNoDisponibleParaRecurso } from "../services/reservaRules.service.js";
import { enviarConfirmacionReservaEnBackground } from "../services/reservaConfirmacionMail.service.js";
import { parsePagination } from "../utils/pagination.js";
import {
  horariosParaReservaTurno,
  formatearHoraParaApi,
  serializarHorariosReservaEnFila,
  serializarHorariosReservaEnFilas,
} from "../services/horarioReserva.service.js";
import { enriquecerFilaConMutacion, evaluarMutacionReserva } from "../services/reservaMutability.service.js";

function esStaff(usuario) {
  return usuario?.rol === "admin" || usuario?.rol === "empleado";
}

function esCliente(usuario) {
  return usuario?.rol === "cliente" || usuario?.tipo === "cliente";
}

/** Staff o titular (DNI) de la reserva. */
function puedeOperarReserva(usuario, rowReserva) {
  if (esStaff(usuario)) return true;
  if (!esCliente(usuario)) return false;
  const tokenDni = usuario.dni != null ? String(usuario.dni).trim() : "";
  const resDni = rowReserva.DNI != null ? String(rowReserva.DNI).trim() : "";
  return Boolean(tokenDni && resDni && tokenDni === resDni);
}

/** Titular para INSERT: staff usa body; cliente usa ClienteUsuario por req.usuario.id. */
async function resolverTitularReserva(req, res) {
  const u = req.usuario;
  if (esStaff(u)) {
    const { DNI, Nombre } = req.body;
    if (!DNI || !Nombre) {
      res.status(400).json({ message: "DNI y nombre del titular son obligatorios." });
      return null;
    }
    return { dni: String(DNI).trim(), nombre: String(Nombre).trim() };
  }
  if (!esCliente(u)) {
    res.status(403).json({ message: "No autorizado a crear reservas con esta cuenta." });
    return null;
  }
  const { rows } = await pool.query(
    'SELECT nombre, apellido, dni, perfil_completo FROM "ClienteUsuario" WHERE id = $1',
    [u.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ message: "Usuario no encontrado." });
    return null;
  }
  const row = rows[0];
  const dniDb = row.dni != null ? String(row.dni).trim() : "";
  if (!dniDb || !row.perfil_completo) {
    res.status(403).json({ message: "Completá tu perfil con DNI para poder reservar." });
    return null;
  }
  if (req.body.DNI != null && String(req.body.DNI).trim() !== "" && String(req.body.DNI).trim() !== dniDb) {
    res.status(403).json({ message: "No podés reservar usando un DNI distinto al de tu cuenta." });
    return null;
  }
  const nombre = `${row.nombre || ""} ${row.apellido || ""}`.trim() || "Cliente";
  return { dni: dniDb, nombre };
}

async function esGrupo(db, idRecurso) {
  const { rows } = await db.query(
    'SELECT COUNT(*) AS n FROM "Recursos" WHERE "idRecursoPadre" = $1',
    [idRecurso]
  );
  return parseInt(rows[0].n) > 0;
}

/**
 * Universal overlap check: does a NEW reservation conflict with EXISTING ones?
 *
 * Existing reservations can be turno, semanal, or mensual.
 * The new reservation defines its "shadow" on the calendar:
 *   - turno:   single day + time range
 *   - semanal: DiaReserva .. DiaReserva+6  (all day)
 *   - mensual: DiaReserva .. DiaReserva+29 (all day)
 *
 * An existing reservation casts its own shadow. Two shadows conflict when
 * their date ranges overlap AND (if both are turnos on the same day) their
 * time ranges overlap.
 */
function conflictSQL(extraRecursoWhere, excludeId) {
  const ex = excludeId ? `AND res."idReserva" != ${parseInt(excludeId)}` : "";
  return `
    SELECT COUNT(*) AS n
    FROM "Reservas" res
    ${extraRecursoWhere ? 'JOIN "Recursos" rec ON res."idRecurso" = rec."idRecurso"' : ""}
    WHERE ${extraRecursoWhere || 'res."idRecurso" = $p_recurso'}
    ${ex}
    AND (
      (
        COALESCE(res."TipoReserva",'turno') = 'turno'
        AND (
          CASE $p_tipo
            WHEN 'turno' THEN
              res."DiaReserva" = $p_fecha::DATE
              AND res."HorarioReserva"::TIME < $p_horaFin::TIME
              AND res."HorarioFin"::TIME     > $p_horaIni::TIME
            ELSE
              res."DiaReserva" BETWEEN $p_fecha::DATE AND ($p_fecha::DATE + $p_dias::INT)
          END
        )
      )
      OR
      (
        res."TipoReserva" = 'semanal'
        AND (
          CASE $p_tipo
            WHEN 'turno' THEN
              $p_fecha::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 6)
            ELSE
              res."DiaReserva" <= ($p_fecha::DATE + $p_dias::INT)
              AND (res."DiaReserva"::DATE + 6) >= $p_fecha::DATE
          END
        )
      )
      OR
      (
        res."TipoReserva" = 'mensual'
        AND (
          CASE $p_tipo
            WHEN 'turno' THEN
              $p_fecha::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 29)
            ELSE
              res."DiaReserva" <= ($p_fecha::DATE + $p_dias::INT)
              AND (res."DiaReserva"::DATE + 29) >= $p_fecha::DATE
          END
        )
      )
    )
  `;
}

function packDays(tipo) {
  if (tipo === "semanal") return 6;
  if (tipo === "mensual") return 29;
  return 0;
}

/**
 * Debe ejecutarse en la misma conexión/transacción que el INSERT/UPDATE de la reserva,
 * después de bloquearEspaciosDeRecursos(), para que el COUNT sobre "Reservas" no corra
 * en paralelo con otro commit del mismo espacio (ver reservaConcurrency.service.js).
 */
async function verificarConflictos(db, idRecurso, DiaReserva, HorarioReserva, HorarioFin, TipoReserva, excludeReservaId) {
  const tipo = TipoReserva || "turno";
  const recursoRes = await db.query('SELECT * FROM "Recursos" WHERE "idRecurso" = $1', [idRecurso]);
  if (recursoRes.rows.length === 0) return "Recurso no encontrado.";
  const recurso = recursoRes.rows[0];

  if (await esGrupo(db, idRecurso)) {
    return "Este recurso es un grupo. Elegí un recurso específico dentro del grupo.";
  }

  const dias = packDays(tipo);
  const horaIni = tipo === "turno" ? HorarioReserva : "00:00";
  const horaFin = tipo === "turno" ? HorarioFin : "23:59";
  const ex = excludeReservaId || null;

  const baseParams = {
    $p_tipo: tipo,
    $p_fecha: DiaReserva,
    $p_dias: dias,
    $p_horaIni: horaIni,
    $p_horaFin: horaFin,
  };

  const bind = (sql, extra) => {
    let s = sql;
    const vals = [];
    let i = 1;
    const map = { ...baseParams, ...extra };
    for (const [k, v] of Object.entries(map)) {
      s = s.replaceAll(k, `$${i}`);
      vals.push(v);
      i++;
    }
    return { text: s, vals };
  };

  // Direct conflict on the same resource
  const q1 = bind(
    conflictSQL(null, ex),
    { $p_recurso: idRecurso }
  );
  const r1 = await db.query(q1.text, q1.vals);
  if (parseInt(r1.rows[0].n) > 0) {
    return "Este recurso ya está reservado en ese período.";
  }

  // "Completo" logic
  if (recurso.esCompleto) {
    if (recurso.idRecursoPadre) {
      const q = bind(
        conflictSQL(`rec."idRecursoPadre" = $p_padre AND rec."esCompleto" = false`, ex),
        { $p_padre: recurso.idRecursoPadre }
      );
      const r = await db.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "No se puede reservar completo: hay recursos individuales reservados en ese período.";
    } else {
      const q = bind(
        conflictSQL(`rec."idEspacio" = $p_esp AND rec."idRecurso" != $p_self`, ex),
        { $p_esp: recurso.idEspacio, $p_self: idRecurso }
      );
      const r = await db.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "No se puede reservar el espacio completo: hay recursos individuales reservados en ese período.";
    }
  } else {
    if (recurso.idRecursoPadre) {
      const q = bind(
        conflictSQL(`rec."idRecursoPadre" = $p_padre AND rec."esCompleto" = true`, ex),
        { $p_padre: recurso.idRecursoPadre }
      );
      const r = await db.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "El grupo completo ya está reservado en ese período.";
    }
    const q = bind(
      conflictSQL(`rec."idEspacio" = $p_esp AND rec."esCompleto" = true AND rec."idRecursoPadre" IS NULL`, ex),
      { $p_esp: recurso.idEspacio }
    );
    const r = await db.query(q.text, q.vals);
    if (parseInt(r.rows[0].n) > 0)
      return "El espacio completo ya está reservado en ese período.";
  }

  return null;
}

/** Filtros opcionales para listados admin (búsqueda, espacio, fechas, día calendario afectado). */
function buildReservasAdminFilters(query) {
  const conditions = [];
  const params = [];
  let i = 1;

  const qRaw = query.q ?? query.search;
  if (qRaw != null && String(qRaw).trim() !== "") {
    const term = `%${String(qRaw).trim()}%`;
    conditions.push(
      `(r."Nombre" ILIKE $${i} OR r."DNI"::text ILIKE $${i} OR COALESCE(c."Nombre",'') ILIKE $${i} OR COALESCE(c."Apellido",'') ILIKE $${i} OR COALESCE(rec."Nombre",'') ILIKE $${i} OR COALESCE(e."Nombre",'') ILIKE $${i})`
    );
    params.push(term);
    i++;
  }

  const espacio = query.espacio;
  if (espacio != null && String(espacio).trim() !== "" && String(espacio) !== "Todos") {
    conditions.push(`e."Nombre" = $${i}`);
    params.push(String(espacio).trim());
    i++;
  }

  const estado = query.estado;
  if (estado != null && String(estado).trim() !== "" && String(estado) !== "Todos") {
    conditions.push(`COALESCE(r."Estado",'activa') = $${i}`);
    params.push(String(estado).trim());
    i++;
  }

  if (query.desde) {
    conditions.push(`r."DiaReserva" >= $${i}::date`);
    params.push(query.desde);
    i++;
  }

  if (query.hasta) {
    conditions.push(`r."DiaReserva" <= $${i}::date`);
    params.push(query.hasta);
    i++;
  }

  if (query.afectaDia) {
    conditions.push(`(
      (COALESCE(r."TipoReserva",'turno') = 'turno' AND r."DiaReserva" = $${i}::date)
      OR (r."TipoReserva" = 'semanal' AND $${i}::date BETWEEN r."DiaReserva" AND (r."DiaReserva"::date + 6))
      OR (r."TipoReserva" = 'mensual' AND $${i}::date BETWEEN r."DiaReserva" AND (r."DiaReserva"::date + 29))
    )`);
    params.push(query.afectaDia);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params, nextParamIndex: i };
}

async function calcularMonto(idRecurso, tipo, horaInicio, horaFin) {
  const { rows } = await pool.query(
    'SELECT "PrecioHora", "PrecioSemanal", "PrecioMensual" FROM "Recursos" WHERE "idRecurso" = $1',
    [idRecurso]
  );
  if (rows.length === 0) return 0;
  const rec = rows[0];

  if (tipo === "turno" && rec.PrecioHora && horaInicio && horaFin) {
    const [hI, mI] = horaInicio.split(":").map(Number);
    const [hF, mF] = horaFin.split(":").map(Number);
    const horas = (hF * 60 + mF - hI * 60 - mI) / 60;
    return parseFloat(rec.PrecioHora) * Math.max(horas, 0);
  }
  if (tipo === "semanal" && rec.PrecioSemanal) return parseFloat(rec.PrecioSemanal);
  if (tipo === "mensual" && rec.PrecioMensual) return parseFloat(rec.PrecioMensual);
  return 0;
}

// ── CRUD ────────────────────────────────────────────────────

export const obtenerReservas = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
    const { where, params, nextParamIndex } = buildReservasAdminFilters(req.query);

    const baseFrom = `
      FROM "Reservas" r
      LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      LEFT JOIN LATERAL (
        SELECT t."EstadoPago"
        FROM "Transaccion" t
        WHERE t."idReserva" = r."idReserva"
        ORDER BY t."idTransaccion" DESC NULLS LAST
        LIMIT 1
      ) tx ON true
    `;

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom} ${where}`, params);
    const total = countRows[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT r.*,
             c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
             rec."Nombre" AS recurso_nombre, rec."esCompleto",
             e."Nombre" AS espacio_nombre,
             tx."EstadoPago"
      ${baseFrom}
      ${where}
      ORDER BY r."DiaReserva" DESC NULLS LAST, r."idReserva" DESC
      LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
    `,
      [...params, limit, offset]
    );

    const items = rows.map((r) =>
      enriquecerFilaConMutacion(serializarHorariosReservaEnFila(r), r, new Date(), {
        staffNoEliminarSiPagado: true,
      })
    );
    res.json({ items, total, limit, offset });
  } catch (error) {
    console.error("Error al obtener reservas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** Reservas que ocupan el día calendario indicado (turno / pack), para vistas de ocupación. */
export const obtenerReservasOcupacionDia = async (req, res) => {
  try {
    const fecha = req.query.fecha;
    if (!fecha || String(fecha).trim() === "") {
      return res.status(400).json({ message: "Parámetro requerido: fecha (YYYY-MM-DD)." });
    }
    const { where, params, nextParamIndex } = buildReservasAdminFilters({ ...req.query, afectaDia: fecha });
    const baseFrom = `
      FROM "Reservas" r
      LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      LEFT JOIN LATERAL (
        SELECT t."EstadoPago"
        FROM "Transaccion" t
        WHERE t."idReserva" = r."idReserva"
        ORDER BY t."idTransaccion" DESC NULLS LAST
        LIMIT 1
      ) tx ON true
    `;
    const { rows } = await pool.query(
      `
      SELECT r.*,
             c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
             rec."Nombre" AS recurso_nombre, rec."esCompleto",
             e."Nombre" AS espacio_nombre,
             tx."EstadoPago"
      ${baseFrom}
      ${where}
      ORDER BY r."HorarioReserva" ASC NULLS LAST, r."idReserva" ASC
      LIMIT $${nextParamIndex}
    `,
      [...params, 2000]
    );
    const items = rows.map((r) =>
      enriquecerFilaConMutacion(serializarHorariosReservaEnFila(r), r, new Date(), {
        staffNoEliminarSiPagado: true,
      })
    );
    res.json({ items, fecha: String(fecha).trim() });
  } catch (error) {
    console.error("Error al obtener ocupación del día:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerReservaPorId = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
              rec."Nombre" AS recurso_nombre, rec."esCompleto",
              e."Nombre" AS espacio_nombre,
              tx."EstadoPago", tx."MetodoPago", tx."TipoPago"
       FROM "Reservas" r
       LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
       LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
       LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
       LEFT JOIN LATERAL (
         SELECT t."EstadoPago", t."MetodoPago", t."TipoPago"
         FROM "Transaccion" t
         WHERE t."idReserva" = r."idReserva"
         ORDER BY t."idTransaccion" DESC NULLS LAST
         LIMIT 1
       ) tx ON true
       WHERE r."idReserva" = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const row = rows[0];
    if (esCliente(req.usuario)) {
      const tokenDni = req.usuario.dni != null ? String(req.usuario.dni).trim() : "";
      const resDni = row.DNI != null ? String(row.DNI).trim() : "";
      if (!tokenDni || resDni !== tokenDni) {
        return res.status(404).json({ message: "Reserva no encontrada" });
      }
    }
    res.json(
      enriquecerFilaConMutacion(serializarHorariosReservaEnFila(row), row, new Date(), {
        staffNoEliminarSiPagado: esStaff(req.usuario),
      })
    );
  } catch (error) {
    console.error("Error al obtener reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const crearReserva = async (req, res) => {
  try {
    const titular = await resolverTitularReserva(req, res);
    if (!titular) return;

    const { idRecurso: idRecursoRaw, HorarioReserva, HorarioFin, DiaReserva, TipoReserva } = req.body;
    const tipo = TipoReserva || "turno";
    const idRecurso = Number(idRecursoRaw);

    if (!DiaReserva) return res.status(400).json({ message: "La fecha de reserva es obligatoria." });
    const errDiaNuevo = validarDiaReservaNoEnElPasado(DiaReserva);
    if (errDiaNuevo) return res.status(400).json({ message: errDiaNuevo });
    if (!Number.isFinite(idRecurso) || idRecurso <= 0) {
      return res.status(400).json({ message: "Debés seleccionar un recurso válido a reservar." });
    }
    if (tipo === "turno" && (!HorarioReserva || !HorarioFin))
      return res.status(400).json({ message: "Horario de inicio y fin son obligatorios." });

    if (tipo === "turno") {
      const msgTurno = await mensajeTurnoNoDisponibleParaRecurso(idRecurso);
      if (msgTurno) return res.status(400).json({ message: msgTurno });
    }

    let horaIniStore = HorarioReserva || null;
    let horaFinStore = HorarioFin || null;
    if (tipo === "turno") {
      const nh = horariosParaReservaTurno(HorarioReserva, HorarioFin);
      if (nh.error) return res.status(400).json({ message: nh.error });
      horaIniStore = nh.horaIni;
      horaFinStore = nh.horaFin;
      const errH = validarVentanaOperativaTurno(horaIniStore, horaFinStore);
      if (errH) return res.status(400).json({ message: errH });
      const errPasado = validarInicioTurnoNoEnElPasado(DiaReserva, horaIniStore);
      if (errPasado) return res.status(400).json({ message: errPasado });
    }

    const hi = tipo === "turno" ? horaIniStore : "00:00";
    const hf = tipo === "turno" ? horaFinStore : "23:59";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await bloquearEspaciosDeRecursos(client, [idRecurso]);
      const conflicto = await verificarConflictos(client, idRecurso, DiaReserva, hi, hf, tipo, null);
      if (conflicto) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: conflicto });
      }

      let montoFinal;
      if (esStaff(req.usuario)) {
        const raw = req.body.Monto;
        const parsed = raw === undefined || raw === null ? NaN : parseFloat(raw);
        montoFinal =
          Number.isFinite(parsed) && parsed > 0
            ? parsed
            : await calcularMonto(idRecurso, tipo, horaIniStore || undefined, horaFinStore || undefined);
      } else {
        montoFinal = await calcularMonto(idRecurso, tipo, horaIniStore || undefined, horaFinStore || undefined);
      }

      const { rows } = await client.query(
        `INSERT INTO "Reservas" ("DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva","Estado")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'activa')
         RETURNING *`,
        [
          titular.dni,
          titular.nombre,
          idRecurso,
          tipo === "turno" ? horaIniStore : HorarioReserva || null,
          tipo === "turno" ? horaFinStore : HorarioFin || null,
          montoFinal,
          DiaReserva,
          tipo,
        ]
      );

      await client.query("COMMIT");
      enviarConfirmacionReservaEnBackground(pool, [rows[0].idReserva]);
      res.status(201).json(serializarHorariosReservaEnFila(rows[0]));
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* */
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error al crear reserva:", error);
    if (error.code === "23503")
      return res.status(400).json({ message: "El DNI no corresponde a un cliente registrado." });
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Varias reservas de turno en una sola operación (misma fecha y horario).
 * Body: { DNI, Nombre, DiaReserva, HorarioReserva, HorarioFin, items: [{ idRecurso }] } — monto por fila siempre calculado en servidor.
 */
export const crearReservasMultiples = async (req, res) => {
  const titular = await resolverTitularReserva(req, res);
  if (!titular) return;

  const { DiaReserva, HorarioReserva, HorarioFin, items } = req.body;

  if (!DiaReserva) return res.status(400).json({ message: "La fecha de reserva es obligatoria." });
  const errDiaMulti = validarDiaReservaNoEnElPasado(DiaReserva);
  if (errDiaMulti) return res.status(400).json({ message: errDiaMulti });
  if (!HorarioReserva || !HorarioFin)
    return res.status(400).json({ message: "Horario de inicio y fin son obligatorios." });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "Debés incluir al menos un recurso en items." });

  const nh = horariosParaReservaTurno(HorarioReserva, HorarioFin);
  if (nh.error) return res.status(400).json({ message: nh.error });
  const errH = validarVentanaOperativaTurno(nh.horaIni, nh.horaFin);
  if (errH) return res.status(400).json({ message: errH });
  const errPasadoMulti = validarInicioTurnoNoEnElPasado(DiaReserva, nh.horaIni);
  if (errPasadoMulti) return res.status(400).json({ message: errPasadoMulti });

  const ids = items.map((x) => Number(x.idRecurso)).filter((n) => Number.isFinite(n) && n > 0);
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length)
    return res.status(400).json({ message: "No podés repetir el mismo recurso en una misma reserva múltiple." });
  if (ids.length > 24)
    return res.status(400).json({ message: "Máximo 24 recursos por operación." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await bloquearEspaciosDeRecursos(client, ids);
    const creadas = [];

    for (const idRecurso of ids) {
      const msgTurno = await mensajeTurnoNoDisponibleParaRecurso(idRecurso);
      if (msgTurno) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: msgTurno });
      }
      const conflicto = await verificarConflictos(
        client,
        idRecurso,
        DiaReserva,
        nh.horaIni,
        nh.horaFin,
        "turno",
        null
      );
      if (conflicto) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: conflicto });
      }

      const montoFila = await calcularMonto(idRecurso, "turno", nh.horaIni, nh.horaFin);

      const ins = await client.query(
        `INSERT INTO "Reservas" ("DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva","Estado")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'turno','activa')
         RETURNING *`,
        [titular.dni, titular.nombre, idRecurso, nh.horaIni, nh.horaFin, montoFila, DiaReserva]
      );
      creadas.push(ins.rows[0]);
    }

    await client.query("COMMIT");
    enviarConfirmacionReservaEnBackground(
      pool,
      creadas.map((r) => r.idReserva)
    );
    res.status(201).json({ reservas: serializarHorariosReservaEnFilas(creadas), count: creadas.length });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* */
    }
    console.error("Error al crear reservas múltiples:", error);
    if (error.code === "23503")
      return res.status(400).json({ message: "El DNI no corresponde a un cliente registrado." });
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

export const actualizarReserva = async (req, res) => {
  try {
    const idReserva = parseInt(req.params.id, 10);
    if (!Number.isFinite(idReserva) || idReserva <= 0) {
      return res.status(400).json({ message: "ID de reserva inválido." });
    }

    const { rows: existingRows } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
    if (existingRows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const ex = existingRows[0];

    if (!esStaff(req.usuario) && !esCliente(req.usuario)) {
      return res.status(403).json({ message: "No autorizado a modificar reservas." });
    }
    if (!puedeOperarReserva(req.usuario, ex)) {
      return res.status(403).json({ message: "No tenés permiso para modificar esta reserva." });
    }

    const mut = evaluarMutacionReserva(ex);
    if (!mut.puedeEditar) {
      return res.status(403).json({ message: mut.mensaje, codigo: mut.codigo });
    }

    let { DNI, Nombre, idRecurso, HorarioReserva, HorarioFin, Monto, DiaReserva, TipoReserva } = req.body;
    let tipo;
    if (esCliente(req.usuario)) {
      DNI = ex.DNI;
      Nombre = ex.Nombre;
      tipo = ex.TipoReserva || "turno";
    } else {
      tipo =
        TipoReserva != null && String(TipoReserva).trim() !== ""
          ? TipoReserva
          : ex.TipoReserva || "turno";
    }

    if (!DiaReserva) return res.status(400).json({ message: "La fecha de reserva es obligatoria." });
    const errDiaEd = validarDiaReservaNoEnElPasado(DiaReserva);
    if (errDiaEd) return res.status(400).json({ message: errDiaEd });
    if (tipo === "turno" && (!HorarioReserva || !HorarioFin))
      return res.status(400).json({ message: "Horario de inicio y fin son obligatorios." });

    let horaIniStore = HorarioReserva || null;
    let horaFinStore = HorarioFin || null;
    if (tipo === "turno") {
      const nh = horariosParaReservaTurno(HorarioReserva, HorarioFin);
      if (nh.error) return res.status(400).json({ message: nh.error });
      horaIniStore = nh.horaIni;
      horaFinStore = nh.horaFin;
      const errH = validarVentanaOperativaTurno(horaIniStore, horaFinStore);
      if (errH) return res.status(400).json({ message: errH });
      const errPasadoEd = validarInicioTurnoNoEnElPasado(DiaReserva, horaIniStore);
      if (errPasadoEd) return res.status(400).json({ message: errPasadoEd });
    }

    const hi = tipo === "turno" ? horaIniStore : "00:00";
    const hf = tipo === "turno" ? horaFinStore : "23:59";
    const idRecursoNuevo = Number(idRecurso);
    if (!Number.isFinite(idRecursoNuevo) || idRecursoNuevo <= 0) {
      return res.status(400).json({ message: "Debés seleccionar un recurso válido." });
    }

    if (tipo === "turno") {
      const msgTurno = await mensajeTurnoNoDisponibleParaRecurso(idRecursoNuevo);
      if (msgTurno) return res.status(400).json({ message: msgTurno });
    }

    let montoFinal;
    if (esStaff(req.usuario)) {
      const raw = Monto;
      const parsed = raw === undefined || raw === null ? NaN : parseFloat(raw);
      montoFinal =
        Number.isFinite(parsed) && parsed > 0
          ? parsed
          : await calcularMonto(idRecursoNuevo, tipo, horaIniStore || undefined, horaFinStore || undefined);
    } else {
      montoFinal = await calcularMonto(idRecursoNuevo, tipo, horaIniStore || undefined, horaFinStore || undefined);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: prev } = await client.query('SELECT "idRecurso" FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
      if (prev.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Reserva no encontrada" });
      }
      await bloquearEspaciosDeRecursos(client, [prev[0].idRecurso, idRecursoNuevo]);
      const conflicto = await verificarConflictos(client, idRecursoNuevo, DiaReserva, hi, hf, tipo, idReserva);
      if (conflicto) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: conflicto });
      }

      const result = await client.query(
        `UPDATE "Reservas" SET "DNI"=$1,"Nombre"=$2,"idRecurso"=$3,
         "HorarioReserva"=$4,"HorarioFin"=$5,"Monto"=$6,"DiaReserva"=$7,"TipoReserva"=$8
         WHERE "idReserva"=$9`,
        [
          DNI,
          Nombre,
          idRecursoNuevo,
          tipo === "turno" ? horaIniStore : HorarioReserva || null,
          tipo === "turno" ? horaFinStore : HorarioFin || null,
          montoFinal,
          DiaReserva,
          tipo,
          idReserva,
        ]
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Reserva no encontrada" });
      }
      await client.query("COMMIT");
      res.json({ message: "Reserva actualizada" });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* */
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error al actualizar reserva:", error);
    if (error.code === "23503") return res.status(400).json({ message: "El DNI o recurso no es válido." });
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const cambiarEstadoReserva = async (req, res) => {
  try {
    const { estado } = req.body;
    const valid = ["activa", "completada", "cancelada", "no_asistio"];
    if (!valid.includes(estado)) {
      return res.status(400).json({ message: `Estado inválido. Valores: ${valid.join(", ")}` });
    }

    const idReserva = parseInt(req.params.id, 10);
    if (!Number.isFinite(idReserva) || idReserva <= 0) {
      return res.status(400).json({ message: "ID de reserva inválido." });
    }

    const { rows: prevEst } = await pool.query(
      'SELECT "TipoReserva","DiaReserva","HorarioReserva" FROM "Reservas" WHERE "idReserva" = $1',
      [idReserva]
    );
    if (prevEst.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });

    if (estado === "completada" || estado === "no_asistio") {
      const row0 = prevEst[0];
      const tipo0 = row0.TipoReserva || "turno";
      if (tipo0 === "turno" && row0.HorarioReserva) {
        const hi = formatearHoraParaApi(row0.HorarioReserva) || String(row0.HorarioReserva);
        const errRec = validarRecepcionNoAnticipada(row0.DiaReserva, hi);
        if (errRec) return res.status(400).json({ message: errRec });
      }
    }

    if (estado === "cancelada") {
      const { rows: txRows } = await pool.query(
        'SELECT "EstadoPago" FROM "Transaccion" WHERE "idReserva" = $1',
        [idReserva]
      );
      const pago = txRows[0]?.EstadoPago;
      if (pago === "Pagado" && req.usuario?.rol !== "admin") {
        return res.status(403).json({
          message:
            "No se puede cancelar desde recepción: la reserva figura como pagada. Pedí a un administrador o gestioná la devolución antes de anular.",
        });
      }
    }

    const result = await pool.query(
      'UPDATE "Reservas" SET "Estado" = $1 WHERE "idReserva" = $2',
      [estado, idReserva]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    res.json({ message: "Estado actualizado" });
  } catch (error) {
    console.error("Error al cambiar estado de reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerMisReservas = async (req, res) => {
  try {
    const dni = req.usuario.dni != null ? String(req.usuario.dni).trim() : "";
    if (!dni) {
      return res.status(403).json({ message: "Completá tu perfil con DNI para ver tus reservas." });
    }
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const baseFrom = `
      FROM "Reservas" r
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      LEFT JOIN LATERAL (
        SELECT t."EstadoPago", t."MetodoPago", t."TipoPago"
        FROM "Transaccion" t
        WHERE t."idReserva" = r."idReserva"
        ORDER BY t."idTransaccion" DESC NULLS LAST
        LIMIT 1
      ) t ON true
      WHERE r."DNI" = $1
    `;
    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom}`, [dni]);
    const total = countRows[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT r.*,
             rec."Nombre" AS recurso_nombre, rec."esCompleto",
             e."Nombre" AS espacio_nombre,
             t."EstadoPago", t."MetodoPago", t."TipoPago"
      ${baseFrom}
      ORDER BY r."DiaReserva" DESC NULLS LAST, r."idReserva" DESC
      LIMIT $2 OFFSET $3
    `,
      [dni, limit, offset]
    );
    const items = rows.map((r) => enriquecerFilaConMutacion(serializarHorariosReservaEnFila(r), r));
    res.json({ items, total, limit, offset });
  } catch (error) {
    console.error("Error al obtener mis reservas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarReserva = async (req, res) => {
  const idReserva = parseInt(req.params.id, 10);
  if (!Number.isFinite(idReserva) || idReserva <= 0) {
    return res.status(400).json({ message: "ID de reserva inválido." });
  }
  try {
    const { rows: existingRows } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
    if (existingRows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const ex = existingRows[0];

    if (!esStaff(req.usuario) && !esCliente(req.usuario)) {
      return res.status(403).json({ message: "No autorizado a eliminar reservas." });
    }
    if (!puedeOperarReserva(req.usuario, ex)) {
      return res.status(403).json({ message: "No tenés permiso para eliminar esta reserva." });
    }

    if (esStaff(req.usuario)) {
      const { rows: txRows } = await pool.query(
        'SELECT "EstadoPago" FROM "Transaccion" WHERE "idReserva" = $1 ORDER BY "idTransaccion" DESC NULLS LAST LIMIT 1',
        [idReserva]
      );
      if (String(txRows[0]?.EstadoPago ?? "").trim() === "Pagado") {
        return res.status(403).json({
          message:
            "No podés eliminar una reserva ya registrada como pagada desde Consultar reservas. Gestioná la anulación o la devolución con administración o el área financiera.",
          codigo: "pagada_staff",
        });
      }
    }

    const mut = evaluarMutacionReserva(ex);
    if (!mut.puedeEliminar) {
      return res.status(403).json({ message: mut.mensaje, codigo: mut.codigo });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query('DELETE FROM "Transaccion" WHERE "idReserva" = $1', [idReserva]);
      const result = await client.query('DELETE FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
      await client.query("COMMIT");
      if (result.rowCount === 0) return res.status(404).json({ message: "Reserva no encontrada" });
      res.json({ message: "Reserva eliminada" });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* */
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error al eliminar reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
