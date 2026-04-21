/**
 * Sugerencias sin LLM: solo datos reales de snapshot (catalogo + slots).
 * Útil para desarrollo / tesis sin gastar en APIs.
 */
export function sugerirHeuristico(snapshot, mensaje) {
  const m = mensaje.toLowerCase();
  const numMatch = mensaje.match(/(\d+)\s*(personas?|gente|persona|people)?/i);
  let minCap = 1;
  if (numMatch) minCap = Math.max(1, parseInt(numMatch[1], 10));

  const quiereReunion =
    /reuni|equipo|meeting|presentaci|grupo|juntada|videollamada|llamada/i.test(mensaje);

  const catalogById = Object.fromEntries(snapshot.catalogo.map((c) => [c.idRecurso, c]));

  const scoreRecurso = (idRecurso) => {
    const c = catalogById[idRecurso];
    if (!c) return -100;
    let s = 0;
    const n = `${c.nombre} ${c.descripcion}`.toLowerCase();
    if (quiereReunion) {
      if (n.includes("sala") || n.includes("conferenc")) s += 50;
      if (n.includes("completa") || c.esCompleto) s += 25;
    } else {
      if (
        n.includes("banco") ||
        n.includes("escritorio") ||
        n.includes("silla") ||
        n.includes("sillón") ||
        n.includes("sillon") ||
        n.includes("mesa")
      )
        s += 30;
      if (!c.esCompleto) s += 12;
    }
    const cap = c.capacidadEspacio ?? 0;
    if (cap >= minCap) s += Math.min(cap, 25);
    else s -= 80;
    return s;
  };

  const sugerencias = [];
  for (const slot of snapshot.slots) {
    const ranked = [...slot.idsDisponibles]
      .map((id) => ({ id, score: scoreRecurso(id) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) continue;
    const best = ranked[0];
    const c = catalogById[best.id];
    sugerencias.push({
      idRecurso: best.id,
      fecha: slot.fecha,
      horaInicio: slot.horaInicio,
      horaFin: slot.horaFin,
      motivo: quiereReunion
        ? "Prioricé un espacio tipo sala/reunión con capacidad suficiente, según datos del sistema."
        : "Opción disponible alineada con puestos/zonas abiertas, según datos del sistema.",
      etiquetaRecurso: c?.nombre || String(best.id),
    });
    if (sugerencias.length >= 3) break;
  }

  return {
    mensajeAmigable:
      sugerencias.length > 0
        ? "Modo prueba (sin API de IA de pago): estas opciones salen solo de tu base de datos y reglas simples."
        : "Modo prueba: no encontré combinaciones que cumplan capacidad y tipo con reglas simples. Probá otra redacción o revisá disponibilidad.",
    sugerencias,
    preguntaAclaratoria: null,
  };
}
