import test from "node:test";
import assert from "node:assert/strict";
import {
  rangosSeSolapan,
  diaSemanaDeYmd,
  sumarDiasYmd,
  diasAbarcados,
  turnoEntraEnFranjas,
  formatearFechaHoraCorta,
  mensajeRecursoBloqueado,
  mensajeFueraDeDisponibilidad,
  mensajeDiaNoDisponible,
  CODIGOS,
} from "./disponibilidadRecurso.rules.js";

test("rangosSeSolapan: solape parcial por el inicio", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T10:00:00", "2026-03-10T14:00:00", "2026-03-10T12:00:00", "2026-03-10T16:00:00"),
    true
  );
});

test("rangosSeSolapan: solape parcial por el fin", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T12:00:00", "2026-03-10T16:00:00", "2026-03-10T10:00:00", "2026-03-10T14:00:00"),
    true
  );
});

test("rangosSeSolapan: B contiene a A", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T12:00:00", "2026-03-10T13:00:00", "2026-03-10T09:00:00", "2026-03-10T18:00:00"),
    true
  );
});

test("rangosSeSolapan: adyacentes no solapan (fin == inicio)", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T09:00:00", "2026-03-10T12:00:00", "2026-03-10T12:00:00", "2026-03-10T15:00:00"),
    false
  );
});

test("rangosSeSolapan: disjuntos", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T09:00:00", "2026-03-10T10:00:00", "2026-03-11T09:00:00", "2026-03-11T10:00:00"),
    false
  );
});

test("diaSemanaDeYmd: domingo es 0", () => {
  assert.equal(diaSemanaDeYmd("2026-03-08"), 0);
});

test("diaSemanaDeYmd: lunes es 1", () => {
  assert.equal(diaSemanaDeYmd("2026-03-09"), 1);
});

test("sumarDiasYmd cruza fin de mes", () => {
  assert.equal(sumarDiasYmd("2026-03-30", 3), "2026-04-02");
});

test("diasAbarcados: turno devuelve un solo día", () => {
  assert.deepEqual(diasAbarcados("2026-03-10", "turno"), ["2026-03-10"]);
});

test("diasAbarcados: semanal devuelve 7 días", () => {
  const dias = diasAbarcados("2026-03-10", "semanal");
  assert.equal(dias.length, 7);
  assert.equal(dias[0], "2026-03-10");
  assert.equal(dias[6], "2026-03-16");
});

test("diasAbarcados: mensual devuelve 30 días", () => {
  const dias = diasAbarcados("2026-03-10", "mensual");
  assert.equal(dias.length, 30);
  assert.equal(dias[29], "2026-04-08");
});

test("turnoEntraEnFranjas: turno contenido en una franja", () => {
  const franjas = [{ HoraInicio: "10:00", HoraFin: "18:00" }];
  assert.equal(turnoEntraEnFranjas("12:00", "14:00", franjas), true);
});

test("turnoEntraEnFranjas: turno que se pasa del fin de la franja", () => {
  const franjas = [{ HoraInicio: "10:00", HoraFin: "18:00" }];
  assert.equal(turnoEntraEnFranjas("17:00", "19:00", franjas), false);
});

test("turnoEntraEnFranjas: turno que empieza antes de la franja", () => {
  const franjas = [{ HoraInicio: "10:00", HoraFin: "18:00" }];
  assert.equal(turnoEntraEnFranjas("09:00", "11:00", franjas), false);
});

test("turnoEntraEnFranjas: turno a caballo del corte de mediodía no entra", () => {
  const franjas = [
    { HoraInicio: "09:00", HoraFin: "13:00" },
    { HoraInicio: "15:00", HoraFin: "19:00" },
  ];
  assert.equal(turnoEntraEnFranjas("12:00", "16:00", franjas), false);
});

test("turnoEntraEnFranjas: turno dentro de la segunda franja", () => {
  const franjas = [
    { HoraInicio: "09:00", HoraFin: "13:00" },
    { HoraInicio: "15:00", HoraFin: "19:00" },
  ];
  assert.equal(turnoEntraEnFranjas("16:00", "18:00", franjas), true);
});

test("turnoEntraEnFranjas: sin franjas usa la ventana global 09:00-21:00", () => {
  assert.equal(turnoEntraEnFranjas("10:00", "12:00", []), true);
  assert.equal(turnoEntraEnFranjas("08:00", "10:00", []), false);
  assert.equal(turnoEntraEnFranjas("20:00", "22:00", []), false);
});

test("turnoEntraEnFranjas: acepta TIME de Postgres con segundos", () => {
  const franjas = [{ HoraInicio: "10:00:00", HoraFin: "18:00:00" }];
  assert.equal(turnoEntraEnFranjas("12:00", "14:00", franjas), true);
});

test("formatearFechaHoraCorta arma DD/MM a las HH:MM", () => {
  assert.equal(formatearFechaHoraCorta("2026-03-12T18:00:00"), "12/03 a las 18:00");
});

test("mensajeRecursoBloqueado incluye nombre, fecha y motivo", () => {
  const err = mensajeRecursoBloqueado("Sala Norte", {
    idBloqueo: 7,
    FechaFin: "2026-03-12T18:00:00",
    Motivo: "Mantenimiento",
  });
  assert.equal(err.codigo, CODIGOS.RECURSO_BLOQUEADO);
  assert.match(err.message, /Sala Norte/);
  assert.match(err.message, /12\/03 a las 18:00/);
  assert.match(err.message, /Mantenimiento/);
  assert.equal(err.detalle.idBloqueo, 7);
});

test("mensajeRecursoBloqueado sin motivo no rompe", () => {
  const err = mensajeRecursoBloqueado("Sala Norte", {
    idBloqueo: 8,
    FechaFin: "2026-03-12T18:00:00",
    Motivo: null,
  });
  assert.match(err.message, /Sala Norte/);
  assert.doesNotMatch(err.message, /null/);
});

test("mensajeFueraDeDisponibilidad nombra el día y las franjas", () => {
  const err = mensajeFueraDeDisponibilidad("Sala Norte", "2026-03-10", [
    { HoraInicio: "10:00", HoraFin: "18:00" },
  ]);
  assert.equal(err.codigo, CODIGOS.FUERA_DE_DISPONIBILIDAD);
  assert.match(err.message, /martes/i);
  assert.match(err.message, /10:00 a 18:00/);
});

test("mensajeDiaNoDisponible nombra el día en plural", () => {
  const err = mensajeDiaNoDisponible("Sala Norte", "2026-03-08");
  assert.equal(err.codigo, CODIGOS.DIA_NO_DISPONIBLE);
  assert.match(err.message, /domingos/i);
});
