import { Router } from "express";
import {
  obtenerReservas,
  obtenerReservasOcupacionDia,
  obtenerReservaPorId,
  crearReserva,
  crearReservasMultiples,
  actualizarReserva,
  eliminarReserva,
  cambiarEstadoReserva,
  obtenerMisReservas,
} from "../controllers/reservas.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";
import { validateBody, validateCrearReservaBody } from "../middleware/validate.middleware.js";
import { crearReservasMultiplesSchema } from "../schemas/validation.schemas.js";

const router = Router();

router.get("/mis-reservas", verificarToken, obtenerMisReservas);
router.get("/ocupacion-dia", verificarToken, verificarStaff, obtenerReservasOcupacionDia);
router.get("/", verificarToken, verificarStaff, obtenerReservas);
router.get("/:id", verificarToken, obtenerReservaPorId);
router.post("/", verificarToken, validateCrearReservaBody, crearReserva);
router.post("/multiples", verificarToken, validateBody(crearReservasMultiplesSchema), crearReservasMultiples);
router.put("/:id", verificarToken, actualizarReserva);
router.patch("/:id/estado", verificarToken, verificarStaff, cambiarEstadoReserva);
router.delete("/:id", verificarToken, eliminarReserva);

export default router;
