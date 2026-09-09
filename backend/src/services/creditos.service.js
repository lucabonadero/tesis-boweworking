/**
 * Reglas del sistema de créditos (RF06 - RF10).
 *
 * Lógica pura: los controladores leen el estado, llaman a estas funciones y
 * aplican el resultado dentro de una transacción. Separar la decisión del SQL
 * permite testear los bordes sin base de datos.
 */

/** Debe coincidir con el CHECK de creditos_movimiento. */
export const TIPOS_MOVIMIENTO = [
  "descuento_reserva",
  "ajuste_admin",
  "compra_paquete",
  "reintegro_cancelacion",
];

export const PESOS_POR_CREDITO_DEFECTO = 100;

/** Distingue una compra de créditos de una referencia de reserva antigua. */
export const PREFIJO_REFERENCIA_COMPRA = "creditos-";

function aNumero(valor, porDefecto = 0) {
  const n = typeof valor === "number" ? valor : Number.parseFloat(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

function tasaValida(pesosPorCredito) {
  const tasa = aNumero(pesosPorCredito, 0);
  return tasa > 0 ? tasa : PESOS_POR_CREDITO_DEFECTO;
}

/** Redondea hacia arriba: no se cobran fracciones de crédito. */
export function creditosParaMonto(montoEnPesos, pesosPorCredito) {
  const monto = aNumero(montoEnPesos, 0);
  if (monto <= 0) return 0;
  return Math.ceil(monto / tasaValida(pesosPorCredito));
}

/**
 * Costo de una reserva de varios recursos. Suma primero y redondea una sola
 * vez: redondear cada renglón por separado le cobraría de más al cliente.
 */
export function creditosParaMontos(montos, pesosPorCredito) {
  if (!Array.isArray(montos) || montos.length === 0) return 0;
  const total = montos.reduce((acc, m) => acc + aNumero(m, 0), 0);
  return creditosParaMonto(total, pesosPorCredito);
}

/**
 * Decide si una reserva puede pagarse con el saldo disponible.
 *
 * `creditosFaltantes` es lo que la interfaz usa para abrir la compra con el
 * número ya calculado.
 *
 * @param {object} params
 * @param {number} params.saldoActual     Saldo leído con FOR UPDATE.
 * @param {number} params.montoEnPesos    Monto total ya calculado de la reserva.
 * @param {number} params.pesosPorCredito Tasa de creditos_config.
 */
export function evaluarDescuentoReserva({
  saldoActual = 0,
  montoEnPesos = 0,
  pesosPorCredito = PESOS_POR_CREDITO_DEFECTO,
} = {}) {
  const saldo = Math.trunc(aNumero(saldoActual, 0));
  const creditosNecesarios = creditosParaMonto(montoEnPesos, pesosPorCredito);

  // Sin costo no se inserta movimiento: la tabla exige cantidad <> 0.
  if (creditosNecesarios === 0) {
    return {
      ok: true,
      creditosNecesarios: 0,
      creditosFaltantes: 0,
      saldoPosterior: saldo,
      requiereMovimiento: false,
    };
  }

  if (saldo < creditosNecesarios) {
    const creditosFaltantes = creditosNecesarios - saldo;
    return {
      ok: false,
      codigo: "SALDO_INSUFICIENTE",
      mensaje: `Necesitás ${creditosNecesarios} créditos y tenés ${saldo}. Te faltan ${creditosFaltantes}.`,
      creditosNecesarios,
      creditosFaltantes,
      saldoPosterior: saldo,
      requiereMovimiento: false,
    };
  }

  return {
    ok: true,
    creditosNecesarios,
    creditosFaltantes: 0,
    saldoPosterior: saldo - creditosNecesarios,
    requiereMovimiento: true,
  };
}

/**
 * Decide si un ajuste manual del administrador es admisible (RF08).
 *
 * El motivo es obligatorio: el ajuste es la única vía por la que un saldo
 * cambia sin una operación de negocio detrás.
 */
export function evaluarAjusteManual({
  saldoActual = 0,
  cantidad,
  motivo,
  permitirNegativo = false,
} = {}) {
  const motivoLimpio = String(motivo ?? "").trim();
  if (motivoLimpio.length < 3) {
    return {
      ok: false,
      codigo: "MOTIVO_REQUERIDO",
      mensaje: "El motivo del ajuste es obligatorio (mínimo 3 caracteres)",
    };
  }

  const n = aNumero(cantidad, Number.NaN);
  if (!Number.isInteger(n) || n === 0) {
    return {
      ok: false,
      codigo: "CANTIDAD_INVALIDA",
      mensaje: "La cantidad debe ser un número entero distinto de cero",
    };
  }

  const saldo = Math.trunc(aNumero(saldoActual, 0));
  const saldoPosterior = saldo + n;

  if (saldoPosterior < 0 && !permitirNegativo) {
    return {
      ok: false,
      codigo: "SALDO_NEGATIVO_NO_AUTORIZADO",
      mensaje: `El ajuste dejaría el saldo en ${saldoPosterior}. Autorizá el saldo negativo para continuar.`,
    };
  }

  return { ok: true, cantidad: n, motivo: motivoLimpio, saldoPosterior };
}

/** Normaliza y valida los datos de un paquete de créditos (RF09). */
export function normalizarPaquete({ nombre, creditos, precio, descripcion } = {}) {
  const nombreLimpio = String(nombre ?? "").trim();
  if (nombreLimpio.length === 0) {
    return {
      ok: false,
      codigo: "NOMBRE_REQUERIDO",
      mensaje: "El nombre del paquete es obligatorio",
    };
  }

  const creditosNum = aNumero(creditos, Number.NaN);
  if (!Number.isInteger(creditosNum) || creditosNum <= 0) {
    return {
      ok: false,
      codigo: "CREDITOS_INVALIDOS",
      mensaje: "Los créditos deben ser un número entero mayor a cero",
    };
  }

  const precioNum = aNumero(precio, Number.NaN);
  if (!Number.isFinite(precioNum) || precioNum < 0) {
    return {
      ok: false,
      codigo: "PRECIO_INVALIDO",
      mensaje: "El precio debe ser un número mayor o igual a cero",
    };
  }

  const descripcionLimpia = String(descripcion ?? "").trim();

  return {
    ok: true,
    paquete: {
      nombre: nombreLimpio,
      creditos: creditosNum,
      precio: Math.round(precioNum * 100) / 100,
      descripcion: descripcionLimpia.length > 0 ? descripcionLimpia : null,
    },
  };
}

export function referenciaCompra(compraId) {
  return `${PREFIJO_REFERENCIA_COMPRA}${compraId}`;
}

/** Devuelve null si la referencia no es de una compra de créditos. */
export function parsearReferenciaCompra(externalReference) {
  const ref = String(externalReference ?? "");
  if (!ref.startsWith(PREFIJO_REFERENCIA_COMPRA)) return null;

  const id = Number.parseInt(ref.slice(PREFIJO_REFERENCIA_COMPRA.length), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Estado de la compra según el pago de Mercado Pago.
 * null significa que el pago sigue en curso y la compra no se toca.
 */
export function estadoCompraParaPago(estadoMercadoPago) {
  if (estadoMercadoPago === "approved") return "acreditada";
  if (estadoMercadoPago === "rejected" || estadoMercadoPago === "cancelled") return "rechazada";
  return null;
}
