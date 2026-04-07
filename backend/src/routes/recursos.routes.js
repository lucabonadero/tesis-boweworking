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
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", obtenerRecursos);
router.get("/disponibilidad", obtenerDisponibilidad);
router.get("/espacio/:idEspacio", obtenerRecursosPorEspacio);
router.get("/:id", obtenerRecursoPorId);
router.post("/", verificarToken, crearRecurso);
router.put("/:id", verificarToken, actualizarRecurso);
router.delete("/:id", verificarToken, eliminarRecurso);

export default router;
