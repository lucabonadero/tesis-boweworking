/** Evento global para refrescar vistas admin que no comparten el mismo estado (dashboard, altas, etc.). */
export const BOWE_RESERVAS_CHANGED = "bowe:reservas-changed";

export function notifyReservasChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BOWE_RESERVAS_CHANGED, { detail: { at: Date.now() } }));
}
