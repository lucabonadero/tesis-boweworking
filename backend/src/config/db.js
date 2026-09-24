import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Los Postgres gestionados (Render, Neon, Railway) entregan un único
 * DATABASE_URL y exigen TLS: sin `ssl` la conexión muere con
 * "no pg_hba.conf entry for host ... SSL off". En local seguimos con las
 * variables sueltas y sin TLS, que es como corre el contenedor de Compose.
 *
 * rejectUnauthorized: false porque estos proveedores firman el certificado
 * con una CA propia que no está en el trust store de Node. El tráfico va
 * igual cifrado; lo que se omite es validar la cadena.
 */
const connectionString = process.env.DATABASE_URL?.trim();

const pool = new pg.Pool(
  connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false },
        // Los planes chicos de Postgres gestionado limitan las conexiones
        // simultáneas (basic-256mb de Render ronda las 20): con un pool sin
        // techo un pico de tráfico las agota y las queries empiezan a fallar.
        max: Number(process.env.DB_POOL_MAX) || 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }
);

/**
 * Un error en una conexión ociosa (el proveedor la recicla, se cae la red)
 * llega como evento del pool, no como rechazo de una query. Sin este handler
 * Node lo trata como excepción no capturada y tumba el proceso entero.
 */
pool.on("error", (err) => {
  console.error("[db] Error en conexión ociosa del pool:", err.message);
});

export default pool;
