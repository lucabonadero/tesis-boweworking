// Misma regla de negocio que el backend para excluir oficina / escritorios del flujo por hora.
export function recursoExcluidoFlujoTurnoHora(r, todosRecursos) {
  if (!r) return true;
  if (r.esCompleto && String(r.Nombre || "").toLowerCase().includes("oficina")) return true;
  const n = String(r.Nombre || "").toLowerCase();
  const padre = todosRecursos.find((p) => p.idRecurso === r.idRecursoPadre);
  const pn = padre ? String(padre.Nombre || "").toLowerCase() : "";
  if (n.includes("escritorio")) return true;
  if (r.idRecursoPadre != null && pn.includes("oficina")) return true;
  return false;
}
