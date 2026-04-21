/**
 * Misma regla de negocio que el backend para excluir oficina / escritorios del flujo por hora.
 * @param {Record<string, unknown>} r
 * @param {Record<string, unknown>[]} allRecursos
 */
export function recursoExcluidoFlujoTurnoHora(r, allRecursos) {
  if (!r) return true;
  if (r.esCompleto && String(r.Nombre || "").toLowerCase().includes("oficina")) return true;
  const n = String(r.Nombre || "").toLowerCase();
  const parent = allRecursos.find((p) => p.idRecurso === r.idRecursoPadre);
  const pn = parent ? String(parent.Nombre || "").toLowerCase() : "";
  if (n.includes("escritorio")) return true;
  if (r.idRecursoPadre != null && pn.includes("oficina")) return true;
  return false;
}
