-- Repara DEFAULT de idTransaccion (SERIAL) cuando INSERT deja NULL (error 23502), p. ej. al crear preferencia MP.
DO $$
DECLARE
  sq TEXT;
  mx INT;
  has_rows BOOLEAN;
BEGIN
  sq := pg_get_serial_sequence('"Transaccion"', 'idTransaccion');

  IF sq IS NULL THEN
    CREATE SEQUENCE "Transaccion_idTransaccion_seq" AS INTEGER;
    ALTER SEQUENCE "Transaccion_idTransaccion_seq" OWNED BY "Transaccion"."idTransaccion";
    sq := pg_get_serial_sequence('"Transaccion"', 'idTransaccion');
  END IF;

  EXECUTE format(
    'ALTER TABLE "Transaccion" ALTER COLUMN "idTransaccion" SET DEFAULT nextval(%L::regclass)',
    sq
  );

  SELECT MAX("idTransaccion"), (SELECT COUNT(*) > 0 FROM "Transaccion") INTO mx, has_rows FROM "Transaccion";
  IF has_rows THEN
    EXECUTE format('SELECT setval(%L::regclass, $1)', sq)
      USING GREATEST(COALESCE(mx, 1), 1);
  ELSE
    EXECUTE format('SELECT setval(%L::regclass, 1, false)', sq);
  END IF;
END $$;
