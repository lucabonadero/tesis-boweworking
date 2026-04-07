import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
console.log(path.resolve(__dirname, "../.env"));

import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import clienteAuthRoutes from "./routes/clienteAuth.routes.js";
import clientesRoutes from "./routes/clientes.routes.js";
import espaciosRoutes from "./routes/espacios.routes.js";
import reservasRoutes from "./routes/reservas.routes.js";
import recursosRoutes from "./routes/recursos.routes.js";
import pagosRoutes from "./routes/pagos.routes.js";
import espaciosDashboardRoutes from "./routes/espaciosDashboard.routes.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/auth/cliente", clienteAuthRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/espacios", espaciosRoutes);
app.use("/api/recursos", recursosRoutes);
app.use("/api/reservas", reservasRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/dashboard/espacios", espaciosDashboardRoutes);

// Ruta de prueba
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Bo WeWorking API funcionando" });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
