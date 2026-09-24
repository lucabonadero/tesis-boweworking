import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import {
  normalizarUrlsDeEntorno,
  normalizarListaUrls,
} from "./utils/urlBase.js";

// Antes de que los controladores lean FRONTEND_URL o BACKEND_URL: Render las
// entrega sin esquema y así quedan listas para usar en enlaces y CORS.
normalizarUrlsDeEntorno();

import express from "express";
import cors from "cors";
import helmet from "helmet";

import pool from "./config/db.js";

import authRoutes from "./routes/auth.routes.js";
import clienteAuthRoutes from "./routes/clienteAuth.routes.js";
import clientesRoutes from "./routes/clientes.routes.js";
import espaciosRoutes from "./routes/espacios.routes.js";
import reservasRoutes from "./routes/reservas.routes.js";
import recursosRoutes from "./routes/recursos.routes.js";
import disponibilidadRoutes from "./routes/disponibilidad.routes.js";
import pagosRoutes from "./routes/pagos.routes.js";
import espaciosDashboardRoutes from "./routes/espaciosDashboard.routes.js";
import aiReservaRoutes from "./routes/aiReserva.routes.js";
import adminUsuariosRoutes from "./routes/adminUsuarios.routes.js";
import adminClientesRoutes from "./routes/adminClientes.routes.js";
import estructuraRoutes from "./routes/estructura.routes.js";
import pisosPublicoRoutes from "./routes/pisosPublico.routes.js";
import creditosRoutes from "./routes/creditos.routes.js";
import creditosPublicoRoutes from "./routes/creditosPublico.routes.js";
import finanzasCreditosRoutes from "./routes/finanzasCreditos.routes.js";
import adminCreditosRoutes from "./routes/adminCreditos.routes.js";
import beneficioEstudianteRoutes from "./routes/beneficioEstudiante.routes.js";

/**
 * Sin estas variables el servidor arranca pero falla en la primera petición:
 * `jwt.sign` lanza sin JWT_SECRET y todo login devuelve 500 sin explicar por qué.
 * Mejor no levantar y decirlo claro.
 */
function verificarConfiguracion() {
  // Los Postgres gestionados (Render, Neon, Railway) dan un solo DATABASE_URL
  // en vez de las variables sueltas. Si está presente, exigir DB_HOST y
  // compañía rechazaría un deploy que en realidad está bien configurado.
  const clavesBase = process.env.DATABASE_URL?.trim()
    ? []
    : ["DB_HOST", "DB_USER", "DB_NAME"];

  const faltantes = ["JWT_SECRET", ...clavesBase].filter(
    (clave) => !process.env[clave]?.trim()
  );

  if (faltantes.length > 0) {
    console.error(
      `[config] Faltan variables de entorno obligatorias: ${faltantes.join(", ")}.\n` +
      `Definilas en backend/.env (local) o en las variables del proveedor (produccion).`
    );
    process.exit(1);
  }

  // Un secreto corto se rompe por fuerza bruta y permite firmar tokens propios.
  if (process.env.JWT_SECRET.trim().length < 32) {
    const mensaje =
      "[config] JWT_SECRET es demasiado corto (mínimo 32 caracteres). " +
      "Generá uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"";
    if (process.env.NODE_ENV === "production") {
      console.error(mensaje);
      process.exit(1);
    }
    console.warn(`${mensaje} — se permite solo en desarrollo.`);
  }
}

verificarConfiguracion();

const app = express();
const PORT = process.env.PORT || 3001;

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

function parseCorsOrigins() {
  // Ya pasaron por normalizarUrlsDeEntorno: llegan con esquema y sin barra final.
  const raw =
    process.env.CORS_ORIGINS?.trim() || process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
  return normalizarListaUrls(raw);
}

const corsOrigins = parseCorsOrigins();
const corsOptions = {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
};

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));

// El comprobante de estudiante viaja en base64 y necesita 3mb, pero ese margen
// solo se abre en esa ruta: en el resto, 100kb sobra y evita que se pueda
// empujar megabytes contra cualquier endpoint (por ejemplo /login).
app.use("/api/auth/cliente/solicitar-estudiante", express.json({ limit: "3mb" }));
app.use(express.json({ limit: "100kb" }));

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/auth/cliente", clienteAuthRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/espacios", espaciosRoutes);
app.use("/api/recursos", recursosRoutes);
app.use("/api/disponibilidad", disponibilidadRoutes);
app.use("/api/reservas", reservasRoutes);
app.use("/api/pagos", pagosRoutes);
// La vidriera pública va antes: el router de créditos exige token para todo lo demás.
app.use("/api/publico/creditos", creditosPublicoRoutes);
app.use("/api/creditos", creditosRoutes);
app.use("/api/finanzas/creditos", finanzasCreditosRoutes);
app.use("/api/dashboard/espacios", espaciosDashboardRoutes);
app.use("/api/ai", aiReservaRoutes);
// /api/admin/estructura y /api/admin/creditos deben ir ANTES que /api/admin
// para que el middleware global de adminUsuariosRoutes no las intercepte.
app.use("/api/admin/estructura", estructuraRoutes);
app.use("/api/admin/creditos", adminCreditosRoutes);
app.use("/api/admin/beneficios-estudiante", beneficioEstudianteRoutes);
app.use("/api/admin/clientes-usuarios", adminClientesRoutes);
app.use("/api/admin", adminUsuariosRoutes);
app.use("/api/pisos/publicos", pisosPublicoRoutes);

/**
 * Render consulta esta ruta para decidir si el servicio está sano y reiniciarlo
 * si no responde. Por eso toca la base: un proceso que sigue en pie pero perdió
 * la conexión está caído a efectos prácticos, y conviene que Render lo sepa.
 */
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", message: "Bo WeWorking API funcionando", db: "ok" });
  } catch (error) {
    console.error("[health] La base no responde:", error.message);
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

// Una ruta mal escrita devolvía el HTML de error de Express, que el frontend no
// puede parsear como JSON y termina mostrando "Unexpected token <".
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

/**
 * Sin este middleware, un throw dentro de un handler deja la petición colgada
 * hasta que el cliente corta: el usuario ve un spinner infinito en vez de un
 * error. Además evita filtrar el stack trace al navegador en producción.
 */
// Express distingue el manejador de errores por su aridad de 4 argumentos:
// quitar `next` lo convertiria en un middleware normal y dejaria de capturar.
app.use((err, _req, res, next) => {
  console.error("[error]", err.stack || err.message);

  if (res.headersSent) return next(err);

  const esProduccion = process.env.NODE_ENV === "production";
  res.status(err.status || 500).json({
    error: esProduccion ? "Error interno del servidor" : err.message,
  });
});

// 0.0.0.0 y no el loopback: en un contenedor (Render, Docker) el healthcheck
// llega desde fuera del contenedor y un server atado a localhost no lo ve.
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`[cors] Origenes permitidos: ${corsOrigins.join(", ")}`);
});

/**
 * En cada deploy Render manda SIGTERM y espera. Sin esto el proceso muere de
 * golpe: las peticiones en vuelo se cortan a mitad de camino y las conexiones
 * a la base quedan abiertas del lado del servidor hasta que expiran. Con una
 * reserva o un pago en curso, eso es una operación perdida.
 */
function apagarOrdenadamente(senal) {
  console.log(`[shutdown] ${senal} recibido: cerrando.`);

  // Deja de aceptar conexiones nuevas y espera a que terminen las abiertas.
  server.close(async () => {
    try {
      await pool.end();
      console.log("[shutdown] Conexiones cerradas.");
    } catch (error) {
      console.error("[shutdown] Error al cerrar el pool:", error.message);
    }
    process.exit(0);
  });

  // Si algo queda colgado, Render igual mata el proceso: mejor rendirse antes
  // y con un mensaje en el log que quedar esperando sin explicación.
  setTimeout(() => {
    console.error("[shutdown] Cierre forzado tras 10s de espera.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => apagarOrdenadamente("SIGTERM"));
process.on("SIGINT", () => apagarOrdenadamente("SIGINT"));

/**
 * Una promesa rechazada sin catch tumba el proceso entero en Node 15+. Un
 * bug en una ruta secundaria no debería sacar de servicio toda la aplicación:
 * se registra y se sigue.
 */
process.on("unhandledRejection", (motivo) => {
  console.error("[unhandledRejection]", motivo);
});

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error.stack || error.message);
  // Acá sí conviene salir: el estado del proceso ya no es confiable. Render
  // lo reinicia solo.
  apagarOrdenadamente("uncaughtException");
});
