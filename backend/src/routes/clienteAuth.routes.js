import { Router } from "express";
import {
  registro,
  login,
  googleAuth,
  me,
  completarPerfil,
} from "../controllers/clienteAuth.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/registro", registro);
router.post("/login", login);
router.post("/google", googleAuth);
router.get("/me", verificarToken, me);
router.put("/completar-perfil", verificarToken, completarPerfil);

export default router;
