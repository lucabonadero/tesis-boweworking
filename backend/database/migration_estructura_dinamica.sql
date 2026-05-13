-- ============================================================
-- Migración: Estructura dinámica de Pisos / Espacios / Recursos
-- Fase 1 — Bo WeWorking (mayo 2026)
-- Ejecutar una sola vez contra la base de datos boweworking
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Nivel raíz: Pisos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Pisos" (
  "idPiso"      SERIAL PRIMARY KEY,
  "Nombre"      VARCHAR(120) NOT NULL,
  "Descripcion" TEXT,
  "Orden"       INTEGER NOT NULL DEFAULT 0,
  "Activo"      BOOLEAN NOT NULL DEFAULT true,
  "Icono"       VARCHAR(50),
  "Color"       VARCHAR(20),
  "ImagenUrl"   VARCHAR(500),
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pisos_orden ON "Pisos"("Orden") WHERE "Activo" = true;

-- ------------------------------------------------------------
-- 2. Extender Espacios: jerarquía interna + tipo + orden + activo
-- ------------------------------------------------------------
ALTER TABLE "Espacios"
  ADD COLUMN IF NOT EXISTS "idPiso"          INTEGER REFERENCES "Pisos"("idPiso") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "idEspacioPadre"  INTEGER REFERENCES "Espacios"("Espacio") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "Tipo"            VARCHAR(20) NOT NULL DEFAULT 'espacio',
  ADD COLUMN IF NOT EXISTS "Orden"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "Activo"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "Descripcion"     TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE "Espacios" DROP CONSTRAINT IF EXISTS espacios_tipo_check;
ALTER TABLE "Espacios"
  ADD CONSTRAINT espacios_tipo_check
  CHECK ("Tipo" IN ('sector', 'area', 'espacio'));

CREATE INDEX IF NOT EXISTS idx_espacios_piso     ON "Espacios"("idPiso")          WHERE "Activo" = true;
CREATE INDEX IF NOT EXISTS idx_espacios_padre    ON "Espacios"("idEspacioPadre")  WHERE "Activo" = true;
CREATE INDEX IF NOT EXISTS idx_espacios_orden    ON "Espacios"("idPiso", "idEspacioPadre", "Orden");

-- ------------------------------------------------------------
-- 3. Extender Recursos: tipo + orden + activo
-- ------------------------------------------------------------
ALTER TABLE "Recursos"
  ADD COLUMN IF NOT EXISTS "Tipo"               VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "Orden"              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "Activo"             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "AceptaPackSemanal"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "AceptaPackMensual"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "createdAt"          TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_recursos_espacio_activo ON "Recursos"("idEspacio") WHERE "Activo" = true;
CREATE INDEX IF NOT EXISTS idx_recursos_padre          ON "Recursos"("idRecursoPadre");
CREATE INDEX IF NOT EXISTS idx_recursos_orden          ON "Recursos"("idEspacio", "idRecursoPadre", "Orden");

-- ------------------------------------------------------------
-- 4. Catálogo de tipos de recurso (referencial, no FK obligatorio)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TiposRecurso" (
  "clave" VARCHAR(40) PRIMARY KEY,
  "label" VARCHAR(120) NOT NULL,
  "icono" VARCHAR(50)
);

INSERT INTO "TiposRecurso" ("clave", "label", "icono") VALUES
  ('banco',      'Banco',      'chair'),
  ('escritorio', 'Escritorio', 'desktop'),
  ('sillon',     'Sillón',     'cushion'),
  ('oficina',    'Oficina',    'office'),
  ('sala',       'Sala',       'meeting'),
  ('cabina',     'Cabina',     'phone'),
  ('mesa',       'Mesa',       'table')
ON CONFLICT (clave) DO NOTHING;

-- ------------------------------------------------------------
-- 5. Permisos nuevos del módulo
-- ------------------------------------------------------------
INSERT INTO permisos (clave, descripcion, modulo) VALUES
  ('gestionar_estructura', 'Crear, editar y eliminar pisos, espacios y recursos', 'estructura'),
  ('reordenar_estructura', 'Reordenar y mover elementos en la estructura',         'estructura')
ON CONFLICT (clave) DO NOTHING;

-- Otorgar ambos permisos a todos los staff existentes (no a empleados por default)
INSERT INTO usuario_permisos (usuario_id, permiso_clave)
SELECT u.id, p.clave
FROM usuarios u
CROSS JOIN permisos p
WHERE u.rol = 'staff'
  AND p.clave IN ('gestionar_estructura', 'reordenar_estructura')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Backfill: migrar espacios existentes a un piso por defecto
--    Solo si hay espacios sin idPiso asignado
-- ------------------------------------------------------------
DO $$
DECLARE
  v_piso_default INTEGER;
  v_existen_huerfanos INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_existen_huerfanos
  FROM "Espacios"
  WHERE "idPiso" IS NULL;

  IF v_existen_huerfanos > 0 THEN
    -- Crear un piso "General" si no existe
    SELECT "idPiso" INTO v_piso_default
    FROM "Pisos"
    WHERE "Nombre" = 'General'
    LIMIT 1;

    IF v_piso_default IS NULL THEN
      INSERT INTO "Pisos" ("Nombre", "Descripcion", "Orden")
      VALUES ('General', 'Piso por defecto creado en la migración inicial', 0)
      RETURNING "idPiso" INTO v_piso_default;
    END IF;

    UPDATE "Espacios"
    SET "idPiso" = v_piso_default
    WHERE "idPiso" IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. Backfill: marcar flags de packs según el comportamiento actual
--    (Primer Piso + Escritorio/Oficina aceptan packs semanales y mensuales)
--    Esto preserva el comportamiento del controller antes de removerlo.
-- ------------------------------------------------------------
UPDATE "Recursos" r
SET "AceptaPackSemanal" = true,
    "AceptaPackMensual" = true
FROM "Espacios" e
WHERE r."idEspacio" = e."Espacio"
  AND e."Nombre" ILIKE '%Primer Piso%'
  AND (r."Nombre" ILIKE '%Escritorio%' OR r."Nombre" ILIKE '%Oficina%')
  AND r."AceptaPackSemanal" = false
  AND r."AceptaPackMensual" = false;

-- ------------------------------------------------------------
-- 8. Triggers para mantener updatedAt
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updatedat()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pisos_updatedat ON "Pisos";
CREATE TRIGGER trg_pisos_updatedat
  BEFORE UPDATE ON "Pisos"
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updatedat();

DROP TRIGGER IF EXISTS trg_espacios_updatedat ON "Espacios";
CREATE TRIGGER trg_espacios_updatedat
  BEFORE UPDATE ON "Espacios"
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updatedat();

DROP TRIGGER IF EXISTS trg_recursos_updatedat ON "Recursos";
CREATE TRIGGER trg_recursos_updatedat
  BEFORE UPDATE ON "Recursos"
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updatedat();

COMMIT;

-- ============================================================
-- Notas:
--   - Reservas sigue apuntando a "Recursos"."idRecurso". No se modifica.
--   - Para eliminar pisos/espacios/recursos se usa "Activo" = false (soft delete).
--   - El backend bloquea borrar elementos con reservas futuras / hijos activos.
-- ============================================================
