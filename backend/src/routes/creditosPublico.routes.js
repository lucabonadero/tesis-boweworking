import { Router } from "express";
import { obtenerPaquetesActivos } from "../controllers/creditos.controller.js";

const router = Router();

// Vidriera pública de la landing: solo los paquetes activos, sin datos de cuenta.
router.get("/paquetes", obtenerPaquetesActivos);

export default router;
