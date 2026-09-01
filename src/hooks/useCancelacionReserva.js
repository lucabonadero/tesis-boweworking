import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { creditosKeys } from "./useCreditos.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function leer(res) {
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const err = new Error(data?.message || "Error al comunicarse con el servidor");
    err.status = res.status;
    err.codigo = data?.codigo;
    err.data = data ?? {};
    throw err;
  }
  return data;
}

/**
 * Cancelación de reservas con reintegro (RF11 - RF15).
 *
 * `preview` se pide al abrir el modal para mostrar el reintegro antes de
 * confirmar; el backend vuelve a calcularlo al ejecutar, así que un cambio de
 * franja mientras el modal está abierto no altera lo que se acredita.
 */
export function useCancelacionReserva(authFetch, { onCancelada } = {}) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [reserva, setReserva] = useState(null);

  const abrir = useCallback(
    async (filaReserva) => {
      setReserva(filaReserva);
      setPreview(null);
      setCargandoPreview(true);
      try {
        const res = await authFetch(
          `${API_URL}/api/reservas/${filaReserva.idReserva}/cancelacion-preview`
        );
        setPreview(await leer(res));
      } catch (err) {
        setPreview({ puedeCancelar: false, mensaje: err.message, creditosAReintegrar: 0 });
      } finally {
        setCargandoPreview(false);
      }
    },
    [authFetch]
  );

  const cerrar = useCallback(() => {
    setReserva(null);
    setPreview(null);
  }, []);

  const mutacion = useMutation({
    mutationFn: async (idReserva) => {
      const res = await authFetch(`${API_URL}/api/reservas/${idReserva}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return leer(res);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: creditosKeys.todo });
      cerrar();
      onCancelada?.(data);
    },
  });

  return {
    reserva,
    preview,
    cargandoPreview,
    abrir,
    cerrar,
    confirmar: () => mutacion.mutate(reserva.idReserva),
    cancelando: mutacion.isPending,
    error: mutacion.error,
  };
}
