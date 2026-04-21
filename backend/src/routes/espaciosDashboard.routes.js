import { Router } from "express";
import {
  obtenerDisponibilidadRango,
  obtenerMetricas,
  generarReportePDF,
} from "../controllers/espaciosDashboard.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/disponibilidad", verificarToken, verificarStaff, obtenerDisponibilidadRango);
router.get("/metricas", verificarToken, verificarStaff, obtenerMetricas);
router.get("/reporte-pdf", verificarToken, verificarStaff, generarReportePDF);

export default router;
