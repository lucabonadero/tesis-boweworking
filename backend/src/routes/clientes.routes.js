import { Router } from "express";
import {
  obtenerClientes,
  obtenerClientePorDni,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from "../controllers/clientes.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", verificarToken, verificarStaff, obtenerClientes);
router.get("/:dni", verificarToken, verificarStaff, obtenerClientePorDni);
router.post("/", verificarToken, verificarStaff, crearCliente);
router.put("/:dni", verificarToken, verificarStaff, actualizarCliente);
router.delete("/:dni", verificarToken, verificarStaff, eliminarCliente);

export default router;
