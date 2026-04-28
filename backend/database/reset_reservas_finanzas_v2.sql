-- Reset de reservas y transacciones (gestión financiera) vía DELETE + secuencias.
-- No toca Cliente, Recursos, Espacios, usuarios ni ClienteUsuario.
--
-- Usá este script si TRUNCATE/CASCADE falla o la sesión queda en 25P02.
-- Antes de correrlo, si ves «transacción abortada», ejecutá: ROLLBACK;
--
-- Uso: psql -U ... -d ... -f backend/database/reset_reservas_finanzas_v2.sql

DO $$
DECLARE
  sq text;
BEGIN
  IF to_regclass('public."TransaccionReserva"') IS NOT NULL THEN
    EXECUTE 'DELETE FROM "TransaccionReserva"';
  END IF;

  DELETE FROM "Transaccion";
  DELETE FROM "Reservas";

  IF to_regclass('public."ReservaSerie"') IS NOT NULL THEN
    EXECUTE 'DELETE FROM "ReservaSerie"';
  END IF;

  sq := pg_get_serial_sequence('"Reservas"', 'idReserva');
  IF sq IS NOT NULL THEN
    PERFORM setval(sq::regclass, 1, false);
  END IF;

  sq := pg_get_serial_sequence('"Transaccion"', 'idTransaccion');
  IF sq IS NOT NULL THEN
    PERFORM setval(sq::regclass, 1, false);
  END IF;

  IF to_regclass('public."ReservaSerie"') IS NOT NULL THEN
    sq := pg_get_serial_sequence('"ReservaSerie"', 'idSerie');
    IF sq IS NOT NULL THEN
      PERFORM setval(sq::regclass, 1, false);
    END IF;
  END IF;
END $$;
