import { Router } from "express";
import {
  registro,
  login,
  googleAuth,
  me,
  completarPerfil,
  actualizarPerfil,
  solicitarRecuperacionPassword,
  validarTokenRecuperacion,
  restablecerPassword,
  cambiarPassword,
  solicitarRolEstudiante,
  obtenerEstadoEstudiante,
} from "../controllers/clienteAuth.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  clienteRegistroLimiter,
  loginLimiter,
  googleAuthLimiter,
  passwordForgotLimiter,
} from "../middleware/rateLimit.middleware.js";
import {
  clienteRegistroSchema,
  clienteLoginSchema,
  clienteGoogleSchema,
  clienteActualizarPerfilSchema,
  clienteCompletarPerfilSchema,
  clienteSolicitarRecuperacionSchema,
  clienteValidarTokenRecuperacionQuerySchema,
  clienteRestablecerPasswordSchema,
  clienteCambiarPasswordSchema,
  clienteSolicitarEstudianteSchema,
} from "../schemas/validation.schemas.js";

const router = Router();

router.post("/registro", clienteRegistroLimiter, validateBody(clienteRegistroSchema), registro);
router.post("/login", loginLimiter, validateBody(clienteLoginSchema), login);
router.post("/google", googleAuthLimiter, validateBody(clienteGoogleSchema), googleAuth);
router.post(
  "/recuperacion/solicitar",
  passwordForgotLimiter,
  validateBody(clienteSolicitarRecuperacionSchema),
  solicitarRecuperacionPassword
);
router.get(
  "/recuperacion/validar",
  passwordForgotLimiter,
  validateQuery(clienteValidarTokenRecuperacionQuerySchema),
  validarTokenRecuperacion
);
router.post(
  "/recuperacion/restablecer",
  passwordForgotLimiter,
  validateBody(clienteRestablecerPasswordSchema),
  restablecerPassword
);
router.get("/me", verificarToken, me);
router.put("/perfil", verificarToken, validateBody(clienteActualizarPerfilSchema), actualizarPerfil);
router.put(
  "/completar-perfil",
  verificarToken,
  validateBody(clienteCompletarPerfilSchema),
  completarPerfil
);
router.put(
  "/cambiar-contrasena",
  verificarToken,
  validateBody(clienteCambiarPasswordSchema),
  cambiarPassword
);

// RF04: solicitud de cambio al rol Estudiante y consulta de su estado.
router.post(
  "/solicitar-estudiante",
  verificarToken,
  validateBody(clienteSolicitarEstudianteSchema),
  solicitarRolEstudiante
);
router.get("/estado-estudiante", verificarToken, obtenerEstadoEstudiante);

export default router;
