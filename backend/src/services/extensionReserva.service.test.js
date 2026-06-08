import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularFracciones,
  calcularMontoExtension,
  sumarMinutosAHora,
  horaAMinutos,
  minutosAHora,
  minutoFinReal,
} from "./extensionReserva.service.js";

test("calcularFracciones redondea hacia arriba a bloques de 30 min", () => {
  assert.equal(calcularFracciones(40), 2); // caso 1 del requerimiento
  assert.equal(calcularFracciones(15), 1); // caso 2
  assert.equal(calcularFracciones(80), 3); // caso 3 (1h20)
  assert.equal(calcularFracciones(30), 1);
  assert.equal(calcularFracciones(60), 2);
  assert.equal(calcularFracciones(90), 3);
  assert.equal(calcularFracciones(120), 4);
});

test("calcularFracciones con entradas inválidas devuelve 0", () => {
  assert.equal(calcularFracciones(0), 0);
  assert.equal(calcularFracciones(-10), 0);
  assert.equal(calcularFracciones("abc"), 0);
});

test("calcularMontoExtension: fracción = mitad del PrecioHora", () => {
  // PrecioHora 1000 → fracción 500. 40 min → 2 fracciones → 1000.
  assert.deepEqual(calcularMontoExtension(1000, 40), {
    fracciones: 2,
    precioFraccion: 500,
    monto: 1000,
  });
  // 15 min → 1 fracción → 500.
  assert.deepEqual(calcularMontoExtension(1000, 15), {
    fracciones: 1,
    precioFraccion: 500,
    monto: 500,
  });
});

test("calcularMontoExtension sin PrecioHora cargado → monto 0", () => {
  assert.deepEqual(calcularMontoExtension(0, 60), { fracciones: 2, precioFraccion: 0, monto: 0 });
  assert.deepEqual(calcularMontoExtension(null, 60), { fracciones: 2, precioFraccion: 0, monto: 0 });
});

test("calcularMontoExtension redondea a 2 decimales", () => {
  // PrecioHora 1500 → fracción 750. 80 min → 3 fracciones → 2250.
  const r = calcularMontoExtension(1500, 80);
  assert.equal(r.fracciones, 3);
  assert.equal(r.precioFraccion, 750);
  assert.equal(r.monto, 2250);
});

test("sumarMinutosAHora suma correctamente", () => {
  assert.equal(sumarMinutosAHora("16:00", 40), "16:40");
  assert.equal(sumarMinutosAHora("20:30", 30), "21:00");
  assert.equal(sumarMinutosAHora("16:00:00", 90), "17:30");
});

test("sumarMinutosAHora devuelve null si cruza el día", () => {
  assert.equal(sumarMinutosAHora("23:30", 40), null);
});

test("horaAMinutos y minutosAHora son inversos", () => {
  assert.equal(horaAMinutos("09:45"), 585);
  assert.equal(minutosAHora(585), "09:45");
});

test("minutoFinReal: se fue antes → cobra el tiempo real (no lo reservado)", () => {
  // Original 16:00 (960), extendió a 18:00 (1080), se va 16:50 (1010).
  const fin = minutoFinReal({ finOriginalMin: 960, finActualMin: 1080, nowMin: 1010, mismoDia: true });
  assert.equal(fin, 1010); // 16:50 → extensión real 50 min → 2 fracciones
  assert.equal(minutosAHora(fin), "16:50");
});

test("minutoFinReal: usó toda la ventana → cobra lo reservado", () => {
  const fin = minutoFinReal({ finOriginalMin: 960, finActualMin: 1080, nowMin: 1200, mismoDia: true });
  assert.equal(fin, 1080); // no más que finActual
});

test("minutoFinReal: cierre otro día → cobra la ventana extendida completa", () => {
  const fin = minutoFinReal({ finOriginalMin: 960, finActualMin: 1080, nowMin: 120, mismoDia: false });
  assert.equal(fin, 1080);
});

test("minutoFinReal: nunca menos que el fin original", () => {
  const fin = minutoFinReal({ finOriginalMin: 960, finActualMin: 1080, nowMin: 900, mismoDia: true });
  assert.equal(fin, 960);
});
