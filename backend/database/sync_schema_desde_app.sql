-- Uso: base ya creada con un init viejo — añade columnas que el backend actual espera (idempotente).
-- No borra datos. Ejecutar una vez en PostgreSQL sobre tu DB (psql, DBeaver, etc.).

ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "Telefono" VARCHAR(30);

ALTER TABLE "Recursos"
  ADD COLUMN IF NOT EXISTS "PrecioHora" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "PrecioSemanal" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "PrecioMensual" DECIMAL(10,2);

ALTER TABLE "Reservas"
  ADD COLUMN IF NOT EXISTS "Estado" VARCHAR(20) DEFAULT 'activa';

ALTER TABLE "Transaccion"
  ADD COLUMN IF NOT EXISTS "TipoPago" VARCHAR(20) DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS "mp_preference_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "mp_payment_id" VARCHAR(255);

ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS "password_reset_token_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMPTZ;

-- Si fallan INSERT con idReserva o idTransaccion NULL (23502), ejecutá:
--   repair_reservas_idreserva_serial.sql
--   repair_transaccion_idtransaccion_serial.sql
--
-- Columnas "HorarioReserva" / "HorarioFin" como TIME (en lugar de VARCHAR): ejecutá
--   migration_reservas_horarios_time.sql
