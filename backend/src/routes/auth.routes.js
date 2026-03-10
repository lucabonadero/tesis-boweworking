import { Router } from "express";
import {
  login,
  registrarAdmin,
} from "../controllers/auth.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.post("/registro", verificarToken, registrarAdmin);

export default router;
