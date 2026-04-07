import { Router } from "express";
import {
  obtenerPagos,
  obtenerPagoPorId,
  registrarPago,
  actualizarPago,
  cambiarEstadoPago,
  eliminarPago,
} from "../controllers/pagos.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", verificarToken, obtenerPagos);
router.get("/:id", verificarToken, obtenerPagoPorId);
router.post("/", verificarToken, registrarPago);
router.put("/:id", verificarToken, actualizarPago);
router.patch("/:id/estado", verificarToken, cambiarEstadoPago);
router.delete("/:id", verificarToken, eliminarPago);

export default router;
