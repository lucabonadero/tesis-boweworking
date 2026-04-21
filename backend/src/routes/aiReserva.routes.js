import { Router } from "express";
import { sugerirReservaIA } from "../controllers/aiReserva.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/sugerir-reserva", verificarToken, sugerirReservaIA);

export default router;
