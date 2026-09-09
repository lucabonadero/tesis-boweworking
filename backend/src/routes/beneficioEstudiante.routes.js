import { Router } from "express";
import { verificarToken, verificarPermiso } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { beneficioEstudianteSchema } from "../schemas/validation.schemas.js";
import { obtenerBeneficios, putBeneficio } from "../controllers/beneficioEstudiante.controller.js";

const router = Router();

router.use(verificarToken, verificarPermiso("gestionar_estructura"));

router.get("/", obtenerBeneficios);
router.put("/:idRecurso", validateBody(beneficioEstudianteSchema), putBeneficio);

export default router;
