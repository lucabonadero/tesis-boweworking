import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";

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
  const faltantes = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_NAME"].filter(
    (clave) => !process.env[clave]?.trim()
  );

  if (faltantes.length > 0) {
    console.error(
      `[config] Faltan variables de entorno obligatorias: ${faltantes.join(", ")}.\n` +
      `Definilas en backend/.env antes de iniciar el servidor.`
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
  const raw =
    process.env.CORS_ORIGINS?.trim() || process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

// Ruta de prueba
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Bo WeWorking API funcionando" });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
