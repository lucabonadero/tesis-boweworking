import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Claves de cache: agrupadas para invalidar por prefijo. */
export const usuariosKeys = {
  staff: ["admin", "usuarios", "staff"],
  permisos: ["admin", "usuarios", "permisos"],
  finales: (filtros) => ["admin", "usuarios", "finales", filtros ?? {}],
  finalesTodos: ["admin", "usuarios", "finales"],
  solicitudes: ["admin", "usuarios", "solicitudes-estudiante"],
};

/**
 * Error de API que conserva el status y el cuerpo de la respuesta.
 * Necesario para distinguir el 409 de email en uso y leer `rolActual`.
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data ?? {};
    this.codigo = data?.codigo;
  }
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function pedir(url, { token, ...init } = {}) {
  const res = await fetch(url, { ...init, headers: authHeaders(token) });

  // 204 y respuestas sin cuerpo no traen JSON.
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;

  if (!res.ok) {
    throw new ApiError(
      data?.message || "Error al comunicarse con el servidor",
      res.status,
      data
    );
  }
  return data;
}

// ── Staff del panel (tabla usuarios) ───────────────────────

export function useUsuariosStaff(token) {
  return useQuery({
    queryKey: usuariosKeys.staff,
    queryFn: () => pedir(`${API_URL}/api/admin/usuarios`, { token }),
    enabled: Boolean(token),
  });
}

export function usePermisosCatalogo(token) {
  return useQuery({
    queryKey: usuariosKeys.permisos,
    queryFn: () => pedir(`${API_URL}/api/admin/permisos`, { token }),
    enabled: Boolean(token),
    // El catalogo de permisos casi no cambia.
    staleTime: 10 * 60 * 1000,
  });
}

export function useCrearUsuarioStaff(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/admin/usuarios`, {
        token,
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.staff }),
  });
}

/**
 * Cambio de rol como operacion propia: el backend recalcula los permisos
 * en la misma transaccion.
 */
export function useCambiarRolStaff(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rol, permisos }) =>
      pedir(`${API_URL}/api/admin/usuarios/${id}/rol`, {
        token,
        method: "PUT",
        body: JSON.stringify({ rol, ...(permisos ? { permisos } : {}) }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.staff }),
  });
}

export function useActualizarPermisosStaff(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permisos }) =>
      pedir(`${API_URL}/api/admin/usuarios/${id}/permisos`, {
        token,
        method: "PUT",
        body: JSON.stringify({ permisos }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.staff }),
  });
}

export function useRestaurarPermisosStaff(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) =>
      pedir(`${API_URL}/api/admin/usuarios/${id}/restaurar-permisos`, {
        token,
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.staff }),
  });
}

export function useEliminarUsuarioStaff(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      pedir(`${API_URL}/api/admin/usuarios/${id}`, { token, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usuariosKeys.staff }),
  });
}

// ── Usuarios finales (tabla ClienteUsuario) ────────────────

export function useUsuariosFinales(token, filtros = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, v);
  });
  const qs = params.toString();

  return useQuery({
    queryKey: usuariosKeys.finales(filtros),
    queryFn: () =>
      pedir(`${API_URL}/api/admin/clientes-usuarios${qs ? `?${qs}` : ""}`, { token }),
    enabled: Boolean(token),
    // Mantiene la tabla visible mientras se recarga al cambiar de filtro.
    placeholderData: (previa) => previa,
  });
}

export function useSolicitudesEstudiante(token) {
  return useQuery({
    queryKey: usuariosKeys.solicitudes,
    queryFn: () =>
      pedir(`${API_URL}/api/admin/clientes-usuarios/solicitudes-estudiante`, { token }),
    enabled: Boolean(token),
  });
}

export function useCambiarEstadoCuenta(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accion, motivo }) =>
      pedir(`${API_URL}/api/admin/clientes-usuarios/${id}/estado`, {
        token,
        method: "PUT",
        body: JSON.stringify({ accion, ...(motivo ? { motivo } : {}) }),
      }),
    onSuccess: () => {
      // El bloqueo afecta al listado y tambien a las solicitudes pendientes.
      qc.invalidateQueries({ queryKey: usuariosKeys.finalesTodos });
      qc.invalidateQueries({ queryKey: usuariosKeys.solicitudes });
    },
  });
}

export function useResolverEstudiante(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, motivo }) =>
      pedir(`${API_URL}/api/admin/clientes-usuarios/${id}/verificacion-estudiante`, {
        token,
        method: "PUT",
        body: JSON.stringify({ decision, ...(motivo ? { motivo } : {}) }),
      }),
    onSuccess: () => {
      // Aprobar cambia el rol: se recarga el listado y la bandeja.
      qc.invalidateQueries({ queryKey: usuariosKeys.finalesTodos });
      qc.invalidateQueries({ queryKey: usuariosKeys.solicitudes });
    },
  });
}

/** Comprobante bajo demanda: no se precarga con el listado. */
export function useComprobanteEstudiante(token, id) {
  return useQuery({
    queryKey: ["admin", "usuarios", "comprobante", id],
    queryFn: () =>
      pedir(`${API_URL}/api/admin/clientes-usuarios/${id}/comprobante`, { token }),
    enabled: Boolean(token && id),
    retry: false,
  });
}
