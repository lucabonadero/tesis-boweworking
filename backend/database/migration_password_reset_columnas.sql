-- Columnas para recuperación de contraseña.
--
-- clienteAuth.controller.js (solicitarRecuperacion, validarTokenRecuperacion,
-- restablecerPassword) las usa, pero no están en init/01_schema.sql.
-- Correr ANTES de migration_indice_password_reset.sql.

ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;
