import { Router } from "express";
import { verificarToken, verificarAdmin } from "../middleware/auth.middleware.js";
import {
  listarUsuarios,
  listarPermisos,
  crearUsuario,
  actualizarUsuario,
  actualizarPermisos,
  eliminarUsuario,
} from "../controllers/adminUsuarios.controller.js";

const router = Router();

// Todas las rutas requieren token válido y rol admin
router.use(verificarToken, verificarAdmin);

router.get("/usuarios", listarUsuarios);
router.get("/permisos", listarPermisos);
router.post("/usuarios", crearUsuario);
router.put("/usuarios/:id", actualizarUsuario);
router.put("/usuarios/:id/permisos", actualizarPermisos);
router.delete("/usuarios/:id", eliminarUsuario);

export default router;
