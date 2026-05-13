import { Router } from "express";
import { obtenerPisosPublicos } from "../controllers/pisosPublico.controller.js";

const router = Router();

// Sin auth: lo consume la home pública
router.get("/", obtenerPisosPublicos);

export default router;
