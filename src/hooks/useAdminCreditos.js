import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const adminCreditosKeys = {
  todo: ["admin", "creditos"],
  paquetes: ["admin", "creditos", "paquetes"],
  usuario: (id) => ["admin", "creditos", "usuario", id],
};

/** Conserva status y código para distinguir el 409 de saldo negativo. */
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ApiError(data?.message || "Error al comunicarse con el servidor", res.status, data);
  }
  return data;
}

export function usePaquetesAdmin(token) {
  return useQuery({
    queryKey: adminCreditosKeys.paquetes,
    queryFn: () => pedir(`${API_URL}/api/admin/creditos/paquetes`, { token }),
    enabled: Boolean(token),
  });
}

export function useCrearPaquete(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/admin/creditos/paquetes`, {
        token,
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCreditosKeys.paquetes }),
  });
}

export function useActualizarPaquete(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      pedir(`${API_URL}/api/admin/creditos/paquetes/${id}`, {
        token,
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCreditosKeys.paquetes }),
  });
}

export function useEliminarPaquete(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      pedir(`${API_URL}/api/admin/creditos/paquetes/${id}`, { token, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCreditosKeys.paquetes }),
  });
}

export function useCreditosDeUsuario(token, id) {
  return useQuery({
    queryKey: adminCreditosKeys.usuario(id),
    queryFn: () => pedir(`${API_URL}/api/admin/creditos/usuarios/${id}`, { token }),
    enabled: Boolean(token && id),
    retry: false,
  });
}

export function useAjustarCreditos(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cantidad, motivo, permitirNegativo }) =>
      pedir(`${API_URL}/api/admin/creditos/usuarios/${id}/ajuste`, {
        token,
        method: "POST",
        body: JSON.stringify({ cantidad, motivo, permitirNegativo: Boolean(permitirNegativo) }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: adminCreditosKeys.usuario(variables.id) });
    },
  });
}
