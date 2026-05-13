-- ============================================================
-- Migración v2: Flags adicionales para eliminar hardcoding restante
-- Fase 3 — Bo WeWorking (mayo 2026)
-- Ejecutar después de migration_estructura_dinamica.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Recursos: flag para reservas por turno (reemplaza el ILIKE "oficina")
-- ------------------------------------------------------------
ALTER TABLE "Recursos"
  ADD COLUMN IF NOT EXISTS "EsReservablePorTurno" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: preservar comportamiento anterior.
-- El controller filtraba grupos cuyo nombre contiene "oficina" → eran sólo packs.
UPDATE "Recursos" r
SET "EsReservablePorTurno" = false
FROM "Recursos" hijo
WHERE hijo."idRecursoPadre" = r."idRecurso"
  AND r."Nombre" ILIKE '%oficina%'
  AND r."EsReservablePorTurno" = true;

-- ------------------------------------------------------------
-- 2. Pisos: contenido marketing para el Carrusel público
-- ------------------------------------------------------------
ALTER TABLE "Pisos"
  ADD COLUMN IF NOT EXISTS "IdealPara"  TEXT,
  ADD COLUMN IF NOT EXISTS "Amenities"  TEXT[]      DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "Imagenes"   JSONB       DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS "Publicado"  BOOLEAN     NOT NULL DEFAULT true;

-- Comentarios para documentar el formato esperado de "Imagenes"
COMMENT ON COLUMN "Pisos"."Imagenes"
  IS 'JSON array: [{ "url": string, "alt": string, "caption"?: string }]. Url puede ser absoluta o /assets/...';
COMMENT ON COLUMN "Pisos"."Amenities"
  IS 'Lista de comodidades del piso (ej. {"Wi-Fi","Cocina","Impresora"})';

-- ------------------------------------------------------------
-- 3. Backfill de pisos por defecto (Planta Baja / Primer Piso / Terraza)
--    Solo si existen con ese nombre y no tienen contenido cargado.
-- ------------------------------------------------------------
UPDATE "Pisos"
SET
  "IdealPara" = COALESCE("IdealPara", 'Jornadas largas, llamadas con auriculares y encuentros informales entre equipos.'),
  "Amenities" = CASE
    WHEN COALESCE(array_length("Amenities", 1), 0) = 0
      THEN ARRAY['Wi-Fi de alta velocidad','Cocina y espacio para almorzar','Impresora compartida','Iluminación natural']
    ELSE "Amenities"
  END,
  "Descripcion" = COALESCE("Descripcion", 'Zona social y de trabajo abierto: ideal para concentrarte, cruzarte con otros miembros o una reunión rápida sin reservar sala.')
WHERE "Nombre" ILIKE '%Planta Baja%';

UPDATE "Pisos"
SET
  "IdealPara" = COALESCE("IdealPara", 'Reuniones con cliente, entrevistas, sesiones en equipo y trabajo sin interrupciones.'),
  "Amenities" = CASE
    WHEN COALESCE(array_length("Amenities", 1), 0) = 0
      THEN ARRAY['Salas equipadas para videollamada','Pizarras / soporte para presentar','Climatización','Enchufes en cada puesto']
    ELSE "Amenities"
  END,
  "Descripcion" = COALESCE("Descripcion", 'Privacidad cuando la necesitás: oficinas y salas cerradas con buena acústica para reuniones formales o trabajo enfocado.')
WHERE "Nombre" ILIKE '%Primer Piso%';

UPDATE "Pisos"
SET
  "IdealPara" = COALESCE("IdealPara", 'Breaks, llamadas breves al aire libre y momentos informales entre colegas.'),
  "Amenities" = CASE
    WHEN COALESCE(array_length("Amenities", 1), 0) = 0
      THEN ARRAY['Mobiliario de exterior','Vistas despejadas','Uso según clima','Conexión Wi-Fi desde interior cercano']
    ELSE "Amenities"
  END,
  "Descripcion" = COALESCE("Descripcion", 'Aire libre para desconectar cinco minutos o charlar con calma; complementa perfecto una jornada en planta baja o primer piso.')
WHERE "Nombre" ILIKE '%Terraza%';

-- Marcar el piso "General" (creado por la migración v1 para huérfanos) como no publicado.
UPDATE "Pisos"
SET "Publicado" = false
WHERE "Nombre" = 'General';

COMMIT;
