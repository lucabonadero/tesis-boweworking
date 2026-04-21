import { Router } from "express";
import {
  obtenerEspacios,
  obtenerEspacioPorId,
  crearEspacio,
  actualizarEspacio,
  eliminarEspacio,
} from "../controllers/espacios.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", obtenerEspacios);
router.get("/:id", obtenerEspacioPorId);
router.post("/", verificarToken, verificarStaff, crearEspacio);
router.put("/:id", verificarToken, verificarStaff, actualizarEspacio);
router.delete("/:id", verificarToken, verificarStaff, eliminarEspacio);

export default router;
