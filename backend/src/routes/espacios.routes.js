import { Router } from "express";
import {
  obtenerEspacios,
  obtenerEspacioPorId,
  crearEspacio,
  actualizarEspacio,
  eliminarEspacio,
} from "../controllers/espacios.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", obtenerEspacios);
router.get("/:id", obtenerEspacioPorId);
router.post("/", verificarToken, crearEspacio);
router.put("/:id", verificarToken, actualizarEspacio);
router.delete("/:id", verificarToken, eliminarEspacio);

export default router;
