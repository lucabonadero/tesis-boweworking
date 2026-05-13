/**
 * Seed: crea el usuario staff@admin.bowe con rol 'staff'
 * y le asigna todos los permisos excepto el módulo financiero.
 *
 * Uso: node backend/scripts/seed-staff.js
 * (Ejecutar desde la raíz del proyecto, con las variables de entorno del backend cargadas)
 */

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const STAFF_EMAIL = "staff@admin.bowe";
const STAFF_PASSWORD = "staff123";
const STAFF_ROL = "staff";

// Permisos que tiene el rol staff por defecto (sin acceso financiero)
const STAFF_PERMISOS = [
  "ver_reservas",
  "crear_reservas",
  "modificar_reservas",
  "eliminar_reservas",
  "ver_clientes",
  "gestionar_clientes",
  "ver_espacios",
  "gestionar_espacios",
  "ver_calendario",
  "altas_clientes",
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [STAFF_EMAIL]
    );

    let staffId;
    if (existing.length > 0) {
      staffId = existing[0].id;
      console.log(`Usuario ${STAFF_EMAIL} ya existe (id=${staffId}). Actualizando contraseña y rol...`);
      const hash = await bcrypt.hash(STAFF_PASSWORD, 10);
      await client.query(
        "UPDATE usuarios SET password = $1, rol = $2 WHERE id = $3",
        [hash, STAFF_ROL, staffId]
      );
    } else {
      const hash = await bcrypt.hash(STAFF_PASSWORD, 10);
      const { rows } = await client.query(
        "INSERT INTO usuarios (email, password, rol) VALUES ($1, $2, $3) RETURNING id",
        [STAFF_EMAIL, hash, STAFF_ROL]
      );
      staffId = rows[0].id;
      console.log(`Usuario ${STAFF_EMAIL} creado (id=${staffId}).`);
    }

    // Resetear y reasignar permisos
    await client.query("DELETE FROM usuario_permisos WHERE usuario_id = $1", [staffId]);
    for (const clave of STAFF_PERMISOS) {
      await client.query(
        "INSERT INTO usuario_permisos (usuario_id, permiso_clave) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [staffId, clave]
      );
    }

    await client.query("COMMIT");
    console.log(`Permisos asignados (${STAFF_PERMISOS.length}): ${STAFF_PERMISOS.join(", ")}`);
    console.log("\n✅ Seed completado:");
    console.log(`   Email:    ${STAFF_EMAIL}`);
    console.log(`   Password: ${STAFF_PASSWORD}`);
    console.log(`   Rol:      ${STAFF_ROL}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error en seed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
