import pool from "../config/db.js";
import { obtenerDisponibilidadTurno } from "./disponibilidadTurno.service.js";
import { permiteReservaPorTurno } from "./reservaRules.service.js";

const ZONA_POR_DEFECTO = "America/Argentina/Buenos_Aires";

export function fechaHoyEnZona(timeZone = ZONA_POR_DEFECTO) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function sumarDiasYmd(ymd, deltaDias, timeZone = ZONA_POR_DEFECTO) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d, 12, 0, 0);
  const next = new Date(utc + deltaDias * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Catálogo de recursos reservables por turno (hojas + reglas de negocio). */
export async function armarCatalogoReservasTurno() {
  const { rows: recursos } = await pool.query(`
    SELECT r."idRecurso", r."idEspacio", r."idRecursoPadre", r."Nombre", r."Descripcion",
           r."esCompleto", r."PrecioHora",
           e."Nombre" AS espacio_nombre, e."Capacidad" AS capacidad_espacio
    FROM "Recursos" r
    LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
    ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."idRecurso"
  `);

  const hijosPorPadre = new Set(
    recursos.filter((r) => r.idRecursoPadre != null).map((r) => r.idRecursoPadre)
  );

  const out = [];
  for (const r of recursos) {
    if (hijosPorPadre.has(r.idRecurso)) continue;
    const permite = await permiteReservaPorTurno(r.idRecurso);
    if (!permite) continue;
    out.push({
      idRecurso: r.idRecurso,
      idEspacio: r.idEspacio,
      nombre: r.Nombre,
      descripcion: r.Descripcion || "",
      espacioNombre: r.espacio_nombre || "",
      capacidadEspacio: r.capacidad_espacio ?? null,
      precioHora: r.PrecioHora != null ? Number(r.PrecioHora) : null,
      esCompleto: Boolean(r.esCompleto),
    });
  }
  return out;
}

// Ventana de turnos reales según la base de datos (solo ids que el modelo puede citar).
// limitSlots evita armar prompts enormes.
export async function armarVentanaDisponibilidad({
  timeZone = ZONA_POR_DEFECTO,
  dias = 5,
  horaInicioDia = 9,
  horaFinDia = 21,
  duracionSlotHoras = 2,
  limitSlots = 40,
  fechaBaseYmd = null,
} = {}) {
  const inicio = fechaBaseYmd || fechaHoyEnZona(timeZone);
  const catalogo = await armarCatalogoReservasTurno();
  const idsPermitidos = new Set(catalogo.map((c) => c.idRecurso));
  const slots = [];

  for (let d = 0; d < dias && slots.length < limitSlots; d++) {
    const fecha = sumarDiasYmd(inicio, d, timeZone);
    for (let h = horaInicioDia; h + duracionSlotHoras <= horaFinDia && slots.length < limitSlots; h += duracionSlotHoras) {
      const hi = `${pad2(h)}:00`;
      const hf = `${pad2(h + duracionSlotHoras)}:00`;
      const disp = await obtenerDisponibilidadTurno(fecha, hi, hf);
      const idsDisponibles = disp
        .filter((r) => !r.esGrupo && r.disponible === true && idsPermitidos.has(r.idRecurso))
        .map((r) => r.idRecurso);
      if (idsDisponibles.length > 0) {
        slots.push({
          fecha,
          horaInicio: hi,
          horaFin: hf,
          idsDisponibles,
        });
      }
    }
  }

  return { catalogo, slots, meta: { timeZone, fechaInicioVentana: inicio, dias, generadoEn: new Date().toISOString() } };
}
