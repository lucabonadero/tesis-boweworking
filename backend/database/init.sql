-- Crear la base de datos (ejecutar por separado si es necesario):
-- CREATE DATABASE boweworking;

-- Tabla de usuarios (admin/empleados) - para autenticacion
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(20) DEFAULT 'empleado' CHECK (rol IN ('admin', 'empleado')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Empresa
CREATE TABLE IF NOT EXISTS "Empresa" (
  "idEmpresa" SERIAL PRIMARY KEY,
  "Nombre" VARCHAR(255),
  "Asistente" VARCHAR(255)
);

-- Tabla de Cliente
CREATE TABLE IF NOT EXISTS "Cliente" (
  "DNI" VARCHAR(20) PRIMARY KEY,
  "Nombre" VARCHAR(100),
  "Apellido" VARCHAR(100),
  "Email" VARCHAR(255),
  "Telefono" VARCHAR(30),
  "idEmpresa" INT
);

-- Tabla de Espacios (contenedores: Planta Baja, Primer Piso, Terraza)
CREATE TABLE IF NOT EXISTS "Espacios" (
  "Espacio" SERIAL PRIMARY KEY,
  "Nombre" VARCHAR(255),
  "Capacidad" INT,
  "Disponible" BOOLEAN DEFAULT true
);

-- Tabla de Recursos (reservables dentro de un espacio)
-- idRecursoPadre permite sub-recursos (ej: Escritorios dentro de Oficina)
-- esCompleto = true indica "reservar todo el espacio/grupo"
CREATE TABLE IF NOT EXISTS "Recursos" (
  "idRecurso" SERIAL PRIMARY KEY,
  "idEspacio" INT NOT NULL,
  "idRecursoPadre" INT,
  "Nombre" VARCHAR(255) NOT NULL,
  "Descripcion" VARCHAR(500),
  "esCompleto" BOOLEAN DEFAULT false,
  "PrecioHora" DECIMAL(10,2),
  "PrecioSemanal" DECIMAL(10,2),
  "PrecioMensual" DECIMAL(10,2)
);

-- Tabla de Reservas
CREATE TABLE IF NOT EXISTS "Reservas" (
  "idReserva" SERIAL PRIMARY KEY,
  "DNI" VARCHAR(20),
  "Nombre" VARCHAR(255),
  "idRecurso" INT,
  "HorarioReserva" TIME,
  "HorarioFin" TIME,
  "Monto" DECIMAL(10,2),
  "DiaReserva" DATE,
  "TipoReserva" VARCHAR(20) DEFAULT 'turno',
  "Estado" VARCHAR(20) DEFAULT 'activa' CHECK ("Estado" IN ('activa', 'completada', 'cancelada', 'no_asistio'))
);

-- Tabla de ClienteUsuario (autenticacion de clientes)
CREATE TABLE IF NOT EXISTS "ClienteUsuario" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password" VARCHAR(255),
  "google_id" VARCHAR(255) UNIQUE,
  "nombre" VARCHAR(100) NOT NULL,
  "apellido" VARCHAR(100) NOT NULL,
  "dni" VARCHAR(20) UNIQUE,
  "telefono" VARCHAR(30),
  "perfil_completo" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "password_reset_token_hash" VARCHAR(64),
  "password_reset_expires_at" TIMESTAMPTZ
);

-- Tabla de Transaccion
CREATE TABLE IF NOT EXISTS "Transaccion" (
  "idTransaccion" SERIAL PRIMARY KEY,
  "idReserva" INT,
  "MetodoPago" VARCHAR(50),
  "EstadoPago" VARCHAR(50),
  "TipoPago" VARCHAR(20) DEFAULT 'presencial' CHECK ("TipoPago" IN ('online', 'presencial')),
  "mp_preference_id" VARCHAR(255),
  "mp_payment_id" VARCHAR(255)
);

-- Foreign Keys
ALTER TABLE "Cliente" ADD FOREIGN KEY ("idEmpresa") REFERENCES "Empresa" ("idEmpresa") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Recursos" ADD FOREIGN KEY ("idEspacio") REFERENCES "Espacios" ("Espacio") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Recursos" ADD FOREIGN KEY ("idRecursoPadre") REFERENCES "Recursos" ("idRecurso") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Reservas" ADD FOREIGN KEY ("DNI") REFERENCES "Cliente" ("DNI") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Reservas" ADD FOREIGN KEY ("idRecurso") REFERENCES "Recursos" ("idRecurso") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Transaccion" ADD FOREIGN KEY ("idReserva") REFERENCES "Reservas" ("idReserva") DEFERRABLE INITIALLY IMMEDIATE;

-- Insertar usuario admin por defecto (password: admin123)
INSERT INTO usuarios (email, password, rol) VALUES
('admin@bowe.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin');

-- ============================================================
-- Datos iniciales: Espacios y Recursos
-- ============================================================

INSERT INTO "Espacios" ("Nombre", "Capacidad", "Disponible") VALUES
  ('Planta Baja', 20, true),
  ('Primer Piso', 10, true),
  ('Terraza', 15, true);

-- Planta Baja
INSERT INTO "Recursos" ("idEspacio", "Nombre", "esCompleto") VALUES
  (1, 'Banco 1', false), (1, 'Banco 2', false), (1, 'Banco 3', false),
  (1, 'Banco 4', false), (1, 'Banco 5', false),
  (1, 'Sillón 1', false), (1, 'Sillón 2', false), (1, 'Sillón 3', false),
  (1, 'Sillón 4', false), (1, 'Sillón 5', false),
  (1, 'Planta Baja Completa', true);

-- Primer Piso: Oficina Privada (grupo)
INSERT INTO "Recursos" ("idEspacio", "Nombre", "Descripcion", "esCompleto") VALUES
  (2, 'Oficina Privada', '4 escritorios privados', false);

INSERT INTO "Recursos" ("idEspacio", "idRecursoPadre", "Nombre", "esCompleto")
SELECT 2, r."idRecurso", sub."Nombre", sub."esCompleto"
FROM "Recursos" r,
(VALUES ('Escritorio 1', false), ('Escritorio 2', false),
        ('Escritorio 3', false), ('Escritorio 4', false),
        ('Oficina Completa', true)) AS sub("Nombre", "esCompleto")
WHERE r."Nombre" = 'Oficina Privada' AND r."idEspacio" = 2;

-- Primer Piso: Sala de Conferencias
INSERT INTO "Recursos" ("idEspacio", "Nombre", "Descripcion", "esCompleto") VALUES
  (2, 'Sala de Conferencias', 'Espacio con proyector y TV para reuniones', false);

-- Terraza
INSERT INTO "Recursos" ("idEspacio", "Nombre", "esCompleto") VALUES
  (3, 'Mesa 1', false), (3, 'Mesa 2', false), (3, 'Mesa 3', false),
  (3, 'Mesa 4', false), (3, 'Mesa 5', false),
  (3, 'Terraza Completa', true);

-- Precios de referencia (ajustar según tarifas reales)
UPDATE "Recursos" SET "PrecioHora" = 2500  WHERE "Nombre" LIKE 'Banco%';
UPDATE "Recursos" SET "PrecioHora" = 3000  WHERE "Nombre" LIKE 'Sill%';
UPDATE "Recursos" SET "PrecioHora" = 15000 WHERE "Nombre" = 'Planta Baja Completa';
UPDATE "Recursos" SET "PrecioSemanal" = 45000,  "PrecioMensual" = 150000 WHERE "Nombre" LIKE 'Escritorio%';
UPDATE "Recursos" SET "PrecioSemanal" = 150000, "PrecioMensual" = 500000 WHERE "Nombre" = 'Oficina Completa';
UPDATE "Recursos" SET "PrecioHora" = 8000 WHERE "Nombre" = 'Sala de Conferencias';
UPDATE "Recursos" SET "PrecioHora" = 2000  WHERE "Nombre" LIKE 'Mesa%';
UPDATE "Recursos" SET "PrecioHora" = 10000 WHERE "Nombre" = 'Terraza Completa';
