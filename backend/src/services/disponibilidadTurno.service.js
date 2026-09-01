import pool from "../config/db.js";
import { mensajeTurnoNoDisponibleParaFila } from "./reservaRules.service.js";
import {
  obtenerCadenasRecursos,
  obtenerBloqueosSolapados,
  obtenerFranjasDeRecursos,
} from "../repositories/disponibilidadRecurso.repository.js";
import { diaSemanaDeYmd, turnoEntraEnFranjas } from "./disponibilidadRecurso.rules.js";

// Disponibilidad por turno (fecha + rango horario), misma lógica que GET /api/recursos/disponibilidad.
// Centralizado para reutilizarlo en la IA y no duplicar las reglas de conflicto.
export async function obtenerDisponibilidadTurno(fecha, horaInicio, horaFin) {
  const fechaConsulta = fecha;
  const dias = 0;
  const qHoraIni = horaInicio;
  const qHoraFin = horaFin;
  const qTipo = "turno";

  const { rows: recursos } = await pool.query(`
    SELECT r.*, e."Nombre" AS espacio_nombre, COALESCE(p."Nombre",'') AS parent_name
    FROM "Recursos" r
    LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
    LEFT JOIN "Recursos" p ON r."idRecursoPadre" = p."idRecurso"
    WHERE r."Activo" = true
    ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."Orden", r."idRecurso"
  `);

  // Hojas (no-grupo): las que necesitan resolución de bloqueos/franjas.
  const idsHojas = recursos
    .filter((rec) => !recursos.some((r) => r.idRecursoPadre === rec.idRecurso))
    .map((r) => r.idRecurso);

  // Batch: una sola query para la cadena de ancestros de todas las hojas, una para
  // bloqueos solapados de todo ese conjunto (recurso + ancestros), una para franjas.
  const cadenas = await obtenerCadenasRecursos(pool, idsHojas);
  const idsCadena = [...new Set(cadenas.map((c) => c.idRecurso))];
  const inicioRango = `${fechaConsulta}T${String(qHoraIni).slice(0, 5)}:00`;
  const finRango = `${fechaConsulta}T${String(qHoraFin).slice(0, 5)}:00`;
  const [bloqueos, franjasTodas] = await Promise.all([
    obtenerBloqueosSolapados(pool, idsCadena, inicioRango, finRango),
    obtenerFranjasDeRecursos(pool, idsHojas),
  ]);

  const diaSemana = diaSemanaDeYmd(fechaConsulta);
  const nombreDeId = new Map(recursos.map((r) => [r.idRecurso, r.Nombre]));

  const resultados = [];
  for (const rec of recursos) {
    const tieneHijos = recursos.some((r) => r.idRecursoPadre === rec.idRecurso);
    if (tieneHijos) {
      resultados.push({ ...rec, disponible: null, esGrupo: true });
      continue;
    }

    const { rows: conflicto } = await pool.query(
      `SELECT COUNT(*) AS n FROM "Reservas" res WHERE res."idRecurso" = $1 AND (
        (COALESCE(res."TipoReserva",'turno') = 'turno' AND (
          CASE $2
            WHEN 'turno' THEN res."DiaReserva" = $3::DATE AND res."HorarioReserva"::TIME < $5::TIME AND res."HorarioFin"::TIME > $4::TIME
            ELSE res."DiaReserva" BETWEEN $3::DATE AND ($3::DATE + $6::INT)
          END))
        OR (res."TipoReserva" = 'semanal' AND (
          CASE $2
            WHEN 'turno' THEN $3::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 6)
            ELSE res."DiaReserva" <= ($3::DATE + $6::INT) AND (res."DiaReserva"::DATE + 6) >= $3::DATE
          END))
        OR (res."TipoReserva" = 'mensual' AND (
          CASE $2
            WHEN 'turno' THEN $3::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 29)
            ELSE res."DiaReserva" <= ($3::DATE + $6::INT) AND (res."DiaReserva"::DATE + 29) >= $3::DATE
          END))
      )`,
      [rec.idRecurso, qTipo, fechaConsulta, qHoraIni, qHoraFin, dias]
    );

    let disponible = parseInt(conflicto[0].n) === 0;
    let motivoNoDisponible = null;

    if (disponible) {
      // 1. Bloqueos: contra el propio recurso y toda su cadena de ancestros.
      const idsPropios = cadenas.filter((c) => c.idOrigen === rec.idRecurso).map((c) => c.idRecurso);
      const bloqueo = bloqueos.find((b) => idsPropios.includes(b.idRecurso));
      if (bloqueo) {
        disponible = false;
        const nombreBloqueado = nombreDeId.get(bloqueo.idRecurso) ?? rec.Nombre;
        motivoNoDisponible =
          bloqueo.idRecurso === rec.idRecurso
            ? "Bloqueado por el administrador."
            : `Bloqueado por el administrador (${nombreBloqueado}).`;
      }
    }

    if (disponible) {
      // 2. Disponibilidad configurada. Sin franjas propias, vale la ventana global.
      const franjasDelRecurso = franjasTodas.filter((f) => f.idRecurso === rec.idRecurso);
      if (franjasDelRecurso.length > 0) {
        const delDia = franjasDelRecurso.filter((f) => f.DiaSemana === diaSemana);
        if (delDia.length === 0) {
          disponible = false;
          motivoNoDisponible = "No disponible ese día según su horario configurado.";
        } else if (!turnoEntraEnFranjas(qHoraIni, qHoraFin, delDia)) {
          disponible = false;
          motivoNoDisponible = "Fuera del horario disponible configurado.";
        }
      }
    }

    resultados.push({ ...rec, disponible, esGrupo: false, motivoNoDisponible });
  }

  for (const rec of resultados) {
    if (rec.esGrupo) continue;
    if (rec.esCompleto && rec.disponible) {
      const hermanos = resultados.filter(
        (r) =>
          !r.esGrupo &&
          !r.esCompleto &&
          ((rec.idRecursoPadre && r.idRecursoPadre === rec.idRecursoPadre) ||
            (!rec.idRecursoPadre && r.idEspacio === rec.idEspacio && !r.idRecursoPadre))
      );
      if (hermanos.some((s) => !s.disponible)) {
        rec.disponible = false;
      }
    }
    if (!rec.esCompleto && rec.disponible) {
      const recursoCompleto = resultados.find(
        (r) =>
          r.esCompleto &&
          !r.esGrupo &&
          !r.disponible === false &&
          ((rec.idRecursoPadre && r.idRecursoPadre === rec.idRecursoPadre) ||
            (!rec.idRecursoPadre && r.idEspacio === rec.idEspacio && !r.idRecursoPadre))
      );
      if (recursoCompleto && recursoCompleto.disponible === false) {
        rec.disponible = false;
      }
    }
  }

  return resultados.filter((r) => {
    if (r.esGrupo) {
      return r.EsReservablePorTurno !== false;
    }
    return r.EsReservablePorTurno !== false && mensajeTurnoNoDisponibleParaFila(r) == null;
  });
}

/** Devuelve true si el recurso está libre en ese turno (y es hoja reservable). */
export async function recursoDisponibleEnTurno(idRecurso, fecha, horaInicio, horaFin) {
  const rows = await obtenerDisponibilidadTurno(fecha, horaInicio, horaFin);
  const r = rows.find((x) => x.idRecurso === idRecurso);
  return Boolean(r && !r.esGrupo && r.disponible === true);
}
