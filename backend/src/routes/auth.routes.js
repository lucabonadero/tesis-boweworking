import { Router } from "express";
import {
  login,
  registrarAdmin,
} from "../controllers/auth.controller.js";
import { verificarToken, verificarAdmin } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { loginLimiter, staffRegistroLimiter } from "../middleware/rateLimit.middleware.js";
import { staffLoginSchema, staffRegistrarAdminSchema } from "../schemas/validation.schemas.js";

const router = Router();

router.post("/login", loginLimiter, validateBody(staffLoginSchema), login);
router.post(
  "/registro",
  staffRegistroLimiter,
  verificarToken,
  verificarAdmin,
  validateBody(staffRegistrarAdminSchema),
  registrarAdmin
);

export default router;
