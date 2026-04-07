-- ============================================================
-- MIGRACIÓN v2: Estructura real de espacios y recursos
-- Planta Baja / Primer Piso / Terraza con recursos concretos
-- ============================================================

BEGIN;

-- 1. Limpiar datos existentes (orden por FK)
DELETE FROM "Transaccion";
DELETE FROM "Reservas";
DELETE FROM "Recursos";
DELETE FROM "Espacios";

-- 2. Agregar columnas nuevas a Recursos (si no existen)
ALTER TABLE "Recursos" ADD COLUMN IF NOT EXISTS "idRecursoPadre" INT;
ALTER TABLE "Recursos" ADD COLUMN IF NOT EXISTS "esCompleto" BOOLEAN DEFAULT false;

-- 3. Insertar los 3 espacios con ID explícito
INSERT INTO "Espacios" ("Espacio", "Nombre", "Capacidad", "Disponible") VALUES
  (1, 'Planta Baja', 20, true),
  (2, 'Primer Piso', 10, true),
  (3, 'Terraza', 15, true);

-- ============================================================
-- 4. PLANTA BAJA (idEspacio = 1)
-- ============================================================
INSERT INTO "Recursos" ("idEspacio", "Nombre", "esCompleto") VALUES
  (1, 'Banco 1', false),
  (1, 'Banco 2', false),
  (1, 'Banco 3', false),
  (1, 'Banco 4', false),
  (1, 'Banco 5', false),
  (1, 'Sillón 1', false),
  (1, 'Sillón 2', false),
  (1, 'Sillón 3', false),
  (1, 'Sillón 4', false),
  (1, 'Sillón 5', false),
  (1, 'Planta Baja Completa', true);

-- ============================================================
-- 5. PRIMER PISO (idEspacio = 2)
-- ============================================================

-- Oficina Privada (grupo contenedor, NO reservable directamente)
INSERT INTO "Recursos" ("idEspacio", "Nombre", "Descripcion", "esCompleto") VALUES
  (2, 'Oficina Privada', '4 escritorios privados', false);

-- Escritorios dentro de la Oficina (hijos del recurso "Oficina Privada")
INSERT INTO "Recursos" ("idEspacio", "idRecursoPadre", "Nombre", "esCompleto")
SELECT 2, r."idRecurso", sub."Nombre", sub."esCompleto"
FROM "Recursos" r,
(VALUES
  ('Escritorio 1', false),
  ('Escritorio 2', false),
  ('Escritorio 3', false),
  ('Escritorio 4', false),
  ('Oficina Completa', true)
) AS sub("Nombre", "esCompleto")
WHERE r."Nombre" = 'Oficina Privada' AND r."idEspacio" = 2;

-- Sala de Conferencias (recurso independiente, sin subdivisiones)
INSERT INTO "Recursos" ("idEspacio", "Nombre", "Descripcion", "esCompleto") VALUES
  (2, 'Sala de Conferencias', 'Espacio con proyector y TV para reuniones', false);

-- ============================================================
-- 6. TERRAZA (idEspacio = 3)
-- ============================================================
INSERT INTO "Recursos" ("idEspacio", "Nombre", "esCompleto") VALUES
  (3, 'Mesa 1', false),
  (3, 'Mesa 2', false),
  (3, 'Mesa 3', false),
  (3, 'Mesa 4', false),
  (3, 'Mesa 5', false),
  (3, 'Terraza Completa', true);

-- 7. FK de idRecursoPadre (self-reference)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Recursos_idRecursoPadre_fkey'
  ) THEN
    ALTER TABLE "Recursos"
      ADD CONSTRAINT "Recursos_idRecursoPadre_fkey"
      FOREIGN KEY ("idRecursoPadre") REFERENCES "Recursos"("idRecurso")
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

COMMIT;
