/** Formato compartido por el historial del perfil y el panel de administración. */

export const MOVIMIENTO_LABEL = {
  descuento_reserva: "Reserva",
  ajuste_admin: "Ajuste del coworking",
  compra_paquete: "Compra de créditos",
  reintegro_cancelacion: "Reintegro por cancelación",
};

export const MOVIMIENTO_COLOR = {
  descuento_reserva: "blue",
  ajuste_admin: "gold",
  compra_paquete: "green",
  reintegro_cancelacion: "purple",
};

/** Con signo siempre: el usuario ve de un vistazo si sumó o restó. */
export function formatearCantidad(cantidad) {
  const n = Number(cantidad);
  if (!Number.isFinite(n)) return "0";
  return n > 0 ? `+${n}` : String(n);
}

export function colorCantidad(cantidad) {
  return Number(cantidad) > 0 ? "green" : "red";
}

export function formatearPrecio(precio) {
  const n = Number(precio);
  if (!Number.isFinite(n)) return "$0,00";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

export function etiquetaCreditos(cantidad) {
  const n = Number(cantidad);
  return `${Number.isFinite(n) ? n : 0} ${Math.abs(n) === 1 ? "crédito" : "créditos"}`;
}
