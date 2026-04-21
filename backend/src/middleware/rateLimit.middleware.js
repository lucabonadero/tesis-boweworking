import rateLimit from "express-rate-limit";

const windowAuthMs = 15 * 60 * 1000;

function numEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Login (staff legado y unificado cliente). */
export const loginLimiter = rateLimit({
  windowMs: windowAuthMs,
  max: numEnv("RATE_LIMIT_LOGIN_MAX", 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos de inicio de sesión. Probá más tarde." },
});

/** Registro de cliente. */
export const clienteRegistroLimiter = rateLimit({
  windowMs: windowAuthMs,
  max: numEnv("RATE_LIMIT_REGISTRO_MAX", 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados registros desde esta IP. Probá más tarde." },
});

/** Solicitud / uso de enlace de recuperación de contraseña (evita spam y fuerza bruta). */
export const passwordForgotLimiter = rateLimit({
  windowMs: windowAuthMs,
  max: numEnv("RATE_LIMIT_PASSWORD_FORGOT_MAX", 8),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Probá más tarde." },
});

/** Google Sign-In (cliente). */
export const googleAuthLimiter = rateLimit({
  windowMs: windowAuthMs,
  max: numEnv("RATE_LIMIT_GOOGLE_AUTH_MAX", 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos con Google. Probá más tarde." },
});

/** Alta de usuario staff (solo con token admin; igual limitamos abuso). */
export const staffRegistroLimiter = rateLimit({
  windowMs: windowAuthMs,
  max: numEnv("RATE_LIMIT_STAFF_REGISTRO_MAX", 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas altas de usuario. Probá más tarde." },
});

/**
 * Webhook Mercado Pago: límite alto para no cortar notificaciones legítimas,
 * pero evita floods evidentes.
 */
export const mercadoPagoWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numEnv("RATE_LIMIT_MP_WEBHOOK_MAX", 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas notificaciones en poco tiempo." },
});
