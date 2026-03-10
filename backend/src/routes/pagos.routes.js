import { Router } from "express";
import {
  obtenerPagos,
  obtenerPagoPorId,
  registrarPago,
  actualizarPago,
  eliminarPago,
} from "../controllers/pagos.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", verificarToken, obtenerPagos);
router.get("/:id", verificarToken, obtenerPagoPorId);
router.post("/", verificarToken, registrarPago);
router.put("/:id", verificarToken, actualizarPago);
router.delete("/:id", verificarToken, eliminarPago);

export default router;
