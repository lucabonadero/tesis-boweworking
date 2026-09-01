-- ============================================================
-- Migración: Roles de usuario final (RF03/RF04/RF05)
-- Tabla ClienteUsuario: rol, verificación de estudiante, estado de cuenta.
-- Aditiva: solo agrega columnas con DEFAULT. No modifica datos existentes.
-- Ejecutar una sola vez contra la base de datos.
-- ============================================================

BEGIN;

-- 1. Rol del usuario final (RF03).
--    'usuario' es el rol por defecto de todo registro nuevo (RF04).
ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'usuario';

ALTER TABLE "ClienteUsuario" DROP CONSTRAINT IF EXISTS clienteusuario_rol_check;
ALTER TABLE "ClienteUsuario"
  ADD CONSTRAINT clienteusuario_rol_check
  CHECK (rol IN ('usuario', 'estudiante'));

-- 2. Estado de la solicitud de verificación de estudiante (RF04).
ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS estado_verificacion_estudiante VARCHAR(20)
  NOT NULL DEFAULT 'no_solicitado';

ALTER TABLE "ClienteUsuario" DROP CONSTRAINT IF EXISTS clienteusuario_verif_estudiante_check;
ALTER TABLE "ClienteUsuario"
  ADD CONSTRAINT clienteusuario_verif_estudiante_check
  CHECK (estado_verificacion_estudiante IN ('no_solicitado', 'pendiente', 'aprobado', 'rechazado'));

-- 3. Estado de la cuenta: habilitada o bloqueada por un administrador (RF01).
ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS estado_cuenta VARCHAR(20) NOT NULL DEFAULT 'activo';

ALTER TABLE "ClienteUsuario" DROP CONSTRAINT IF EXISTS clienteusuario_estado_cuenta_check;
ALTER TABLE "ClienteUsuario"
  ADD CONSTRAINT clienteusuario_estado_cuenta_check
  CHECK (estado_cuenta IN ('activo', 'bloqueado'));

-- 4. Auditoría de la solicitud de estudiante.
ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS institucion_estudiante   VARCHAR(160),
  ADD COLUMN IF NOT EXISTS comprobante_estudiante   TEXT,
  ADD COLUMN IF NOT EXISTS solicitud_estudiante_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resolucion_estudiante_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS motivo_rechazo_estudiante TEXT,
  ADD COLUMN IF NOT EXISTS resuelto_por_usuario_id  INTEGER
    REFERENCES usuarios(id) ON DELETE SET NULL;

-- 5. Auditoría del bloqueo de cuenta.
ALTER TABLE "ClienteUsuario"
  ADD COLUMN IF NOT EXISTS bloqueado_at             TIMESTAMP,
  ADD COLUMN IF NOT EXISTS motivo_bloqueo           TEXT,
  ADD COLUMN IF NOT EXISTS bloqueado_por_usuario_id INTEGER
    REFERENCES usuarios(id) ON DELETE SET NULL;

-- 6. Índices para el panel de gestión: filtro por rol (RF02) y por estado.
CREATE INDEX IF NOT EXISTS idx_clienteusuario_rol
  ON "ClienteUsuario" (rol);
CREATE INDEX IF NOT EXISTS idx_clienteusuario_estado_cuenta
  ON "ClienteUsuario" (estado_cuenta);
CREATE INDEX IF NOT EXISTS idx_clienteusuario_verif_estudiante
  ON "ClienteUsuario" (estado_verificacion_estudiante)
  WHERE estado_verificacion_estudiante = 'pendiente';

-- 7. Unicidad de email case-insensitive.
--    Ya existe ClienteUsuario_email_key (UNIQUE exacto); este índice evita
--    además que 'Ana@x.com' y 'ana@x.com' convivan como cuentas distintas.
--    Si falla por duplicados preexistentes, resolverlos con el script
--    reparacion_permisos_rol.sql antes de reintentar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clienteusuario_email_lower
  ON "ClienteUsuario" (LOWER(TRIM(email)));

COMMIT;
