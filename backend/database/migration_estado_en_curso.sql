-- Estado intermedio "en_curso" entre activa y completada.
-- Una reserva pasa a en_curso al ser recepcionada y avanza a completada
-- automáticamente cuando supera su HorarioFin original.

ALTER TABLE "Reservas"
  ADD COLUMN IF NOT EXISTS "RecepcionadaEn" TIMESTAMPTZ NULL;

-- Si existe un CHECK constraint sobre Estado, recrearlo aceptando el nuevo valor.
ALTER TABLE "Reservas" DROP CONSTRAINT IF EXISTS "Reservas_Estado_check";
ALTER TABLE "Reservas" ADD CONSTRAINT "Reservas_Estado_check"
  CHECK ("Estado" IN ('activa','en_curso','completada','no_asistio','cancelada'));

-- Índice parcial para el sweep que cierra reservas en_curso vencidas.
CREATE INDEX IF NOT EXISTS idx_reservas_en_curso_dia
  ON "Reservas" ("DiaReserva")
  WHERE "Estado" = 'en_curso';
