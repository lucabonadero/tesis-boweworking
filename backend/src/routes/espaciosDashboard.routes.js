import { Router } from "express";
import {
  obtenerDisponibilidadRango,
  obtenerMetricas,
  generarReportePDF,
} from "../controllers/espaciosDashboard.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/disponibilidad", verificarToken, obtenerDisponibilidadRango);
router.get("/metricas", verificarToken, obtenerMetricas);
router.get("/reporte-pdf", verificarToken, generarReportePDF);

export default router;
