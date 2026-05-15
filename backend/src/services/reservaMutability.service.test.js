import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluarMutacionReserva,
  pgDateToYmd,
  reservaPeriodoAunNoTermino,
  addCalendarDaysYmd,
  enriquecerFilaConMutacion,
} from "./reservaMutability.service.js";

test("pgDateToYmd interpreta DATE de PG en UTC", () => {
  const d = new Date(Date.UTC(2026, 3, 15));
  assert.equal(pgDateToYmd(d), "2026-04-15");
});

test("addCalendarDaysYmd suma días de calendario en UTC", () => {
  assert.equal(addCalendarDaysYmd("2026-04-01", 6), "2026-04-07");
});

test("activa y turno con día futuro: puede mutar", () => {
  const row = {
    Estado: "activa",
    TipoReserva: "turno",
    DiaReserva: "2030-01-01",
    HorarioReserva: "10:00",
    HorarioFin: "12:00",
  };
  const ev = evaluarMutacionReserva(row, new Date("2026-04-13T15:00:00-03:00"));
  assert.equal(ev.puedeEliminar, true);
  assert.equal(ev.puedeEditar, true);
});

test("completada: no mutar aunque la fecha sea futura", () => {
  const row = {
    Estado: "completada",
    TipoReserva: "turno",
    DiaReserva: "2030-01-01",
    HorarioFin: "12:00",
  };
  const ev = evaluarMutacionReserva(row, new Date());
  assert.equal(ev.puedeEliminar, false);
  assert.match(ev.mensaje || "", /asistencia/i);
});

test("en_curso: no mutar (cliente está usando el espacio)", () => {
  const row = {
    Estado: "en_curso",
    TipoReserva: "turno",
    DiaReserva: "2026-04-13",
    HorarioReserva: "15:00",
    HorarioFin: "18:00",
  };
  const ev = evaluarMutacionReserva(row, new Date("2026-04-13T16:00:00-03:00"));
  assert.equal(ev.puedeEditar, false);
  assert.equal(ev.puedeEliminar, false);
  assert.equal(ev.codigo, "en_curso");
  assert.match(ev.mensaje || "", /curso/i);
});

test("no_asistio: no mutar", () => {
  const row = {
    Estado: "no_asistio",
    TipoReserva: "turno",
    DiaReserva: "2026-04-10",
    HorarioFin: "12:00",
  };
  const ev = evaluarMutacionReserva(row, new Date("2026-04-13T12:00:00-03:00"));
  assert.equal(ev.puedeEliminar, false);
});

test("turno mismo día: vigente si aún no pasó HorarioFin (zona AR)", () => {
  const row = {
    Estado: "activa",
    TipoReserva: "turno",
    DiaReserva: "2026-04-13",
    HorarioFin: "18:00",
  };
  const ok = reservaPeriodoAunNoTermino(row, new Date("2026-04-13T14:00:00-03:00"));
  assert.equal(ok, true);
});

test("turno mismo día: no vigente después de HorarioFin", () => {
  const row = {
    Estado: "activa",
    TipoReserva: "turno",
    DiaReserva: "2026-04-13",
    HorarioFin: "10:00",
  };
  const ok = reservaPeriodoAunNoTermino(row, new Date("2026-04-13T14:00:00-03:00"));
  assert.equal(ok, false);
});

test("staffNoEliminarSiPagado: bloquea eliminar si EstadoPago es Pagado", () => {
  const cruda = {
    Estado: "activa",
    TipoReserva: "turno",
    DiaReserva: "2030-06-01",
    HorarioFin: "12:00",
    EstadoPago: "Pagado",
  };
  const out = enriquecerFilaConMutacion({ idReserva: 1 }, cruda, new Date(), {
    staffNoEliminarSiPagado: true,
  });
  assert.equal(out.puedeEditar, true);
  assert.equal(out.puedeEliminar, false);
  assert.ok(out.mensajeNoEliminar);
});

test("sin staffNoEliminarSiPagado: pagada sigue pudiendo eliminar a nivel API enrich", () => {
  const cruda = {
    Estado: "activa",
    TipoReserva: "turno",
    DiaReserva: "2030-06-01",
    HorarioFin: "12:00",
    EstadoPago: "Pagado",
  };
  const out = enriquecerFilaConMutacion({ idReserva: 1 }, cruda);
  assert.equal(out.puedeEliminar, true);
});
