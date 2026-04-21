-- Repara DEFAULT de idReserva (SERIAL) cuando los INSERT dejan idReserva en NULL (error 23502).
DO $$
DECLARE
  sq TEXT;
  mx INT;
  has_rows BOOLEAN;
BEGIN
  sq := pg_get_serial_sequence('"Reservas"', 'idReserva');

  IF sq IS NULL THEN
    CREATE SEQUENCE "Reservas_idReserva_seq" AS INTEGER;
    ALTER SEQUENCE "Reservas_idReserva_seq" OWNED BY "Reservas"."idReserva";
    sq := pg_get_serial_sequence('"Reservas"', 'idReserva');
  END IF;

  EXECUTE format(
    'ALTER TABLE "Reservas" ALTER COLUMN "idReserva" SET DEFAULT nextval(%L::regclass)',
    sq
  );

  SELECT MAX("idReserva"), (SELECT COUNT(*) > 0 FROM "Reservas") INTO mx, has_rows FROM "Reservas";
  IF has_rows THEN
    EXECUTE format('SELECT setval(%L::regclass, $1)', sq)
      USING GREATEST(COALESCE(mx, 1), 1);
  ELSE
    EXECUTE format('SELECT setval(%L::regclass, 1, false)', sq);
  END IF;
END $$;
