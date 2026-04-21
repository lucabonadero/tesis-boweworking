import { Router } from "express";
import {
  obtenerRecursos,
  obtenerRecursosPorEspacio,
  obtenerRecursoPorId,
  crearRecurso,
  actualizarRecurso,
  eliminarRecurso,
  obtenerDisponibilidad,
} from "../controllers/recursos.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", obtenerRecursos);
router.get("/disponibilidad", obtenerDisponibilidad);
router.get("/espacio/:idEspacio", obtenerRecursosPorEspacio);
router.get("/:id", obtenerRecursoPorId);
router.post("/", verificarToken, verificarStaff, crearRecurso);
router.put("/:id", verificarToken, verificarStaff, actualizarRecurso);
router.delete("/:id", verificarToken, verificarStaff, eliminarRecurso);

export default router;
