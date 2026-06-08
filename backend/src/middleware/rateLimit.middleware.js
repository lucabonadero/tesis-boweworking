import rateLimit from "express-rate-limit";

const ventanaAutenticacionMs = 15 * 60 * 1000;

function numeroEnv(nombre, valorPorDefecto) {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor > 0 ? valor : valorPorDefecto;
}

export const loginLimiter = rateLimit({
  windowMs: ventanaAutenticacionMs,
  max: numeroEnv("RATE_LIMIT_LOGIN_MAX", 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos de inicio de sesión. Probá más tarde." },
});

export const clienteRegistroLimiter = rateLimit({
  windowMs: ventanaAutenticacionMs,
  max: numeroEnv("RATE_LIMIT_REGISTRO_MAX", 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados registros desde esta IP. Probá más tarde." },
});

export const passwordForgotLimiter = rateLimit({
  windowMs: ventanaAutenticacionMs,
  max: numeroEnv("RATE_LIMIT_PASSWORD_FORGOT_MAX", 8),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Probá más tarde." },
});

export const googleAuthLimiter = rateLimit({
  windowMs: ventanaAutenticacionMs,
  max: numeroEnv("RATE_LIMIT_GOOGLE_AUTH_MAX", 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos con Google. Probá más tarde." },
});

export const staffRegistroLimiter = rateLimit({
  windowMs: ventanaAutenticacionMs,
  max: numeroEnv("RATE_LIMIT_STAFF_REGISTRO_MAX", 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas altas de usuario. Probá más tarde." },
});

export const mercadoPagoWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numeroEnv("RATE_LIMIT_MP_WEBHOOK_MAX", 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas notificaciones en poco tiempo." },
});
