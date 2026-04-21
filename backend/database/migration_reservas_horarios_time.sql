-- Migra "HorarioReserva" y "HorarioFin" de VARCHAR a TIME (sin zona; ver comentario abajo).
-- Ejecutar sobre una copia de respaldo. Requiere que los valores existentes sean horas válidas
-- (p. ej. 09:30, 09:30:00). Cadenas vacías o solo espacios pasan a NULL.
--
-- Zona horaria: hoy el modelo es "hora del día" + "DiaReserva" (DATE). TIME es adecuado.
-- Si más adelante se necesita TZ explícita, valorar TIMESTAMPTZ combinando DiaReserva + hora en la app
-- o columnas generadas, en lugar de solo TIME.

UPDATE "Reservas"
SET "HorarioReserva" = NULL
WHERE "HorarioReserva" IS NOT NULL AND TRIM("HorarioReserva"::text) = '';

UPDATE "Reservas"
SET "HorarioFin" = NULL
WHERE "HorarioFin" IS NOT NULL AND TRIM("HorarioFin"::text) = '';

ALTER TABLE "Reservas"
  ALTER COLUMN "HorarioReserva" TYPE TIME USING (
    CASE
      WHEN "HorarioReserva" IS NULL THEN NULL
      ELSE "HorarioReserva"::TIME
    END
  ),
  ALTER COLUMN "HorarioFin" TYPE TIME USING (
    CASE
      WHEN "HorarioFin" IS NULL THEN NULL
      ELSE "HorarioFin"::TIME
    END
  );
