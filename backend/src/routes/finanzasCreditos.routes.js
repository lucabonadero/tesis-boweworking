import { Router } from "express";
import {
  verificarToken,
  verificarPermiso,
  verificarPermisoAlguno,
} from "../middleware/auth.middleware.js";
import {
  obtenerResumenFinanciero,
  obtenerIngresosPorDia,
  obtenerCompras,
  registrarCompraPresencial,
  anularCompra,
  buscarClientes,
  resolverPropietario,
} from "../controllers/finanzasCreditos.controller.js";

const router = Router();

// Entrar al módulo requiere ver_financiero; los montos se filtran adentro,
// porque el staff sí puede ver cuántos paquetes se vendieron.
router.use(verificarToken, verificarPermiso("ver_financiero"));

// Deja `req.esPropietario` resuelto con una sola consulta para todo el request:
// varios handlers lo necesitan y antes cada uno releía la fila de usuarios.
router.use(resolverPropietario);

// Cobrar en mostrador mueve plata y saldo: pide permiso de escritura.
const puedeCobrar = verificarPermisoAlguno("gestionar_pagos", "registrar_pagos");

router.get("/resumen", obtenerResumenFinanciero);
router.get("/ingresos-por-dia", obtenerIngresosPorDia);
router.get("/compras", obtenerCompras);
router.get("/clientes", puedeCobrar, buscarClientes);
router.post("/compras/presencial", puedeCobrar, registrarCompraPresencial);
router.delete("/compras/:id", puedeCobrar, anularCompra);

export default router;
