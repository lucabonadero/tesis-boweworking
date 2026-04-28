-- Vacía datos de prueba de reservas y gestión financiera (transacciones).
-- No modifica Cliente, Recursos, Espacios, usuarios ni ClienteUsuario.
-- Reinicia los SERIAL (RESTART IDENTITY).
--
-- TRUNCATE "Reservas" ... CASCADE incluye tablas con FK hacia Reservas:
-- "Transaccion", "TransaccionReserva" (si existe).
--
-- Si ves: «transacción abortada» (25P02), la sesión quedó a medias tras otro error.
-- Ejecutá solo: ROLLBACK;  y volvé a correr este archivo (o cerrá y abrís la conexión).
--
-- Uso: psql -U ... -d ... -f backend/database/reset_reservas_y_finanzas.sql
--      o pegar en DBeaver / pgAdmin y ejecutar.

TRUNCATE TABLE "Reservas" RESTART IDENTITY CASCADE;

DO $$
BEGIN
  IF to_regclass('public."ReservaSerie"') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE "ReservaSerie" RESTART IDENTITY';
  END IF;
END $$;
