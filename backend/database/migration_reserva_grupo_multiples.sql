-- Varios recursos en un mismo turno: misma operación = mismo idReservaGrupo (valor = idReserva mínimo del lote).
ALTER TABLE "Reservas" ADD COLUMN IF NOT EXISTS "idReservaGrupo" INTEGER;

CREATE INDEX IF NOT EXISTS idx_reservas_grupo ON "Reservas" ("idReservaGrupo")
  WHERE "idReservaGrupo" IS NOT NULL;
