-- ───────────────────────────────────────────────────────────────────────────
-- Extensión de reservas en curso  (v2: cobro pendiente + liquidación por tiempo real)
--
-- Una reserva "en_curso" puede extenderse: se modifica su HorarioFin (sigue
-- siendo la MISMA reserva, no se duplica). La extensión NO se cobra en el momento:
-- genera un cargo PENDIENTE de pago que se registra después.
--
-- Facturación por fracciones de 30 minutos (redondeo hacia arriba). Si el cliente
-- extendió mucho pero se queda menos, al FINALIZAR el turno el cargo se recalcula
-- sobre el tiempo realmente usado (también por fracciones de 30 min).
--
-- Modelo:
--   - "Reservas"."HorarioFinOriginal": fin original de la reserva (antes de extender).
--   - "ReservaExtension" (1:1 con la reserva): estado acumulado de la extensión
--     (cuántas veces se extendió, fin actual, minutos/fracciones/monto vigentes,
--     y si ya fue liquidada al cierre).
--   - "Transaccion"."idExtension": cargo de la extensión (arranca Pendiente).
--
-- NOTA: en dev esta migración recrea "ReservaExtension". Si ya aplicaste la v1,
-- volvé a ejecutarla (se descartan extensiones de prueba previas).
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Horario fin original en la reserva (NULL = nunca extendida).
ALTER TABLE "Reservas"
  ADD COLUMN IF NOT EXISTS "HorarioFinOriginal" TIME NULL;

-- 2) Estado de extensión por reserva (1:1). DROP+CREATE para reemplazar la v1.
--    CASCADE descarta la FK que "Transaccion"."idExtension" tuviera hacia esta tabla.
DROP TABLE IF EXISTS "ReservaExtension" CASCADE;

CREATE TABLE "ReservaExtension" (
  "idExtension"         SERIAL PRIMARY KEY,
  "idReserva"           INTEGER NOT NULL UNIQUE REFERENCES "Reservas"("idReserva") ON DELETE CASCADE,
  "Veces"               INTEGER NOT NULL DEFAULT 1 CHECK ("Veces" > 0),
  "HorarioFinOriginal"  TIME    NOT NULL,
  "HorarioFinActual"    TIME    NOT NULL,
  "MinutosExtension"    INTEGER NOT NULL DEFAULT 0,   -- minutos facturables vigentes (provisional o real)
  "Fracciones"          INTEGER NOT NULL DEFAULT 0,   -- bloques de 30 min (redondeo hacia arriba)
  "PrecioFraccion"      NUMERIC(12,2) NOT NULL DEFAULT 0,
  "Monto"               NUMERIC(12,2) NOT NULL DEFAULT 0,
  "Finalizada"          BOOLEAN NOT NULL DEFAULT false, -- true tras liquidar al cierre del turno
  "CreadaPor"           VARCHAR(120) NULL,
  "CreadaEn"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ActualizadaEn"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reserva_extension_reserva
  ON "ReservaExtension" ("idReserva");

-- 3) Vínculo de la transacción con la extensión que cobra.
ALTER TABLE "Transaccion"
  ADD COLUMN IF NOT EXISTS "idExtension" INTEGER NULL;

-- El cargo de la extensión nace PENDIENTE y sin método elegido (se elige al cobrar).
ALTER TABLE "Transaccion" ALTER COLUMN "MetodoPago" DROP NOT NULL;

-- Limpieza de la v1: como "ReservaExtension" se recreó vacía, cualquier referencia
-- previa quedó huérfana. Se descartan los cobros de extensión de prueba y se anulan
-- los vínculos antes de revalidar la nueva FK.
DELETE FROM "Transaccion" WHERE "ClasificacionPago" = 'extension';
UPDATE "Transaccion" SET "idExtension" = NULL WHERE "idExtension" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Transaccion_idExtension_fkey'
      AND conrelid = '"Transaccion"'::regclass
  ) THEN
    ALTER TABLE "Transaccion"
      ADD CONSTRAINT "Transaccion_idExtension_fkey"
      FOREIGN KEY ("idExtension") REFERENCES "ReservaExtension"("idExtension") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transaccion_extension
  ON "Transaccion" ("idExtension");

-- 4) Si "Transaccion"."ClasificacionPago" tuviera un CHECK con valores fijos,
--    aceptar también 'extension'. (No-op si no existe la constraint.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Transaccion"'::regclass
      AND conname = 'Transaccion_ClasificacionPago_check'
  ) THEN
    ALTER TABLE "Transaccion" DROP CONSTRAINT "Transaccion_ClasificacionPago_check";
    ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_ClasificacionPago_check"
      CHECK ("ClasificacionPago" IN ('reserva_fija','multirecurso','extension'));
  END IF;
END $$;
