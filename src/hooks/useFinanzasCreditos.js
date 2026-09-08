import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "../utils/adminApi.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const finanzasKeys = {
  todo: ["finanzas", "creditos"],
  resumen: ["finanzas", "creditos", "resumen"],
  ingresosPorDia: (dias) => ["finanzas", "creditos", "ingresos-por-dia", dias],
  compras: (filtros) => ["finanzas", "creditos", "compras", filtros ?? {}],
};

async function pedir(url, init = {}) {
  const res = await adminFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) throw new Error(data?.message || "Error al comunicarse con el servidor");
  return data;
}

/**
 * Resumen del panel. El backend decide si incluye los montos: si el usuario no
 * es propietario llegan sin `totalIngresos` y con `puedeVerMontos: false`.
 */
export function useResumenFinanciero() {
  return useQuery({
    queryKey: finanzasKeys.resumen,
    queryFn: () => pedir(`${API_URL}/api/finanzas/creditos/resumen`),
  });
}

/** Serie del gráfico. Solo propietarios: para el resto el backend devuelve 403. */
export function useIngresosPorDia(dias = 30, { enabled = true } = {}) {
  return useQuery({
    queryKey: finanzasKeys.ingresosPorDia(dias),
    queryFn: () => pedir(`${API_URL}/api/finanzas/creditos/ingresos-por-dia?dias=${dias}`),
    enabled,
    retry: false,
  });
}

export function useComprasCreditos({ limit = 10, offset = 0, estado, desde, hasta, q } = {}) {
  const filtros = { limit, offset, estado, desde, hasta, q };
  return useQuery({
    queryKey: finanzasKeys.compras(filtros),
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (estado) params.set("estado", estado);
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (q) params.set("q", q);
      return pedir(`${API_URL}/api/finanzas/creditos/compras?${params}`);
    },
    placeholderData: (previa) => previa,
  });
}

/** Toda escritura mueve montos y saldo: se refresca el panel entero. */
function useInvalidarFinanzas() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: finanzasKeys.todo });
    qc.invalidateQueries({ queryKey: ["creditos"] });
  };
}

/** Venta de un paquete cobrada en mostrador. */
export function useRegistrarCompraPresencial() {
  const invalidar = useInvalidarFinanzas();
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/finanzas/creditos/compras/presencial`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidar,
  });
}

/** Revierte un cobro presencial: anula la compra y descuenta los créditos. */
export function useAnularCompra() {
  const invalidar = useInvalidarFinanzas();
  return useMutation({
    mutationFn: (id) =>
      pedir(`${API_URL}/api/finanzas/creditos/compras/${id}`, { method: "DELETE" }),
    onSuccess: invalidar,
  });
}

/** Buscador de clientes para la venta en mostrador. */
export function useBuscarClientes(q) {
  const termino = (q ?? "").trim();
  return useQuery({
    queryKey: ["finanzas", "creditos", "clientes", termino],
    queryFn: () =>
      pedir(`${API_URL}/api/finanzas/creditos/clientes?q=${encodeURIComponent(termino)}`),
    enabled: termino.length >= 2,
    staleTime: 60 * 1000,
  });
}
