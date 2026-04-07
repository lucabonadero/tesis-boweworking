/**
 * Sesión del panel (empleados/admin). El token JWT expira en el servidor (~8h);
 * si queda guardado en localStorage pero ya venció, hay que volver a iniciar sesión.
 */
const TOKEN_KEY = "token";
const USUARIO_KEY = "usuario";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** true si hay token y el JWT no está vencido (campo exp). */
export function isAdminTokenValid() {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 <= Date.now() + 5000) return false;
    return true;
  } catch {
    return false;
  }
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
}

export function redirectToAdminLogin() {
  clearAdminSession();
  window.location.assign("/login");
}

/**
 * fetch para APIs del panel: agrega Authorization y ante 401 limpia sesión y va a /login.
 */
export async function adminFetch(input, init = {}) {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    redirectToAdminLogin();
    throw new Error("Sesión expirada o no autorizada");
  }
  return res;
}
