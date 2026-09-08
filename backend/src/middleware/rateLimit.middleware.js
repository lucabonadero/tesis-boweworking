import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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

/**
 * El asistente paga una llamada al proveedor de IA por request y arma la
 * ventana de disponibilidad contra la base: es el endpoint más caro de abusar.
 * Se limita por cuenta, no por IP, porque exige token.
 */
export const asistenteIaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numeroEnv("RATE_LIMIT_IA_MAX", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.usuario?.id ? `u:${req.usuario.id}` : ipKeyGenerator(req)),
  message: { message: "Estás consultando al asistente muy seguido. Esperá un momento." },
});

/** Cada compra crea una fila y una preferencia en Mercado Pago. */
export const compraCreditosLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numeroEnv("RATE_LIMIT_COMPRA_MAX", 12),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.usuario?.id ? `u:${req.usuario.id}` : ipKeyGenerator(req)),
  message: { message: "Demasiados intentos de compra seguidos. Esperá un momento." },
});

/** Escrituras de reservas: acotan el abuso sin molestar al uso normal. */
export const reservaEscrituraLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numeroEnv("RATE_LIMIT_RESERVA_MAX", 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.usuario?.id ? `u:${req.usuario.id}` : ipKeyGenerator(req)),
  message: { message: "Demasiadas operaciones de reserva seguidas. Esperá un momento." },
});

export const mercadoPagoWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: numeroEnv("RATE_LIMIT_MP_WEBHOOK_MAX", 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas notificaciones en poco tiempo." },
});
