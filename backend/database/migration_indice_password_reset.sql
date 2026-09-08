-- Índice para la búsqueda del token de recuperación de contraseña.
--
-- validarTokenRecuperacion y restablecerPassword buscan por
-- password_reset_token_hash en cada intento. Sin índice es un seq scan de toda
-- la tabla "ClienteUsuario" por request, y el endpoint es público.
--
-- Parcial: solo las filas con un reset pendiente entran al índice, que en la
-- práctica son unas pocas. El resto de la tabla no lo engorda.

CREATE INDEX IF NOT EXISTS idx_clienteusuario_password_reset
  ON "ClienteUsuario" (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;
