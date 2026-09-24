/**
 * Render entrega los hosts de sus servicios sin esquema ("bowe-app.onrender.com")
 * porque su `fromService` no sabe agregarlo. Ese valor sirve como hostname pero
 * no como URL: concatenarlo produce enlaces rotos en los mails y URLs de retorno
 * invalidas para Mercado Pago, y el navegador nunca lo acepta como origen CORS.
 *
 * Se normaliza una sola vez al arrancar, para que el resto del codigo lea
 * siempre una URL completa sin tener que acordarse de este detalle.
 */

/** Antepone el esquema si falta y quita la barra final. */
export function normalizarUrl(valor) {
  const limpio = String(valor ?? "").trim();
  if (!limpio) return "";

  // localhost sigue siendo http: forzar https romperia el desarrollo local.
  const esLocal = /^(localhost|127\.0\.0\.1)(:|\/|$)/.test(limpio);
  const conEsquema = /^https?:\/\//i.test(limpio)
    ? limpio
    : `${esLocal ? "http" : "https"}://${limpio}`;

  return conEsquema.replace(/\/+$/, "");
}

/** Normaliza una lista separada por comas (CORS admite varios origenes). */
export function normalizarListaUrls(valor) {
  return String(valor ?? "")
    .split(",")
    .map((v) => normalizarUrl(v))
    .filter(Boolean);
}

/**
 * Reescribe en process.env las variables que son URLs, para que los modulos
 * que las leen directo reciban ya el valor corregido.
 */
export function normalizarUrlsDeEntorno(env = process.env) {
  for (const clave of ["FRONTEND_URL", "PUBLIC_APP_URL", "BACKEND_URL"]) {
    const valor = env[clave]?.trim();
    if (valor) env[clave] = normalizarUrl(valor);
  }

  if (env.CORS_ORIGINS?.trim()) {
    env.CORS_ORIGINS = normalizarListaUrls(env.CORS_ORIGINS).join(",");
  }
}
