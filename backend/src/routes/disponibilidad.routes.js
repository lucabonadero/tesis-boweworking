import { Router } from "express";
import {
  obtenerBloqueos,
  postBloqueo,
  putBloqueo,
  deleteBloqueo,
  getDisponibilidadRecurso,
  putDisponibilidadRecurso,
  getSlots,
} from "../controllers/disponibilidad.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  crearBloqueoSchema,
  actualizarBloqueoSchema,
  guardarDisponibilidadSchema,
  slotsQuerySchema,
  bloqueosQuerySchema,
} from "../schemas/validation.schemas.js";

const router = Router();

router.get("/bloqueos", validateQuery(bloqueosQuerySchema), obtenerBloqueos);
router.post("/bloqueos", verificarToken, verificarStaff, validateBody(crearBloqueoSchema), postBloqueo);
router.put("/bloqueos/:id", verificarToken, verificarStaff, validateBody(actualizarBloqueoSchema), putBloqueo);
router.delete("/bloqueos/:id", verificarToken, verificarStaff, deleteBloqueo);

router.get("/slots", validateQuery(slotsQuerySchema), getSlots);
router.get("/recurso/:idRecurso", getDisponibilidadRecurso);
router.put(
  "/recurso/:idRecurso",
  verificarToken,
  verificarStaff,
  validateBody(guardarDisponibilidadSchema),
  putDisponibilidadRecurso
);

export default router;
