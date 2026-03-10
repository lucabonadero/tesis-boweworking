import { Router } from "express";
import {
  obtenerClientes,
  obtenerClientePorDni,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from "../controllers/clientes.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", verificarToken, obtenerClientes);
router.get("/:dni", verificarToken, obtenerClientePorDni);
router.post("/", crearCliente);
router.put("/:dni", verificarToken, actualizarCliente);
router.delete("/:dni", verificarToken, eliminarCliente);

export default router;
