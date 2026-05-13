import { Router } from "express";
import {
  verificarToken,
  verificarPermiso,
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

// Lectura: requiere ver_espacios (cualquier staff puede ver el árbol)
router.get("/", verificarPermiso("ver_espacios"), obtenerEstructura);
router.get("/tipos-recurso", verificarPermiso("ver_espacios"), obtenerTiposRecurso);
router.get("/recurso/:id/impacto", verificarPermiso("ver_espacios"), obtenerImpactoRecurso);

// Escritura: requiere gestionar_estructura
router.post("/commit", verificarPermiso("gestionar_estructura"), commitEstructura);

export default router;
