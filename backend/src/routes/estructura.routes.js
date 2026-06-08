import { Router } from "express";
import {
  verificarToken,
  verificarPermiso,
  verificarPermisoAlguno,
} from "../middleware/auth.middleware.js";
import {
  obtenerEstructura,
  obtenerTiposRecurso,
  commitEstructura,
  obtenerImpactoRecurso,
} from "../controllers/estructura.controller.js";

const router = Router();

// Todas las rutas requieren token válido
router.use(verificarToken);

// Lectura: ver_espacios o gestionar_estructura — quien puede modificar también puede ver.
const puedeVerEstructura = verificarPermisoAlguno("ver_espacios", "gestionar_estructura");
router.get("/", puedeVerEstructura, obtenerEstructura);
router.get("/tipos-recurso", puedeVerEstructura, obtenerTiposRecurso);
router.get("/recurso/:id/impacto", puedeVerEstructura, obtenerImpactoRecurso);

// Escritura: requiere gestionar_estructura
router.post("/commit", verificarPermiso("gestionar_estructura"), commitEstructura);

export default router;
