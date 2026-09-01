-- ============================================================
-- Migración: Disponibilidad y bloqueos temporales de Recursos
-- RF16 / RF17 — Bo WeWorking (septiembre 2026)
-- Ejecutar después de migration_estructura_dinamica_v2.sql
-- ============================================================

BEGIN;

-- Franjas de disponibilidad semanal por recurso.
-- Un recurso SIN filas acá usa la ventana global del coworking (09:00-21:00).
CREATE TABLE IF NOT EXISTS "DisponibilidadRecurso" (
  "idDisponibilidad" SERIAL PRIMARY KEY,
  "idRecurso"   INTEGER NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "DiaSemana"   SMALLINT NOT NULL CHECK ("DiaSemana" BETWEEN 0 AND 6),
  "HoraInicio"  TIME NOT NULL,
  "HoraFin"     TIME NOT NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT disponibilidad_rango_valido CHECK ("HoraInicio" < "HoraFin")
);

COMMENT ON COLUMN "DisponibilidadRecurso"."DiaSemana"
  IS '0=domingo, 1=lunes, ... 6=sábado (igual que Date.getUTCDay)';

CREATE INDEX IF NOT EXISTS idx_disp_recurso
  ON "DisponibilidadRecurso"("idRecurso", "DiaSemana");

-- Bloqueos temporales (RF16). TIMESTAMP, no DATE: permite bloqueos parciales.
CREATE TABLE IF NOT EXISTS "BloqueosRecurso" (
  "idBloqueo"   SERIAL PRIMARY KEY,
  "idRecurso"   INTEGER NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "FechaInicio" TIMESTAMP NOT NULL,
  "FechaFin"    TIMESTAMP NOT NULL,
  "Motivo"      VARCHAR(300),
  "creadoPor"   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT bloqueo_rango_valido CHECK ("FechaInicio" < "FechaFin")
);

CREATE INDEX IF NOT EXISTS idx_bloq_recurso_rango
  ON "BloqueosRecurso"("idRecurso", "FechaInicio", "FechaFin");

COMMIT;
