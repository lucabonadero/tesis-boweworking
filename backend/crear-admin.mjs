/**
 * Crea (o repone) la cuenta administradora inicial.
 *
 * El schema no trae usuarios: en una base recién creada nadie puede entrar al
 * panel. Este script cubre ese arranque en frío.
 *
 * Uso:
 *   node crear-admin.mjs                       lee ADMIN_EMAIL / ADMIN_PASSWORD
 *   node crear-admin.mjs mail@x.com "MiClave"  o los toma por argumento
 *
 * La conexión sale de DATABASE_URL, o de las DB_* del .env si no está.
 */
import bcrypt from "bcryptjs";
import pool from "./src/config/db.js";

const email = (process.argv[2] || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.argv[3] || process.env.ADMIN_PASSWORD || "";

if (!email || !password) {
  console.error(
    "Faltan datos.\n" +
    "  node crear-admin.mjs <email> <password>\n" +
    "  o definí ADMIN_EMAIL y ADMIN_PASSWORD."
  );
  process.exit(1);
}

// Una clave corta en la cuenta con más privilegios del sistema no tiene arreglo
// después: queda hasheada y en uso.
if (password.length < 12) {
  console.error("La contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`"${email}" no parece un email válido.`);
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));

  // ON CONFLICT y no un INSERT pelado: si el script se corre dos veces (o la
  // clave se perdió) esto repone el acceso en vez de fallar por email duplicado.
  const { rows } = await pool.query(
    `INSERT INTO usuarios (email, password, rol)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE
       SET password = EXCLUDED.password,
           rol      = 'admin'
     RETURNING id, email, rol, created_at`,
    [email, hash]
  );

  const u = rows[0];
  console.log(`Listo. Administrador #${u.id} <${u.email}> con rol ${u.rol}.`);
} catch (error) {
  console.error(`No se pudo crear el administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
