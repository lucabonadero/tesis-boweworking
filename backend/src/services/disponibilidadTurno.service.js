import pool from "../config/db.js";
import { mensajeTurnoNoDisponibleParaFila } from "./reservaRules.service.js";

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
    resultados.push({ ...rec, disponible: parseInt(conflicto[0].n) === 0, esGrupo: false });
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
