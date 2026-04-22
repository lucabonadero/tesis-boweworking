-- Marca el tipo de operación para interpretar montos (paquete fijo vs turno simple).
ALTER TABLE "Transaccion" ADD COLUMN IF NOT EXISTS "ClasificacionPago" VARCHAR(32);

-- Valores usados por la app: 'reserva_fija' | 'multirecurso' | NULL (turno u otro)
