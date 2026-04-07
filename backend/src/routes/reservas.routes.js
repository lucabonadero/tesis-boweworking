import { Router } from "express";
import {
  obtenerReservas,
  obtenerReservaPorId,
  crearReserva,
  actualizarReserva,
  eliminarReserva,
} from "../controllers/reservas.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", verificarToken, obtenerReservas);
router.get("/:id", verificarToken, obtenerReservaPorId);
router.post("/", verificarToken, crearReserva);
router.put("/:id", verificarToken, actualizarReserva);
router.delete("/:id", verificarToken, eliminarReserva);

export default router;
