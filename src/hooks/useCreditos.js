import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Agrupadas bajo "creditos" para poder invalidar todo el árbol por prefijo. */
export const creditosKeys = {
  todo: ["creditos"],
  saldo: ["creditos", "saldo"],
  movimientos: (paginacion) => ["creditos", "movimientos", paginacion ?? {}],
  movimientosTodos: ["creditos", "movimientos"],
  paquetes: ["creditos", "paquetes"],
};

/** Conserva status y código para distinguir el 409 de saldo insuficiente. */
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

/** RF10 */
export function useSaldoCreditos(token) {
  return useQuery({
    queryKey: creditosKeys.saldo,
    queryFn: () => pedir(`${API_URL}/api/creditos/saldo`, { token }),
    enabled: Boolean(token),
  });
}

/** RF06 */
export function useMovimientosCreditos(token, { limit = 10, offset = 0 } = {}) {
  return useQuery({
    queryKey: creditosKeys.movimientos({ limit, offset }),
    queryFn: () =>
      pedir(`${API_URL}/api/creditos/movimientos?limit=${limit}&offset=${offset}`, { token }),
    enabled: Boolean(token),
    placeholderData: (previa) => previa,
  });
}

export function usePaquetesCreditos(token) {
  return useQuery({
    queryKey: creditosKeys.paquetes,
    queryFn: () => pedir(`${API_URL}/api/creditos/paquetes`, { token }),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
}

/** Costo en créditos de la selección actual, antes de reservar. */
export function useCotizarReserva(token) {
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/creditos/cotizar`, {
        token,
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** Devuelve la preferencia de Mercado Pago para redirigir al checkout. */
export function useComprarCreditos(token) {
  return useMutation({
    mutationFn: ({ paqueteId }) =>
      pedir(`${API_URL}/api/creditos/comprar`, {
        token,
        method: "POST",
        body: JSON.stringify({ paqueteId }),
      }),
  });
}

/** Lo usa cualquier acción ajena a este archivo que mueva el saldo. */
export function useInvalidarCreditos() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: creditosKeys.todo });
  }, [qc]);
}
