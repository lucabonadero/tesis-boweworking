import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const disponibilidadKeys = {
  all: ["disponibilidad"],
  recurso: (id) => ["disponibilidad", "recurso", id],
  bloqueos: (id) => ["disponibilidad", "bloqueos", id ?? "todos"],
  slots: (id, fecha) => ["disponibilidad", "slots", id, fecha],
};

/** Conserva el código del backend para distinguir bloqueo de fuera-de-horario. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data ?? {};
    this.codigo = data?.codigo;
  }
}

async function pedir(url, { token, ...init } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ApiError(data?.message || "Error al comunicarse con el servidor", res.status, data);
  }
  return data;
}

export function useBloqueos(idRecurso, token) {
  return useQuery({
    queryKey: disponibilidadKeys.bloqueos(idRecurso),
    queryFn: () =>
      pedir(`${API_URL}/api/disponibilidad/bloqueos${idRecurso ? `?idRecurso=${idRecurso}` : ""}`, { token }),
  });
}

export function useCrearBloqueo(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/disponibilidad/bloqueos`, { token, method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

export function useActualizarBloqueo(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      pedir(`${API_URL}/api/disponibilidad/bloqueos/${id}`, { token, method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

export function useEliminarBloqueo(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => pedir(`${API_URL}/api/disponibilidad/bloqueos/${id}`, { token, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

export function useDisponibilidadRecurso(idRecurso, token) {
  return useQuery({
    queryKey: disponibilidadKeys.recurso(idRecurso),
    queryFn: () => pedir(`${API_URL}/api/disponibilidad/recurso/${idRecurso}`, { token }),
    enabled: Boolean(idRecurso),
  });
}

export function useGuardarDisponibilidad(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idRecurso, franjas }) =>
      pedir(`${API_URL}/api/disponibilidad/recurso/${idRecurso}`, {
        token,
        method: "PUT",
        body: JSON.stringify({ franjas }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

/** Lo consume el flujo de reserva del usuario para apagar horarios no disponibles. */
export function useSlots(idRecurso, fecha) {
  return useQuery({
    queryKey: disponibilidadKeys.slots(idRecurso, fecha),
    queryFn: () => pedir(`${API_URL}/api/disponibilidad/slots?idRecurso=${idRecurso}&fecha=${fecha}`),
    enabled: Boolean(idRecurso && fecha),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
