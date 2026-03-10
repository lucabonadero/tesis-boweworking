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
  "idEmpresa" INT
);

-- Tabla de Espacios
CREATE TABLE IF NOT EXISTS "Espacios" (
  "Espacio" SERIAL PRIMARY KEY,
  "Nombre" VARCHAR(255),
  "Capacidad" INT,
  "Disponible" BOOLEAN DEFAULT true
);

-- Tabla de Reservas
CREATE TABLE IF NOT EXISTS "Reservas" (
  "idReserva" SERIAL PRIMARY KEY,
  "DNI" VARCHAR(20),
  "Nombre" VARCHAR(255),
  "idEspacio" INT,
  "HorarioReserva" VARCHAR(255),
  "Monto" DECIMAL(10,2),
  "DiaReserva" DATE
);

-- Tabla de Transaccion
CREATE TABLE IF NOT EXISTS "Transaccion" (
  "idTransaccion" SERIAL PRIMARY KEY,
  "idReserva" INT,
  "MetodoPago" VARCHAR(50),
  "EstadoPago" VARCHAR(50)
);

-- Foreign Keys
ALTER TABLE "Cliente" ADD FOREIGN KEY ("idEmpresa") REFERENCES "Empresa" ("idEmpresa") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Reservas" ADD FOREIGN KEY ("DNI") REFERENCES "Cliente" ("DNI") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Reservas" ADD FOREIGN KEY ("idEspacio") REFERENCES "Espacios" ("Espacio") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Transaccion" ADD FOREIGN KEY ("idReserva") REFERENCES "Reservas" ("idReserva") DEFERRABLE INITIALLY IMMEDIATE;

-- Insertar usuario admin por defecto (password: admin123)
-- Hash generado con bcryptjs, rounds=10
INSERT INTO usuarios (email, password, rol) VALUES
('admin@bowe.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin');
