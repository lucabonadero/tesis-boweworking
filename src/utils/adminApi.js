const TOKEN_KEY = "clienteToken";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function rolEnToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 <= Date.now() + 5000) return null;
    return payload.rol || null;
  } catch {
    return null;
  }
}

/** Token del panel: admin o empleado (tabla usuarios), mismo JWT que AuthContext. */
export function isStaffTokenValid() {
  const token = getAdminToken();
  if (!token) return false;
  const rol = rolEnToken(token);
  return rol === "admin" || rol === "empleado";
}

/** @deprecated Usar isStaffTokenValid; el panel admite admin y empleado. */
export function isAdminTokenValid() {
  return isStaffTokenValid();
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function adminFetch(input, init = {}) {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearAdminSession();
    window.location.assign("/");
    throw new Error("Sesión expirada o no autorizada");
  }
  return res;
}
