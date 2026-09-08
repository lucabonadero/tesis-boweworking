-- ============================================================
-- Migración: Beneficio de reserva para el rol Estudiante
-- RF21 / RF22 / RF23 — Bo WeWorking (septiembre 2026)
-- ============================================================

BEGIN;

-- Recursos marcados por el admin como gratuitos para cuentas estudiante (RF23).
-- Un recurso sin fila acá no tiene beneficio: se cobra normal (RF22).
CREATE TABLE IF NOT EXISTS "RecursoBeneficioEstudiante" (
  "idRecurso"       INTEGER PRIMARY KEY REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "habilitado"      BOOLEAN NOT NULL DEFAULT true,
  "actualizado_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
  "actualizado_por" INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_beneficio_estudiante_habilitado
  ON "RecursoBeneficioEstudiante"("idRecurso") WHERE "habilitado" = true;

COMMIT;
