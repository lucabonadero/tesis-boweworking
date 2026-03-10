import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Usuario admin
    const salt = await bcrypt.genSalt(10);
    const adminPass = await bcrypt.hash("admin123", salt);
    await client.query(
      `INSERT INTO usuarios (email, password, rol) VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      ["admin@bowe.com", adminPass]
    );
    console.log("Admin creado: admin@bowe.com / admin123");

    // 2. Empresas
    await client.query(`
      INSERT INTO "Empresa" ("idEmpresa", "Nombre", "Asistente") VALUES
        (1, 'TechCorp', 'Laura García'),
        (2, 'DesignStudio', 'Martín López'),
        (3, 'StartupHub', 'Ana Rodríguez')
      ON CONFLICT DO NOTHING
    `);
    console.log("Empresas insertadas");

    // 3. Clientes
    await client.query(`
      INSERT INTO "Cliente" ("DNI", "Nombre", "Apellido", "Email", "idEmpresa") VALUES
        ('30123456', 'Juan', 'Pérez', 'juan.perez@email.com', 1),
        ('30234567', 'María', 'González', 'maria.gonzalez@email.com', 1),
        ('30345678', 'Carlos', 'Ramírez', 'carlos.ramirez@email.com', 2),
        ('30456789', 'Lucía', 'Fernández', 'lucia.fernandez@email.com', 3),
        ('30567890', 'Pedro', 'Martínez', 'pedro.martinez@email.com', NULL)
      ON CONFLICT ("DNI") DO NOTHING
    `);
    console.log("Clientes insertados");

    // 4. Espacios
    await client.query(`
      INSERT INTO "Espacios" ("Espacio", "Nombre", "Capacidad", "Disponible") VALUES
        (1, 'Sala de Reuniones A', 8, true),
        (2, 'Sala de Reuniones B', 12, true),
        (3, 'Oficina Privada 1', 2, true),
        (4, 'Oficina Privada 2', 4, true),
        (5, 'Espacio Coworking', 20, true),
        (6, 'Sala de Conferencias', 30, true)
      ON CONFLICT DO NOTHING
    `);
    console.log("Espacios insertados");

    // 5. Reservas
    await client.query(`
      INSERT INTO "Reservas" ("idReserva", "DNI", "Nombre", "idEspacio", "HorarioReserva", "Monto", "DiaReserva") VALUES
        (1, '30123456', 'Juan Pérez', 1, '09:00 - 12:00', 1500.00, '2026-03-10'),
        (2, '30234567', 'María González', 2, '14:00 - 17:00', 2000.00, '2026-03-10'),
        (3, '30345678', 'Carlos Ramírez', 5, '08:00 - 18:00', 3500.00, '2026-03-11'),
        (4, '30456789', 'Lucía Fernández', 3, '10:00 - 13:00', 1200.00, '2026-03-12'),
        (5, '30567890', 'Pedro Martínez', 6, '09:00 - 13:00', 5000.00, '2026-03-12')
      ON CONFLICT DO NOTHING
    `);
    console.log("Reservas insertadas");

    // 6. Transacciones
    await client.query(`
      INSERT INTO "Transaccion" ("idTransaccion", "idReserva", "MetodoPago", "EstadoPago") VALUES
        (1, 1, 'Transferencia', 'Pagado'),
        (2, 2, 'Efectivo', 'Pagado'),
        (3, 3, 'Tarjeta', 'Pendiente'),
        (4, 4, 'Transferencia', 'Pagado'),
        (5, 5, 'Efectivo', 'Pendiente')
      ON CONFLICT DO NOTHING
    `);
    console.log("Transacciones insertadas");

    await client.query("COMMIT");
    console.log("\n=== Seed completado exitosamente ===");
    console.log("Login: admin@bowe.com / admin123");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error en seed:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
