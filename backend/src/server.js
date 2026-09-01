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
import pagosRoutes from "./routes/pagos.routes.js";
import espaciosDashboardRoutes from "./routes/espaciosDashboard.routes.js";
import aiReservaRoutes from "./routes/aiReserva.routes.js";
import adminUsuariosRoutes from "./routes/adminUsuarios.routes.js";
import adminClientesRoutes from "./routes/adminClientes.routes.js";
import estructuraRoutes from "./routes/estructura.routes.js";
import pisosPublicoRoutes from "./routes/pisosPublico.routes.js";
import creditosRoutes from "./routes/creditos.routes.js";

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
// 3mb: comprobante de estudiante viaja en base64.
app.use(express.json({ limit: "3mb" }));

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/auth/cliente", clienteAuthRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/espacios", espaciosRoutes);
app.use("/api/recursos", recursosRoutes);
app.use("/api/reservas", reservasRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/creditos", creditosRoutes);
app.use("/api/dashboard/espacios", espaciosDashboardRoutes);
app.use("/api/ai", aiReservaRoutes);
// /api/admin/estructura debe ir ANTES que /api/admin para que el middleware
// global de adminUsuariosRoutes no intercepte los requests de estructura.
app.use("/api/admin/estructura", estructuraRoutes);
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
