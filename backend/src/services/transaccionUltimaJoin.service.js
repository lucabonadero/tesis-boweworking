/**
 * Última transacción asociada a una reserva: fila directa en "Transaccion" o vía "TransaccionReserva".
 * @param {string} aliasReserva Alias de la tabla Reservas en el query (ej. r)
 * @param {string} aliasLateral Alias del resultado LATERAL (ej. tx)
 */
export function lateralUltimaTransaccion(aliasReserva = "r", aliasLateral = "tx") {
  return `
LEFT JOIN LATERAL (
  SELECT t."EstadoPago", t."MetodoPago", t."TipoPago", t."idTransaccion"
  FROM "Transaccion" t
  WHERE t."idReserva" = ${aliasReserva}."idReserva"
     OR t."idTransaccion" IN (
       SELECT tr."idTransaccion" FROM "TransaccionReserva" tr WHERE tr."idReserva" = ${aliasReserva}."idReserva"
     )
  ORDER BY t."idTransaccion" DESC NULLS LAST
  LIMIT 1
) ${aliasLateral} ON true`;
}
