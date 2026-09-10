// Sugerencias sin LLM: usa solo datos reales del snapshot (catálogo + slots).
// Sirve para desarrollo / tesis sin gastar en APIs de pago.
export function sugerirHeuristico(snapshot, mensaje) {
  const numMatch = mensaje.match(/(\d+)\s*(personas?|gente|persona|people)?/i);
  let capacidadMinima = 1;
  if (numMatch) capacidadMinima = Math.max(1, parseInt(numMatch[1], 10));

  const quiereReunion =
    /reuni|equipo|meeting|presentaci|grupo|juntada|videollamada|llamada/i.test(mensaje);

  const catalogoPorId = Object.fromEntries(snapshot.catalogo.map((c) => [c.idRecurso, c]));

  const puntuarRecurso = (idRecurso) => {
    const c = catalogoPorId[idRecurso];
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
    if (cap >= capacidadMinima) s += Math.min(cap, 25);
    else s -= 80;
    return s;
  };

  const sugerencias = [];
  for (const slot of snapshot.slots) {
    const ordenados = [...slot.idsDisponibles]
      .map((id) => ({ id, puntaje: puntuarRecurso(id) }))
      .filter((x) => x.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje);
    if (ordenados.length === 0) continue;
    const mejor = ordenados[0];
    const c = catalogoPorId[mejor.id];
    sugerencias.push({
      idRecurso: mejor.id,
      fecha: slot.fecha,
      horaInicio: slot.horaInicio,
      horaFin: slot.horaFin,
      motivo: quiereReunion
        ? "Prioricé un espacio tipo sala/reunión con capacidad suficiente, según datos del sistema."
        : "Opción disponible alineada con puestos/zonas abiertas, según datos del sistema.",
      etiquetaRecurso: c?.nombre || String(mejor.id),
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
