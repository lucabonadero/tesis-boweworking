import test from "node:test";
import assert from "node:assert/strict";
import {
  ROL_ESTUDIANTE,
  TIPOS_RESERVA_CON_BENEFICIO,
  esEstudianteElegible,
  tipoAplicaBeneficio,
  aplicarBeneficioAMontos,
} from "./beneficioEstudiante.service.js";

test("solo cliente con rol estudiante es elegible", () => {
  assert.equal(esEstudianteElegible({ tipo: "cliente", rol: ROL_ESTUDIANTE }), true);
  assert.equal(esEstudianteElegible({ tipo: "cliente", rol: "usuario" }), false);
  assert.equal(esEstudianteElegible({ tipo: "staff", rol: ROL_ESTUDIANTE }), false);
  assert.equal(esEstudianteElegible(null), false);
});

test("el beneficio solo aplica a turno", () => {
  assert.equal(tipoAplicaBeneficio("turno"), true);
  assert.equal(tipoAplicaBeneficio("semanal"), false);
  assert.equal(tipoAplicaBeneficio("mensual"), false);
  assert.deepEqual(TIPOS_RESERVA_CON_BENEFICIO, ["turno"]);
});

test("recurso marcado queda en monto 0", () => {
  const r = aplicarBeneficioAMontos([{ idRecurso: 1, monto: 500 }], new Set([1]));
  assert.equal(r.montos[0].monto, 0);
  assert.deepEqual(r.recursosGratuitos, [1]);
  assert.equal(r.montoOriginal, 500);
  assert.equal(r.montoFinal, 0);
});

test("recurso no marcado paga el monto completo", () => {
  const r = aplicarBeneficioAMontos([{ idRecurso: 1, monto: 500 }], new Set([2]));
  assert.equal(r.montos[0].monto, 500);
  assert.deepEqual(r.recursosGratuitos, []);
  assert.equal(r.montoFinal, 500);
});

test("reserva múltiple mixta: cobra solo lo no marcado", () => {
  const r = aplicarBeneficioAMontos(
    [
      { idRecurso: 1, monto: 500 },
      { idRecurso: 2, monto: 300 },
    ],
    new Set([1])
  );
  assert.equal(r.montos[0].monto, 0);
  assert.equal(r.montos[1].monto, 300);
  assert.equal(r.montoOriginal, 800);
  assert.equal(r.montoFinal, 300);
  assert.deepEqual(r.recursosGratuitos, [1]);
});

test("set vacío no cambia ningún monto", () => {
  const r = aplicarBeneficioAMontos([{ idRecurso: 1, monto: 500 }], new Set());
  assert.equal(r.montos[0].monto, 500);
  assert.deepEqual(r.recursosGratuitos, []);
});

test("acepta array además de Set para idsConBeneficio", () => {
  const r = aplicarBeneficioAMontos([{ idRecurso: 7, monto: 100 }], [7]);
  assert.equal(r.montos[0].monto, 0);
});
