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
import {
  enriquecerFilaConMutacion,
  evaluarMutacionReserva,
  ymdEnZona,
  minutosDiaEnZona,
  reservaPeriodoAunNoTermino,
  pgDateToYmd,
} from "../services/reservaMutability.service.js";
import {
  calcularFracciones,
  sumarMinutosAHora,
  minutoFinReal,
  horaAMinutos,
  minutosAHora,
} from "../services/extensionReserva.service.js";
import { lateralUltimaTransaccion } from "../services/transaccionUltimaJoin.service.js";
import {
  descuentoSerieMensualDefault,
  fechasSerieMensualRodante,
  filtrarDesdeFecha,
  repartirMontoTotal,
  fechaFinPeriodoExclusiva,
  serieSoloDiasHabiles,
  diaSemanaIsoDesdeYmd,
} from "../services/reservaSerieMensual.service.js";

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

/** Todas las filas de reserva del mismo lote multi-recurso (idReservaGrupo), o [idReserva] si no aplica. */
async function idsReservasMismoGrupo(q, idReserva) {
  try {
    const { rows: one } = await q.query('SELECT "idReservaGrupo" FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
    if (one.length === 0) return [idReserva];
    const g = one[0].idReservaGrupo;
    if (g == null) return [idReserva];
    const { rows } = await q.query(
      'SELECT "idReserva" FROM "Reservas" WHERE "idReservaGrupo" = $1 ORDER BY "idReserva" ASC',
      [g]
    );
    return rows.length ? rows.map((r) => r.idReserva) : [idReserva];
  } catch (e) {
    if (e.code === "42703" && String(e.message || "").includes("idReservaGrupo")) return [idReserva];
    throw e;
  }
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

// Detecta si una reserva NUEVA choca con las EXISTENTES (que pueden ser turno, semanal o mensual).
// Cada reserva ocupa un rango de fechas; el turno además ocupa un rango horario. Dos reservas chocan
// cuando sus rangos de fechas se solapan y, si ambas son turno el mismo día, también sus horarios.
function sqlConflicto(extraRecursoWhere, excludeId) {
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

function diasPack(tipo) {
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

  const dias = diasPack(tipo);
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

  // Conflicto directo sobre el mismo recurso
  const q1 = bind(
    sqlConflicto(null, ex),
    { $p_recurso: idRecurso }
  );
  const r1 = await db.query(q1.text, q1.vals);
  if (parseInt(r1.rows[0].n) > 0) {
    return "Este recurso ya está reservado en ese período.";
  }

  // Lógica de recurso "completo"
  if (recurso.esCompleto) {
    if (recurso.idRecursoPadre) {
      const q = bind(
        sqlConflicto(`rec."idRecursoPadre" = $p_padre AND rec."esCompleto" = false`, ex),
        { $p_padre: recurso.idRecursoPadre }
      );
      const r = await db.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "No se puede reservar completo: hay recursos individuales reservados en ese período.";
    } else {
      const q = bind(
        sqlConflicto(`rec."idEspacio" = $p_esp AND rec."idRecurso" != $p_self`, ex),
        { $p_esp: recurso.idEspacio, $p_self: idRecurso }
      );
      const r = await db.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "No se puede reservar el espacio completo: hay recursos individuales reservados en ese período.";
    }
  } else {
    if (recurso.idRecursoPadre) {
      const q = bind(
        sqlConflicto(`rec."idRecursoPadre" = $p_padre AND rec."esCompleto" = true`, ex),
        { $p_padre: recurso.idRecursoPadre }
      );
      const r = await db.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "El grupo completo ya está reservado en ese período.";
    }
    const q = bind(
      sqlConflicto(`rec."idEspacio" = $p_esp AND rec."esCompleto" = true AND rec."idRecursoPadre" IS NULL`, ex),
      { $p_esp: recurso.idEspacio }
    );
    const r = await db.query(q.text, q.vals);
    if (parseInt(r.rows[0].n) > 0)
      return "El espacio completo ya está reservado en ese período.";
  }

  return null;
}

/** Filtros opcionales para listados admin (búsqueda, espacio, fechas, día calendario afectado). */
function armarFiltrosReservasAdmin(query) {
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

/** Cotización pública de reserva fija: 4 semanas consecutivas desde fecha inicio (sin persistencia). */
export const cotizarSerieMensual = async (req, res) => {
  try {
    const { fechaInicio, diaSemana, idRecurso, HorarioReserva, HorarioFin } = req.query;
    const fi = String(fechaInicio || "").trim();
    if (serieSoloDiasHabiles() && diaSemana >= 6) {
      return res.status(400).json({
        message: "El día recurrente debe ser hábil (lunes a viernes). Para incluir fines de semana configurá RESERVA_SERIE_SOLO_DIAS_HABILES=false.",
      });
    }
    const errDiaIni = validarDiaReservaNoEnElPasado(fi);
    if (errDiaIni) return res.status(400).json({ message: errDiaIni });

    const nh = horariosParaReservaTurno(HorarioReserva, HorarioFin);
    if (nh.error) return res.status(400).json({ message: nh.error });
    const errH = validarVentanaOperativaTurno(nh.horaIni, nh.horaFin);
    if (errH) return res.status(400).json({ message: errH });

    if (diaSemanaIsoDesdeYmd(fi) !== diaSemana) {
      return res.status(400).json({
        message:
          "La fecha de inicio debe ser el mismo día de la semana que elegiste (por ejemplo, si elegís viernes, la fecha tiene que ser un viernes). Se reservan 4 turnos en semanas consecutivas.",
      });
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const fechasAll = fechasSerieMensualRodante(fi, diaSemana);
    const fechas = filtrarDesdeFecha(fechasAll, hoy);
    if (fechas.length === 0) {
      return res.status(400).json({
        message:
          "No hay turnos en la serie de 4 semanas para el día elegido, o ya pasaron. Probá otra fecha de inicio u horario.",
      });
    }

    let precioListaTotal = 0;
    for (const _f of fechas) {
      precioListaTotal += await calcularMonto(idRecurso, "turno", nh.horaIni, nh.horaFin);
    }
    const desc = descuentoSerieMensualDefault();
    const precioFinalTotal = Math.round(precioListaTotal * (1 - desc) * 100) / 100;
    const finEx = fechaFinPeriodoExclusiva(fi);

    res.json({
      fechaInicio: fi,
      fechaFinPeriodoExclusiva: finEx,
      periodoHasta: fechas[fechas.length - 1],
      diaSemana,
      nOcurrencias: fechas.length,
      fechas,
      descuentoAplicado: desc,
      precioListaTotal: Math.round(precioListaTotal * 100) / 100,
      precioFinalTotal,
    });
  } catch (error) {
    console.error("Error al cotizar serie mensual:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** Crea cabecera ReservaSeria + N filas turno enlazadas (un pago grupal vía MP). */
export const crearSerieMensual = async (req, res) => {
  try {
    const titular = await resolverTitularReserva(req, res);
    if (!titular) return;

    const { fechaInicio, diaSemana, idRecurso: idRecursoRaw, HorarioReserva, HorarioFin } = req.body;
    const fi = String(fechaInicio || "").trim();
    const idRecurso = Number(idRecursoRaw);
    if (!Number.isFinite(idRecurso) || idRecurso <= 0) {
      return res.status(400).json({ message: "Debés seleccionar un recurso válido a reservar." });
    }
    if (serieSoloDiasHabiles() && diaSemana >= 6) {
      return res.status(400).json({
        message: "El día recurrente debe ser hábil (lunes a viernes).",
      });
    }
    const errDiaIniC = validarDiaReservaNoEnElPasado(fi);
    if (errDiaIniC) return res.status(400).json({ message: errDiaIniC });

    const nh = horariosParaReservaTurno(HorarioReserva, HorarioFin);
    if (nh.error) return res.status(400).json({ message: nh.error });
    const errH = validarVentanaOperativaTurno(nh.horaIni, nh.horaFin);
    if (errH) return res.status(400).json({ message: errH });

    if (diaSemanaIsoDesdeYmd(fi) !== diaSemana) {
      return res.status(400).json({
        message:
          "La fecha de inicio debe ser el mismo día de la semana que elegiste. Se reservan 4 turnos en semanas consecutivas.",
      });
    }

    const msgTurno = await mensajeTurnoNoDisponibleParaRecurso(idRecurso);
    if (msgTurno) return res.status(400).json({ message: msgTurno });

    const hoy = new Date().toISOString().slice(0, 10);
    const fechasAll = fechasSerieMensualRodante(fi, diaSemana);
    const fechas = filtrarDesdeFecha(fechasAll, hoy);
    if (fechas.length === 0) {
      return res.status(400).json({
        message:
          "No hay turnos en la serie de 4 semanas para el día elegido, o ya pasaron.",
      });
    }

    const errPrimera = validarDiaReservaNoEnElPasado(fechas[0]);
    if (errPrimera) return res.status(400).json({ message: errPrimera });
    const errPasado = validarInicioTurnoNoEnElPasado(fechas[0], nh.horaIni);
    if (errPasado) return res.status(400).json({ message: errPasado });

    let precioListaTotal = 0;
    for (const _f of fechas) {
      precioListaTotal += await calcularMonto(idRecurso, "turno", nh.horaIni, nh.horaFin);
    }
    const desc = descuentoSerieMensualDefault();
    const precioFinalTotal = Math.round(precioListaTotal * (1 - desc) * 100) / 100;
    const montos = repartirMontoTotal(precioFinalTotal, fechas.length);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await bloquearEspaciosDeRecursos(client, [idRecurso]);

      for (const fecha of fechas) {
        const conflicto = await verificarConflictos(client, idRecurso, fecha, nh.horaIni, nh.horaFin, "turno", null);
        if (conflicto) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: conflicto, fechaConflictiva: fecha });
        }
      }

      const [yy, mm] = fi.split("-").map(Number);
      const periodoHasta = fechas[fechas.length - 1];
      const insSerie = await client.query(
        `INSERT INTO "ReservaSerie" (
          "DNI","Nombre","idRecurso","anio","mes","diaSemana",
          "HorarioReserva","HorarioFin","descuentoAplicado",
          "precioListaTotal","precioFinalTotal","nOcurrencias","Estado",
          "periodoDesde","periodoHasta"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::time,$8::time,$9,$10,$11,$12,'activa',$13::date,$14::date)
        RETURNING *`,
        [
          titular.dni,
          titular.nombre,
          idRecurso,
          yy,
          mm,
          diaSemana,
          nh.horaIni,
          nh.horaFin,
          desc,
          Math.round(precioListaTotal * 100) / 100,
          precioFinalTotal,
          fechas.length,
          fi,
          periodoHasta,
        ]
      );
      const serie = insSerie.rows[0];
      const idSerie = serie.idSerie;

      const creadas = [];
      for (let i = 0; i < fechas.length; i++) {
        const ins = await client.query(
          `INSERT INTO "Reservas" (
            "DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva","Estado","idSerie"
          ) VALUES ($1,$2,$3,$4::time,$5::time,$6,$7,'turno','activa',$8)
          RETURNING *`,
          [
            titular.dni,
            titular.nombre,
            idRecurso,
            nh.horaIni,
            nh.horaFin,
            montos[i],
            fechas[i],
            idSerie,
          ]
        );
        creadas.push(ins.rows[0]);
      }

      await client.query("COMMIT");
      enviarConfirmacionReservaEnBackground(
        pool,
        creadas.map((r) => r.idReserva)
      );
      res.status(201).json({
        idSerie,
        idReservaPago: creadas[0].idReserva,
        precioFinalTotal,
        precioListaTotal: Math.round(precioListaTotal * 100) / 100,
        descuentoAplicado: desc,
        nOcurrencias: fechas.length,
        fechaInicio: fi,
        fechaFinPeriodoExclusiva: fechaFinPeriodoExclusiva(fi),
        periodoHasta,
        reservas: serializarHorariosReservaEnFilas(creadas),
      });
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
    console.error("Error al crear serie mensual:", error);
    if (error.code === "23503")
      return res.status(400).json({ message: "El DNI no corresponde a un cliente registrado." });
    if (error.code === "42703" && String(error.message || "").includes("periodoDesde")) {
      return res.status(503).json({
        message:
          "Falta en la BD la migración de período rodante: ejecutá el bloque final de backend/database/migration_reserva_serie_mensual.sql (periodoDesde / periodoHasta).",
      });
    }
    if (error.code === "42P01" || String(error.message || "").includes('ReservaSerie')) {
      return res.status(503).json({
        message:
          "El servidor no tiene aplicada la migración de reservas fijas mensuales. Ejecutá backend/database/migration_reserva_serie_mensual.sql",
      });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── CRUD ────────────────────────────────────────────────────

/**
 * Cierra reservas que quedaron en "en_curso" pero cuyo HorarioFin original ya pasó.
 * Idempotente. Se invoca antes de servir listados para mantener el estado al día
 * sin depender de timers en el servidor.
 */
async function sweepEnCursoVencidas(db = pool) {
  try {
    await db.query(
      `UPDATE "Reservas"
       SET "Estado" = 'completada'
       WHERE "Estado" = 'en_curso'
         AND COALESCE("TipoReserva",'turno') = 'turno'
         AND "HorarioFin" IS NOT NULL
         AND ("DiaReserva"::timestamp + "HorarioFin"::time) <= now()`
    );
  } catch (e) {
    // No bloquear el listado si la migración aún no fue aplicada.
    if (e.code === "23514" || e.code === "42703") return;
    throw e;
  }
  // Cierre natural: el cliente usó toda la ventana extendida, el cargo provisional
  // (sobre el fin actual) ya es el real → sólo marcar la extensión como finalizada.
  try {
    await db.query(
      `UPDATE "ReservaExtension" e
       SET "Finalizada" = true, "ActualizadaEn" = now()
       FROM "Reservas" r
       WHERE e."idReserva" = r."idReserva" AND e."Finalizada" = false AND r."Estado" = 'completada'`
    );
  } catch (e) {
    if (e.code === "42P01" || e.code === "42703") return;
    throw e;
  }
}

/**
 * Adjunta a cada item el resumen de su extensión (veces, minutos, monto y si el
 * cargo sigue pendiente de pago). Resiliente: si la migración de extensiones aún
 * no fue aplicada, no rompe el listado.
 */
async function adjuntarConteoExtensiones(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const ids = items.map((r) => r.idReserva).filter((x) => x != null);
  if (ids.length === 0) return items;
  try {
    const { rows } = await pool.query(
      `SELECT e."idReserva", e."Veces"::int AS veces, e."MinutosExtension"::int AS min,
              e."Monto"::numeric AS monto, e."Finalizada" AS finalizada,
              EXISTS (
                SELECT 1 FROM "Transaccion" t
                WHERE t."idExtension" = e."idExtension" AND t."EstadoPago" = 'Pagado'
              ) AS pagada
       FROM "ReservaExtension" e
       WHERE e."idReserva" = ANY($1::int[])`,
      [ids]
    );
    const byId = new Map(rows.map((r) => [r.idReserva, r]));
    for (const it of items) {
      const m = byId.get(it.idReserva);
      it.extensionesCount = m ? m.veces : 0;
      it.extensionesMinutos = m ? m.min : 0;
      it.extensionMonto = m ? parseFloat(m.monto) || 0 : 0;
      it.extensionPendiente = m ? !m.pagada : false;
    }
  } catch (e) {
    if (e.code !== "42P01") throw e;
    for (const it of items) {
      it.extensionesCount = 0;
      it.extensionesMinutos = 0;
      it.extensionMonto = 0;
      it.extensionPendiente = false;
    }
  }
  return items;
}

export const obtenerReservas = async (req, res) => {
  try {
    await sweepEnCursoVencidas();
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
    const { where, params, nextParamIndex } = armarFiltrosReservasAdmin(req.query);

    const baseFrom = `
      FROM "Reservas" r
      LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      LEFT JOIN "ReservaSerie" rs ON r."idSerie" = rs."idSerie"
      ${lateralUltimaTransaccion("r", "tx")}
    `;

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom} ${where}`, params);
    const total = countRows[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT r.*,
             c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
             rec."Nombre" AS recurso_nombre, rec."esCompleto", rec."PrecioHora" AS recurso_precio_hora,
             e."Nombre" AS espacio_nombre,
             tx."EstadoPago",
             rs."anio" AS "serie_anio",
             rs."mes" AS "serie_mes",
             rs."diaSemana" AS "serie_diaSemana",
             rs."nOcurrencias" AS "serie_nOcurrencias",
             rs."precioFinalTotal" AS "serie_precioFinalTotal",
             rs."descuentoAplicado" AS "serie_descuentoAplicado",
             rs."periodoDesde" AS "serie_periodoDesde",
             rs."periodoHasta" AS "serie_periodoHasta"
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
    await adjuntarConteoExtensiones(items);
    res.json({ items, total, limit, offset });
  } catch (error) {
    console.error("Error al obtener reservas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** Reservas que ocupan el día calendario indicado (turno / pack), para vistas de ocupación. */
export const obtenerReservasOcupacionDia = async (req, res) => {
  try {
    await sweepEnCursoVencidas();
    const fecha = req.query.fecha;
    if (!fecha || String(fecha).trim() === "") {
      return res.status(400).json({ message: "Parámetro requerido: fecha (YYYY-MM-DD)." });
    }
    const { where, params, nextParamIndex } = armarFiltrosReservasAdmin({ ...req.query, afectaDia: fecha });
    const baseFrom = `
      FROM "Reservas" r
      LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      ${lateralUltimaTransaccion("r", "tx")}
    `;
    const { rows } = await pool.query(
      `
      SELECT r.*,
             c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
             rec."Nombre" AS recurso_nombre, rec."esCompleto", rec."PrecioHora" AS recurso_precio_hora,
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
    await adjuntarConteoExtensiones(items);
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
       ${lateralUltimaTransaccion("r", "tx")}
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

    const idsCreadas = creadas.map((r) => r.idReserva);
    const idReservaGrupo = Math.min(...idsCreadas);
    try {
      await client.query(
        `UPDATE "Reservas" SET "idReservaGrupo" = $1 WHERE "idReserva" = ANY($2::int[])`,
        [idReservaGrupo, idsCreadas]
      );
    } catch (err) {
      if (err.code === "42703" && String(err.message || "").includes("idReservaGrupo")) {
        await client.query("ROLLBACK");
        return res.status(503).json({
          message:
            "Ejecutá la migración backend/database/migration_reserva_grupo_multiples.sql para unificar reservas múltiples.",
        });
      }
      throw err;
    }

    await client.query("COMMIT");
    enviarConfirmacionReservaEnBackground(
      pool,
      creadas.map((r) => r.idReserva)
    );
    res.status(201).json({
      reservas: serializarHorariosReservaEnFilas(creadas),
      count: creadas.length,
      idReservaGrupo,
    });
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

    const { rows: filasExistentes } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
    if (filasExistentes.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const ex = filasExistentes[0];

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

// Al recibir al cliente, devuelve "completada" si el turno ya terminó o "en_curso" si sigue vigente.
// Solo aplica a turnos con HorarioFin; el resto va directo a completada. Compara en la zona del coworking.
function estadoAsistenciaInicialPara(row, now = new Date()) {
  try {
    const tipo = row.TipoReserva || "turno";
    if (tipo !== "turno") return "completada";
    if (!row.HorarioReserva || !row.HorarioFin) return "completada";

    const ymdRes = row.DiaReserva instanceof Date
      ? row.DiaReserva.toISOString().slice(0, 10)
      : String(row.DiaReserva).slice(0, 10);
    const hfRes = formatearHoraParaApi(row.HorarioFin) || String(row.HorarioFin);

    // Comparar en zona del coworking, no UTC.
    const hoyEnZona = ymdEnZona(now);
    const ahoraMinEnZona = minutosDiaEnZona(now);

    if (ymdRes > hoyEnZona) return "en_curso";
    if (ymdRes < hoyEnZona) return "completada";

    const [hf, mf] = hfRes.split(":").map(Number);
    const minutosFin = hf * 60 + (mf || 0);
    return ahoraMinEnZona < minutosFin ? "en_curso" : "completada";
  } catch (e) {
    console.error("Error en estadoAsistenciaInicialPara:", e);
    return "completada";
  }
}

export const cambiarEstadoReserva = async (req, res) => {
  try {
    const { estado, esFinalizacionManual } = req.body;
    const estadosValidos = ["activa", "en_curso", "completada", "cancelada", "no_asistio"];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ message: `Estado inválido. Valores: ${estadosValidos.join(", ")}` });
    }

    const idReserva = parseInt(req.params.id, 10);
    if (!Number.isFinite(idReserva) || idReserva <= 0) {
      return res.status(400).json({ message: "ID de reserva inválido." });
    }

    const { rows: prevEst } = await pool.query(
      'SELECT "TipoReserva","DiaReserva","HorarioReserva","HorarioFin" FROM "Reservas" WHERE "idReserva" = $1',
      [idReserva]
    );
    if (prevEst.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });

    const idsEstado = await idsReservasMismoGrupo(pool, idReserva);
    const row0 = prevEst[0];

    if (estado === "completada" || estado === "en_curso" || estado === "no_asistio") {
      const tipo0 = row0.TipoReserva || "turno";
      if (tipo0 === "turno" && row0.HorarioReserva) {
        const hi = formatearHoraParaApi(row0.HorarioReserva) || String(row0.HorarioReserva);
        const errRec = validarRecepcionNoAnticipada(row0.DiaReserva, hi);
        if (errRec) return res.status(400).json({ message: errRec });
      }
    }

    if (estado === "cancelada") {
      const { rows: txRows } = await pool.query(
        `SELECT t."EstadoPago"
         FROM "Transaccion" t
         WHERE t."idReserva" = ANY($1::int[])
            OR t."idTransaccion" IN (
              SELECT tr."idTransaccion" FROM "TransaccionReserva" tr WHERE tr."idReserva" = ANY($1::int[])
            )
         ORDER BY CASE WHEN t."EstadoPago" = 'Pagado' THEN 0 ELSE 1 END, t."idTransaccion" DESC
         LIMIT 1`,
        [idsEstado]
      );
      const pago = txRows[0]?.EstadoPago;
      if (pago === "Pagado" && req.usuario?.rol !== "admin") {
        return res.status(403).json({
          message:
            "No se puede cancelar desde recepción: la reserva figura como pagada. Pedí a un administrador o gestioná la devolución antes de anular.",
        });
      }
    }

    // Lógica de estado:
    // - Si es finalización manual (botón "Finalizar" desde tabla de procesadas): ir directo a completada.
    // - Si es "Asistió" desde la tabla de pendientes: decidir entre en_curso y completada según HorarioFin.
    // - Otros estados (no_asistio, cancelada, activa): pasar directo.
    let estadoFinal = estado;
    if (esFinalizacionManual && estado === "completada") {
      // Finalización manual: cierra sin pensar.
      estadoFinal = "completada";
    } else if ((estado === "completada" || estado === "en_curso") && !esFinalizacionManual) {
      // Recepción inicial: decidir según la hora.
      estadoFinal = estadoAsistenciaInicialPara(row0, new Date());
    }

    // Al cerrar el turno (completada) se liquidan las extensiones pendientes:
    // se recalcula el cargo sobre el tiempo realmente usado y se encoge el horario.
    if (estadoFinal === "completada") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const upd = await client.query(
          `UPDATE "Reservas" SET "Estado" = $1 WHERE "idReserva" = ANY($2::int[])`,
          [estadoFinal, idsEstado]
        );
        if (upd.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Reserva no encontrada" });
        }
        const ahora = new Date();
        for (const rid of idsEstado) {
          try {
            await liquidarExtensionAlFinalizar(client, rid, ahora);
          } catch (e) {
            // Si falta la migración de extensiones, no bloquear el cierre del turno.
            if (e.code !== "42P01" && e.code !== "42703") throw e;
          }
        }
        await client.query("COMMIT");
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
      return res.status(200).json({ message: "Estado actualizado", estado: estadoFinal });
    }

    // UPDATE simple: solo Estado.
    const result = await pool.query(
      `UPDATE "Reservas" SET "Estado" = $1 WHERE "idReserva" = ANY($2::int[])`,
      [estadoFinal, idsEstado]
    );

    if (result.rowCount === 0) return res.status(404).json({ message: "Reserva no encontrada" });

    res.status(200).json({ message: "Estado actualizado", estado: estadoFinal });
  } catch (error) {
    console.error("Error al cambiar estado de reserva:", error);
    if (error.code === "23514" || error.code === "42703") {
      return res.status(503).json({
        message:
          "El servidor aún no tiene aplicada la migración backend/database/migration_estado_en_curso.sql. Ejecutala contra Postgres y reinicia el backend.",
      });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Liquida la extensión de una reserva al CERRAR el turno: recalcula el cargo
 * sobre el tiempo realmente usado (fracciones de 30 min, redondeo hacia arriba),
 * encoge "HorarioFin" al fin real y marca la extensión como Finalizada.
 *
 * No toca extensiones ya pagadas (el cliente pagó la ventana reservada) ni las
 * ya finalizadas. Debe correr dentro de una transacción (recibe el client).
 */
async function liquidarExtensionAlFinalizar(client, idReserva, now = new Date()) {
  const { rows } = await client.query(
    'SELECT * FROM "ReservaExtension" WHERE "idReserva" = $1 AND "Finalizada" = false FOR UPDATE',
    [idReserva]
  );
  if (rows.length === 0) return;
  const ext = rows[0];

  // Si el cargo ya está pagado, no recalcular (se cobró lo reservado).
  const { rows: pagadas } = await client.query(
    `SELECT 1 FROM "Transaccion" WHERE "idExtension" = $1 AND "EstadoPago" = 'Pagado' LIMIT 1`,
    [ext.idExtension]
  );

  const { rows: rsv } = await client.query(
    'SELECT "DiaReserva" FROM "Reservas" WHERE "idReserva" = $1',
    [idReserva]
  );
  const diaYmd = rsv.length ? pgDateToYmd(rsv[0].DiaReserva) : null;

  const finOriginal = formatearHoraParaApi(ext.HorarioFinOriginal) || String(ext.HorarioFinOriginal).slice(0, 5);
  const finActual = formatearHoraParaApi(ext.HorarioFinActual) || String(ext.HorarioFinActual).slice(0, 5);

  if (pagadas.length > 0) {
    // Pagada: sólo marcar finalizada, sin cambiar montos ni horario.
    await client.query('UPDATE "ReservaExtension" SET "Finalizada" = true, "ActualizadaEn" = now() WHERE "idExtension" = $1', [ext.idExtension]);
    return;
  }

  const mismoDia = diaYmd != null && diaYmd === ymdEnZona(now);
  const finRealMin = minutoFinReal({
    finOriginalMin: horaAMinutos(finOriginal),
    finActualMin: horaAMinutos(finActual),
    nowMin: minutosDiaEnZona(now),
    mismoDia,
  });
  const finReal = minutosAHora(finRealMin);
  const minutosReales = Math.max(0, finRealMin - horaAMinutos(finOriginal));
  const fracciones = calcularFracciones(minutosReales);
  const precioFraccion = parseFloat(ext.PrecioFraccion) || 0;
  const monto = Math.round(precioFraccion * fracciones * 100) / 100;

  // Encoger el fin de la reserva al fin real usado.
  await client.query('UPDATE "Reservas" SET "HorarioFin" = $1 WHERE "idReserva" = $2', [finReal, idReserva]);
  await client.query(
    `UPDATE "ReservaExtension"
     SET "HorarioFinActual" = $1::time, "MinutosExtension" = $2, "Fracciones" = $3, "Monto" = $4,
         "Finalizada" = true, "ActualizadaEn" = now()
     WHERE "idExtension" = $5`,
    [finReal, minutosReales, fracciones, monto, ext.idExtension]
  );

  // Si la extensión real quedó en 0 (se fue antes/justo en el fin original),
  // descartar el cargo pendiente para no dejar una transacción en $0.
  if (fracciones === 0) {
    await client.query(
      `DELETE FROM "Transaccion" WHERE "idExtension" = $1 AND "EstadoPago" <> 'Pagado'`,
      [ext.idExtension]
    );
  }
}

/**
 * Extiende una reserva EN CURSO modificando su HorarioFin (la misma reserva, no se
 * duplica). NO cobra en el momento: deja un cargo PENDIENTE de pago que se registra
 * después. La facturación es por fracciones de 30 minutos (redondeo hacia arriba) y
 * se calcula sobre el total extendido respecto del fin ORIGINAL; al cerrar el turno
 * se recalcula sobre el tiempo realmente usado.
 *
 * Estado acumulado por reserva en "ReservaExtension" (1:1) + una "Transaccion"
 * Pendiente con ClasificacionPago='extension'.
 */
export const extenderReserva = async (req, res) => {
  try {
    const idReserva = parseInt(req.params.id, 10);
    if (!Number.isFinite(idReserva) || idReserva <= 0) {
      return res.status(400).json({ message: "ID de reserva inválido." });
    }

    const minutos = parseInt(req.body?.minutos, 10);
    if (!Number.isFinite(minutos) || minutos <= 0) {
      return res.status(400).json({ message: "Indicá los minutos de extensión (mayor a 0)." });
    }
    if (minutos > 12 * 60) {
      return res.status(400).json({ message: "La extensión solicitada es demasiado larga." });
    }

    const { rows: exRows } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
    if (exRows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const reserva = exRows[0];

    const tipo = reserva.TipoReserva || "turno";
    if (tipo !== "turno") {
      return res.status(400).json({ message: "Solo se pueden extender reservas por turno." });
    }
    if ((reserva.Estado || "activa") !== "en_curso") {
      return res.status(409).json({ message: "Solo se puede extender una reserva en curso." });
    }
    if (!reserva.HorarioFin) {
      return res.status(400).json({ message: "La reserva no tiene horario de fin definido." });
    }
    // El turno no debe haber finalizado ya (reloj de pared en zona del coworking).
    if (!reservaPeriodoAunNoTermino(reserva, new Date())) {
      return res.status(409).json({ message: "El turno ya finalizó; no se puede extender." });
    }

    // Precio del recurso para calcular el cargo de la extensión.
    const { rows: recRows } = await pool.query(
      'SELECT "PrecioHora" FROM "Recursos" WHERE "idRecurso" = $1',
      [reserva.idRecurso]
    );
    const precioHora = recRows.length ? parseFloat(recRows[0].PrecioHora) || 0 : 0;
    const precioFraccion = precioHora > 0 ? Math.round((precioHora / 2) * 100) / 100 : 0;
    const creadaPor = String(req.usuario?.nombre || req.usuario?.email || "staff").slice(0, 120);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await bloquearEspaciosDeRecursos(client, [reserva.idRecurso]);

      // Revalidar dentro de la transacción (evita carreras con otra reserva/extensión).
      const { rows: freshRows } = await client.query(
        'SELECT "Estado","HorarioReserva","HorarioFin","DiaReserva" FROM "Reservas" WHERE "idReserva" = $1 FOR UPDATE',
        [idReserva]
      );
      const fresh = freshRows[0];
      if (!fresh || (fresh.Estado || "") !== "en_curso") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "La reserva ya no está en curso." });
      }

      const finActual = formatearHoraParaApi(fresh.HorarioFin) || String(fresh.HorarioFin).slice(0, 5);
      const iniActual = formatearHoraParaApi(fresh.HorarioReserva) || String(fresh.HorarioReserva).slice(0, 5);
      const nuevoFin = sumarMinutosAHora(finActual, minutos);
      if (!nuevoFin) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "La extensión supera el horario válido del día." });
      }

      // El turno extendido completo debe respetar la ventana operativa (cierre 21:00).
      const errVentana = validarVentanaOperativaTurno(iniActual, nuevoFin);
      if (errVentana) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: errVentana });
      }

      // Disponibilidad: la ventana completa extendida no debe chocar con otra reserva
      // (excluyendo la propia). Cubre recurso, grupo y espacio completo.
      const conflicto = await verificarConflictos(
        client,
        reserva.idRecurso,
        pgDateToYmd(fresh.DiaReserva),
        iniActual,
        nuevoFin,
        "turno",
        idReserva
      );
      if (conflicto) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "No se puede extender: hay otra reserva sobre este recurso en el horario solicitado.",
          detalle: conflicto,
        });
      }

      // Estado de extensión acumulado (1:1 con la reserva).
      const { rows: extRows } = await client.query(
        'SELECT * FROM "ReservaExtension" WHERE "idReserva" = $1 FOR UPDATE',
        [idReserva]
      );
      const prev = extRows[0] || null;
      // Fin original: el guardado en la extensión previa, o el fin vigente antes de extender.
      const finOriginal = prev
        ? formatearHoraParaApi(prev.HorarioFinOriginal) || String(prev.HorarioFinOriginal).slice(0, 5)
        : finActual;
      const minutosTotal = horaAMinutos(nuevoFin) - horaAMinutos(finOriginal);
      const fracciones = calcularFracciones(minutosTotal);
      const monto = Math.round(precioFraccion * fracciones * 100) / 100;

      // Extender la MISMA reserva; preservar el fin original en la primera extensión.
      await client.query(
        `UPDATE "Reservas"
         SET "HorarioFin" = $1,
             "HorarioFinOriginal" = COALESCE("HorarioFinOriginal", "HorarioFin"::time)
         WHERE "idReserva" = $2`,
        [nuevoFin, idReserva]
      );

      let extension;
      if (prev) {
        const upd = await client.query(
          `UPDATE "ReservaExtension"
           SET "Veces" = "Veces" + 1, "HorarioFinActual" = $1::time, "MinutosExtension" = $2,
               "Fracciones" = $3, "PrecioFraccion" = $4, "Monto" = $5, "ActualizadaEn" = now()
           WHERE "idReserva" = $6 RETURNING *`,
          [nuevoFin, minutosTotal, fracciones, precioFraccion, monto, idReserva]
        );
        extension = upd.rows[0];
      } else {
        const ins = await client.query(
          `INSERT INTO "ReservaExtension"
             ("idReserva","Veces","HorarioFinOriginal","HorarioFinActual","MinutosExtension","Fracciones","PrecioFraccion","Monto","CreadaPor")
           VALUES ($1,1,$2::time,$3::time,$4,$5,$6,$7,$8) RETURNING *`,
          [idReserva, finOriginal, nuevoFin, minutosTotal, fracciones, precioFraccion, monto, creadaPor]
        );
        extension = ins.rows[0];
      }

      // Asegurar UNA transacción PENDIENTE para el cargo de la extensión.
      const { rows: txExist } = await client.query(
        'SELECT "idTransaccion" FROM "Transaccion" WHERE "idExtension" = $1 ORDER BY "idTransaccion" DESC LIMIT 1',
        [extension.idExtension]
      );
      let idTransaccion;
      if (txExist.length === 0) {
        const insTx = await client.query(
          `INSERT INTO "Transaccion" ("idReserva","MetodoPago","EstadoPago","TipoPago","ClasificacionPago","idExtension")
           VALUES ($1,NULL,'Pendiente','presencial','extension',$2) RETURNING "idTransaccion"`,
          [idReserva, extension.idExtension]
        );
        idTransaccion = insTx.rows[0].idTransaccion;
      } else {
        idTransaccion = txExist[0].idTransaccion;
      }

      await client.query("COMMIT");

      const { rows: updated } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
      return res.status(201).json({
        message: "Reserva extendida — el cargo queda pendiente de pago",
        reserva: serializarHorariosReservaEnFila(updated[0]),
        extension: {
          idExtension: extension.idExtension,
          veces: extension.Veces,
          minutos: minutosTotal,
          fracciones,
          precioFraccion,
          monto,
          horarioFinOriginal: finOriginal,
          horarioFinActual: nuevoFin,
          pendiente: true,
        },
        idTransaccion,
      });
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
    console.error("Error al extender reserva:", error);
    if (error.code === "42P01" || error.code === "42703") {
      return res.status(503).json({
        message:
          "El servidor aún no tiene aplicada la migración backend/database/migration_extension_reserva.sql. Ejecutala contra Postgres y reiniciá el backend.",
      });
    }
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
      ${lateralUltimaTransaccion("r", "t")}
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
    const { rows: filasExistentes } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [idReserva]);
    if (filasExistentes.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const ex = filasExistentes[0];

    if (!esStaff(req.usuario) && !esCliente(req.usuario)) {
      return res.status(403).json({ message: "No autorizado a eliminar reservas." });
    }
    if (!puedeOperarReserva(req.usuario, ex)) {
      return res.status(403).json({ message: "No tenés permiso para eliminar esta reserva." });
    }

    const idsBorrar = await idsReservasMismoGrupo(pool, idReserva);

    for (const rid of idsBorrar) {
      const { rows: rOne } = await pool.query('SELECT * FROM "Reservas" WHERE "idReserva" = $1', [rid]);
      if (rOne.length === 0) continue;
      const mut = evaluarMutacionReserva(rOne[0]);
      if (!mut.puedeEliminar) {
        return res.status(403).json({ message: mut.mensaje, codigo: mut.codigo });
      }
    }

    if (esStaff(req.usuario)) {
      const { rows: txRows } = await pool.query(
        `SELECT t."EstadoPago"
         FROM "Transaccion" t
         WHERE t."idReserva" = ANY($1::int[])
            OR t."idTransaccion" IN (
              SELECT tr."idTransaccion" FROM "TransaccionReserva" tr WHERE tr."idReserva" = ANY($1::int[])
            )
         ORDER BY CASE WHEN t."EstadoPago" = 'Pagado' THEN 0 ELSE 1 END, t."idTransaccion" DESC
         LIMIT 1`,
        [idsBorrar]
      );
      if (String(txRows[0]?.EstadoPago ?? "").trim() === "Pagado") {
        return res.status(403).json({
          message:
            "No podés eliminar una reserva ya registrada como pagada desde Consultar reservas. Gestioná la anulación o la devolución con administración o el área financiera.",
          codigo: "pagada_staff",
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: txIdRows } = await client.query(
        `SELECT DISTINCT t."idTransaccion"
         FROM "Transaccion" t
         WHERE t."idReserva" = ANY($1::int[])
         UNION
         SELECT DISTINCT tr."idTransaccion" FROM "TransaccionReserva" tr WHERE tr."idReserva" = ANY($1::int[])`,
        [idsBorrar]
      );
      const txIds = txIdRows.map((x) => x.idTransaccion).filter((x) => x != null);
      if (txIds.length > 0) {
        await client.query('DELETE FROM "TransaccionReserva" WHERE "idTransaccion" = ANY($1::int[])', [txIds]);
        await client.query('DELETE FROM "Transaccion" WHERE "idTransaccion" = ANY($1::int[])', [txIds]);
      }
      const result = await client.query('DELETE FROM "Reservas" WHERE "idReserva" = ANY($1::int[])', [idsBorrar]);
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
