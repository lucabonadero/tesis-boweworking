-- Reservas fijas: mismo día de la semana y horario, 4 ocurrencias en semanas consecutivas desde la fecha de inicio.
-- Ejecutar una vez contra la base del proyecto.
--
-- Si ves: no existe la columna «PrecioHora» en Recursos, este bloque la agrega (init viejo).
ALTER TABLE "Recursos"
  ADD COLUMN IF NOT EXISTS "PrecioHora" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "PrecioSemanal" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "PrecioMensual" DECIMAL(10,2);

-- Ciclo de vida del turno (init / sync antiguo sin esta columna)
ALTER TABLE "Reservas"
  ADD COLUMN IF NOT EXISTS "Estado" VARCHAR(20) DEFAULT 'activa';

-- Mercado Pago / tipo de cobro (el LATERAL de transacciones usa TipoPago, MetodoPago, EstadoPago)
ALTER TABLE "Transaccion"
  ADD COLUMN IF NOT EXISTS "TipoPago" VARCHAR(20) DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS "mp_preference_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "mp_payment_id" VARCHAR(255);

CREATE TABLE IF NOT EXISTS "ReservaSerie" (
  "idSerie" SERIAL PRIMARY KEY,
  "DNI" VARCHAR(20) NOT NULL,
  "Nombre" VARCHAR(255),
  "idRecurso" INT NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE RESTRICT,
  "anio" INT NOT NULL,
  "mes" INT NOT NULL CHECK ("mes" BETWEEN 1 AND 12),
  "diaSemana" INT NOT NULL CHECK ("diaSemana" BETWEEN 1 AND 7),
  "HorarioReserva" TIME NOT NULL,
  "HorarioFin" TIME NOT NULL,
  "descuentoAplicado" NUMERIC(6,4) NOT NULL DEFAULT 0,
  "precioListaTotal" NUMERIC(12,2) NOT NULL,
  "precioFinalTotal" NUMERIC(12,2) NOT NULL,
  "nOcurrencias" INT NOT NULL,
  "Estado" VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK ("Estado" IN ('activa', 'cancelada')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ReservaSerie_fk_cliente" FOREIGN KEY ("DNI") REFERENCES "Cliente"("DNI") DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS idx_reserva_serie_cliente ON "ReservaSerie" ("DNI");
CREATE INDEX IF NOT EXISTS idx_reserva_serie_recurso_periodo ON "ReservaSerie" ("idRecurso", "anio", "mes");

ALTER TABLE "Reservas" ADD COLUMN IF NOT EXISTS "idSerie" INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservas_fk_serie'
  ) THEN
    ALTER TABLE "Reservas"
      ADD CONSTRAINT "Reservas_fk_serie"
      FOREIGN KEY ("idSerie") REFERENCES "ReservaSerie"("idSerie") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservas_idserie ON "Reservas" ("idSerie") WHERE "idSerie" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "TransaccionReserva" (
  "idTransaccion" INT NOT NULL REFERENCES "Transaccion"("idTransaccion") ON DELETE CASCADE,
  "idReserva" INT NOT NULL REFERENCES "Reservas"("idReserva") ON DELETE CASCADE,
  PRIMARY KEY ("idTransaccion", "idReserva")
);

CREATE INDEX IF NOT EXISTS idx_transaccion_reserva_reserva ON "TransaccionReserva" ("idReserva");

-- Período de la serie: desde fecha de inicio hasta la última de las 4 semanas. Ejecutar si ya corriste la migración antes.
ALTER TABLE "ReservaSerie" ADD COLUMN IF NOT EXISTS "periodoDesde" DATE;
ALTER TABLE "ReservaSerie" ADD COLUMN IF NOT EXISTS "periodoHasta" DATE;
ALTER TABLE "ReservaSerie" ALTER COLUMN "anio" DROP NOT NULL;
ALTER TABLE "ReservaSerie" ALTER COLUMN "mes" DROP NOT NULL;
