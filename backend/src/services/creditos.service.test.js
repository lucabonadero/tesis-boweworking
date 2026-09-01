import test from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_MOVIMIENTO,
  PESOS_POR_CREDITO_DEFECTO,
  creditosParaMonto,
  creditosParaMontos,
  evaluarDescuentoReserva,
  evaluarAjusteManual,
  normalizarPaquete,
  referenciaCompra,
  parsearReferenciaCompra,
  estadoCompraParaPago,
} from "./creditos.service.js";

test("el reintegro por cancelación queda preparado aunque no se implemente aún", () => {
  assert.ok(TIPOS_MOVIMIENTO.includes("reintegro_cancelacion"));
  assert.ok(TIPOS_MOVIMIENTO.includes("descuento_reserva"));
  assert.ok(TIPOS_MOVIMIENTO.includes("ajuste_admin"));
  assert.ok(TIPOS_MOVIMIENTO.includes("compra_paquete"));
});

test("monto exacto: un múltiplo no redondea de más", () => {
  assert.equal(creditosParaMonto(3000, 100), 30);
});

test("monto con resto: siempre redondea hacia arriba", () => {
  assert.equal(creditosParaMonto(2550, 100), 26);
  assert.equal(creditosParaMonto(1, 100), 1);
});

test("monto cero no cuesta créditos", () => {
  assert.equal(creditosParaMonto(0, 100), 0);
});

test("montos negativos o inválidos se tratan como cero", () => {
  assert.equal(creditosParaMonto(-500, 100), 0);
  assert.equal(creditosParaMonto(null, 100), 0);
  assert.equal(creditosParaMonto("abc", 100), 0);
});

test("tasa inválida cae al valor por defecto en lugar de dividir por cero", () => {
  assert.equal(creditosParaMonto(2000, 0), creditosParaMonto(2000, PESOS_POR_CREDITO_DEFECTO));
  assert.equal(creditosParaMonto(2000, null), 20);
});

test("reserva múltiple: se redondea el total, no cada renglón", () => {
  // Tres renglones de $150 son $450: 5 créditos. Redondear uno por uno daría 6
  // y le cobraría de más al cliente.
  assert.equal(creditosParaMontos([150, 150, 150], 100), 5);
});

test("cotizar una lista vacía no cuesta créditos", () => {
  assert.equal(creditosParaMontos([], 100), 0);
});

test("saldo suficiente: descuenta y deja el saldo posterior calculado", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 100, montoEnPesos: 3000, pesosPorCredito: 100 });

  assert.equal(r.ok, true);
  assert.equal(r.creditosNecesarios, 30);
  assert.equal(r.saldoPosterior, 70);
  assert.equal(r.requiereMovimiento, true);
  assert.equal(r.creditosFaltantes, 0);
});

test("saldo justo: alcanza y deja el saldo en cero", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 30, montoEnPesos: 3000, pesosPorCredito: 100 });

  assert.equal(r.ok, true);
  assert.equal(r.saldoPosterior, 0);
});

test("saldo insuficiente: informa cuántos créditos faltan para poder comprarlos", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 12, montoEnPesos: 3000, pesosPorCredito: 100 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SALDO_INSUFICIENTE");
  assert.equal(r.creditosNecesarios, 30);
  assert.equal(r.creditosFaltantes, 18, "la interfaz abre la compra con este número");
});

test("reserva sin costo: se permite y no genera movimiento", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 0, montoEnPesos: 0, pesosPorCredito: 100 });

  assert.equal(r.ok, true);
  assert.equal(r.creditosNecesarios, 0);
  assert.equal(r.requiereMovimiento, false, "un movimiento de cantidad 0 viola el CHECK de la tabla");
  assert.equal(r.saldoPosterior, 0);
});

test("saldo negativo previo: no se puede reservar hasta regularizar", () => {
  const r = evaluarDescuentoReserva({ saldoActual: -5, montoEnPesos: 1000, pesosPorCredito: 100 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SALDO_INSUFICIENTE");
  assert.equal(r.creditosFaltantes, 15);
});

test("acreditación con motivo: suma al saldo", () => {
  const r = evaluarAjusteManual({ saldoActual: 5, cantidad: 10, motivo: "Compra presencial" });

  assert.equal(r.ok, true);
  assert.equal(r.cantidad, 10);
  assert.equal(r.saldoPosterior, 15);
  assert.equal(r.motivo, "Compra presencial");
});

test("débito que deja saldo positivo: permitido", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: -4, motivo: "Corrección de carga" });

  assert.equal(r.ok, true);
  assert.equal(r.saldoPosterior, 6);
});

test("motivo obligatorio: sin motivo se rechaza", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 5, motivo: "" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("motivo de solo espacios no cuenta como motivo", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 5, motivo: "   " });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("el motivo se recorta antes de guardarse", () => {
  const r = evaluarAjusteManual({ saldoActual: 0, cantidad: 3, motivo: "  Premio de fidelidad  " });

  assert.equal(r.ok, true);
  assert.equal(r.motivo, "Premio de fidelidad");
});

test("cantidad cero: no es un ajuste, se rechaza", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 0, motivo: "Sin efecto" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CANTIDAD_INVALIDA");
});

test("cantidad decimal: los créditos son enteros", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 2.5, motivo: "Medio crédito" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CANTIDAD_INVALIDA");
});

test("débito que dejaría saldo negativo: bloqueado por defecto", () => {
  const r = evaluarAjusteManual({ saldoActual: 3, cantidad: -10, motivo: "Penalización" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SALDO_NEGATIVO_NO_AUTORIZADO");
  assert.ok(r.mensaje.includes("-7"), "el mensaje debe mostrar el saldo que quedaría");
});

test("saldo negativo permitido cuando el admin lo autoriza explícitamente", () => {
  const r = evaluarAjusteManual({
    saldoActual: 3,
    cantidad: -10,
    motivo: "Penalización por no presentarse",
    permitirNegativo: true,
  });

  assert.equal(r.ok, true);
  assert.equal(r.saldoPosterior, -7);
});

test("el flag permitirNegativo no exime del motivo obligatorio", () => {
  const r = evaluarAjusteManual({
    saldoActual: 3,
    cantidad: -10,
    motivo: "",
    permitirNegativo: true,
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("paquete válido: se normaliza nombre y tipos", () => {
  const r = normalizarPaquete({
    nombre: "  Pack 100  ",
    creditos: "100",
    precio: "10000.5",
    descripcion: "  Cien créditos  ",
  });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.nombre, "Pack 100");
  assert.equal(r.paquete.creditos, 100);
  assert.equal(r.paquete.precio, 10000.5);
  assert.equal(r.paquete.descripcion, "Cien créditos");
});

test("descripción vacía se guarda como null, no como cadena vacía", () => {
  const r = normalizarPaquete({ nombre: "Pack 5", creditos: 5, precio: 4000, descripcion: "   " });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.descripcion, null);
});

test("paquete sin nombre: se rechaza", () => {
  const r = normalizarPaquete({ nombre: "  ", creditos: 5, precio: 4000 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "NOMBRE_REQUERIDO");
});

test("paquete de cero créditos: no tiene sentido vender nada", () => {
  const r = normalizarPaquete({ nombre: "Pack vacío", creditos: 0, precio: 4000 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CREDITOS_INVALIDOS");
});

test("créditos decimales en un paquete: se rechazan", () => {
  const r = normalizarPaquete({ nombre: "Pack raro", creditos: 2.5, precio: 4000 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CREDITOS_INVALIDOS");
});

test("precio negativo: se rechaza", () => {
  const r = normalizarPaquete({ nombre: "Pack regalo", creditos: 5, precio: -1 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "PRECIO_INVALIDO");
});

test("precio cero: permitido, es un paquete promocional", () => {
  const r = normalizarPaquete({ nombre: "Bienvenida", creditos: 2, precio: 0 });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.precio, 0);
});

test("el precio se redondea a dos decimales: la columna es NUMERIC(10,2)", () => {
  const r = normalizarPaquete({ nombre: "Pack", creditos: 5, precio: 1000.567 });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.precio, 1000.57);
});

test("la referencia de compra se puede volver a leer", () => {
  assert.equal(referenciaCompra(42), "creditos-42");
  assert.equal(parsearReferenciaCompra("creditos-42"), 42);
});

test("una referencia de reserva antigua no se confunde con una compra", () => {
  // El webhook sigue recibiendo notificaciones de pagos de reserva viejos:
  // deben ignorarse, no acreditar créditos.
  assert.equal(parsearReferenciaCompra("17"), null);
  assert.equal(parsearReferenciaCompra(""), null);
  assert.equal(parsearReferenciaCompra(null), null);
  assert.equal(parsearReferenciaCompra("creditos-abc"), null);
});

test("solo un pago aprobado acredita créditos", () => {
  assert.equal(estadoCompraParaPago("approved"), "acreditada");
  assert.equal(estadoCompraParaPago("rejected"), "rechazada");
  assert.equal(estadoCompraParaPago("cancelled"), "rechazada");
  assert.equal(estadoCompraParaPago("pending"), null, "un pago pendiente no cambia el estado");
  assert.equal(estadoCompraParaPago("in_process"), null);
});
