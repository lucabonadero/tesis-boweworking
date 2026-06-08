import { armarVentanaDisponibilidad } from "../services/aiReservaSnapshot.service.js";
import { recursoDisponibleEnTurno } from "../services/disponibilidadTurno.service.js";
import { permiteReservaPorTurno } from "../services/reservaRules.service.js";
import { sugerirHeuristico } from "../services/asistenteHeuristico.service.js";

function chatCompletionsUrl() {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  return `${base}/chat/completions`;
}

function esBaseUrlLocal(base) {
  return /localhost|127\.0\.0\.1/i.test(base);
}

async function armarRespuestaValidada(parsed, snapshot) {
  const sugerenciasCrudas = Array.isArray(parsed.sugerencias) ? parsed.sugerencias : [];
  const sugerenciasValidadas = [];

  for (const s of sugerenciasCrudas.slice(0, 5)) {
    // Soporta idsRecursos (array) o idRecurso (singular, retrocompat)
    const ids =
      Array.isArray(s.idsRecursos) && s.idsRecursos.length > 0
        ? s.idsRecursos.map(Number)
        : s.idRecurso != null
        ? [Number(s.idRecurso)]
        : [];

    if (ids.length === 0) continue;

    const fecha = String(s.fecha || "").slice(0, 10);
    const horaInicio = String(s.horaInicio || "");
    const horaFin = String(s.horaFin || "");

    // Todos los recursos deben estar en el mismo slot
    const slot = snapshot.slots.find(
      (sl) =>
        sl.fecha === fecha &&
        sl.horaInicio === horaInicio &&
        sl.horaFin === horaFin &&
        ids.every((id) => slotContiene(sl, id))
    );
    if (!slot) continue;

    // Validar todos los recursos contra la BD
    const validaciones = await Promise.all(
      ids.map((id) => validarSugerenciaConDb({ idRecurso: id, fecha, horaInicio, horaFin }))
    );
    if (!validaciones.every(Boolean)) continue;

    const etiquetasIA = Array.isArray(s.etiquetasRecursos) ? s.etiquetasRecursos : [];
    const recursos = ids.map((id, i) => {
      const cat = snapshot.catalogo.find((c) => c.idRecurso === id);
      return {
        idRecurso: id,
        etiqueta: etiquetasIA[i] || cat?.nombre || String(id),
        espacioNombre: cat?.espacioNombre || "",
        precioHora: cat?.precioHora ?? null,
      };
    });

    const precioTotal =
      recursos.every((r) => r.precioHora != null)
        ? recursos.reduce((acc, r) => acc + r.precioHora, 0)
        : null;

    sugerenciasValidadas.push({
      idsRecursos: ids,
      etiquetasRecursos: recursos.map((r) => r.etiqueta),
      etiquetaRecurso: recursos.map((r) => r.etiqueta).join(", "),
      fecha,
      horaInicio,
      horaFin,
      motivo: s.motivo || "",
      espacioNombre: recursos[0]?.espacioNombre || "",
      precioHora: precioTotal,
    });

    if (sugerenciasValidadas.length >= 3) break;
  }

  return {
    mensajeAmigable: parsed.mensajeAmigable || "Estas son opciones que encajan con tu pedido.",
    preguntaAclaratoria: parsed.preguntaAclaratoria ?? null,
    sugerenciasValidadas,
    descartadasPorValidacion: sugerenciasCrudas.length - sugerenciasValidadas.length,
    meta: snapshot.meta,
  };
}

// Prompt de sistema: la IA solo elige entre los datos provistos; no inventa ids ni horarios.
export const PROMPT_SISTEMA_ASISTENTE_RESERVAS = `Sos el asistente de reservas de un coworking. Interpretá el pedido del usuario en español y proponé hasta 3 opciones usando SOLO los datos de "slotsDisponibles".

Reglas estrictas:
- Cada sugerencia DEBE usar un idRecurso que exista dentro del array "recursosDisponibles" del slot elegido. NO podés usar un idRecurso de otro slot.
- NO inventes fechas, horarios ni idRecurso.
- Si el pedido menciona cantidad de personas, usá solo recursos cuya "capacidad" sea >= esa cantidad.
- Para reuniones, equipos o grupos: preferí recursos con nombre/descripción tipo sala, conferencia, completo.
- Para trabajo individual o concentración: preferí puestos, escritorios, bancos, zonas abiertas.
- Interpretá expresiones temporales en español ("mañana", "esta semana", "a la tarde", "el viernes", "por la mañana") usando la fecha base en "meta.fechaInicioVentana". "A la tarde" = después de las 14:00; "por la mañana" = antes de las 13:00.
- IMPORTANTE: Si el usuario pide un tipo de espacio por característica ("aire libre", "silencioso", "con luz", "cómodo") y no encontrás esa palabra exacta en los nombres, buscá recursos que PODRÍAN cumplirla por su nombre o descripción (ej: "terraza" o "balcón" para "aire libre"; "sala privada" para "silencioso"). Siempre sugerí la opción más cercana disponible y explicá en el "motivo" por qué podría encajar. NUNCA digas que no hay opciones si hay slots disponibles para esa fecha y hora — siempre devolvé las mejores alternativas posibles.
- Si el usuario pide múltiples recursos del mismo tipo (ej: "3 bancos", "2 escritorios", "un banco para cada uno"), agrupálos en UNA SOLA sugerencia poniendo todos los idRecurso en el array "idsRecursos". Todos deben pertenecer al mismo slot (misma fecha y horario).
- Si el usuario pide un solo recurso, igual usá "idsRecursos" con un solo elemento.
- Máximo 3 sugerencias, ordenadas de mejor a peor opción.
- Respondé SIEMPRE con un único objeto JSON válido (sin markdown) con este esquema exacto:

{
  "mensajeAmigable": "string explicando las opciones o por qué no hay resultados",
  "sugerencias": [
    {
      "idsRecursos": [number, ...],
      "fecha": "YYYY-MM-DD",
      "horaInicio": "HH:MM",
      "horaFin": "HH:MM",
      "motivo": "por qué esta opción encaja con el pedido del usuario",
      "etiquetasRecursos": ["nombre del recurso 1", "nombre del recurso 2"]
    }
  ],
  "preguntaAclaratoria": null
}

Si necesitás más info del usuario para decidir (por ejemplo no especificó cantidad de personas ni tipo de espacio), poné la pregunta en "preguntaAclaratoria" y dejá sugerencias vacías.`;

function extraerObjetoJson(text) {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Respuesta sin JSON");
  return JSON.parse(t.slice(start, end + 1));
}

function slotContiene(slot, idRecurso) {
  return slot.idsDisponibles.includes(idRecurso);
}

async function validarSugerenciaConDb(s) {
  if (!s?.idRecurso || !s?.fecha || !s?.horaInicio || !s?.horaFin) return false;
  if (!(await permiteReservaPorTurno(s.idRecurso))) return false;
  return recursoDisponibleEnTurno(s.idRecurso, s.fecha, s.horaInicio, s.horaFin);
}

export const sugerirReservaIA = async (req, res) => {
  try {
    const modo = (process.env.ASISTENTE_IA_MODO || "openai").trim().toLowerCase();
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model =
      process.env.OPENAI_MODEL ||
      (esBaseUrlLocal(baseUrl) ? "llama3.2" : "gpt-4o-mini");

    let apiKey = process.env.OPENAI_API_KEY?.trim();
    const usarHeuristica = modo === "heuristic" || modo === "heuristica" || modo === "sin_ia";
    if (!usarHeuristica && !apiKey && esBaseUrlLocal(baseUrl)) apiKey = "ollama";
    if (!usarHeuristica && !apiKey) {
      return res.status(503).json({
        message:
          "OPENAI_API_KEY no configurada. Para probar gratis: ASISTENTE_IA_MODO=heuristic en .env, o instalá Ollama y OPENAI_BASE_URL=http://127.0.0.1:11434/v1",
      });
    }

    const {
      mensaje,
      timezone,
      diasVentana,
      fechaBase,
    } = req.body || {};

    if (!mensaje || typeof mensaje !== "string" || mensaje.trim().length < 3) {
      return res.status(400).json({ message: "mensaje es obligatorio (texto del usuario)." });
    }

    const tz = timezone || process.env.APP_TIMEZONE || "America/Argentina/Buenos_Aires";
    const dias = Math.min(Math.max(Number(diasVentana) || 5, 1), 14);

    const snapshot = await armarVentanaDisponibilidad({
      timeZone: tz,
      dias,
      fechaBaseYmd: fechaBase || null,
    });

    if (snapshot.catalogo.length === 0) {
      return res.json({
        mensajeAmigable: "No hay recursos configurados para reserva por turno.",
        sugerenciasValidadas: [],
        meta: snapshot.meta,
      });
    }

    if (snapshot.slots.length === 0) {
      return res.json({
        mensajeAmigable:
          "En los próximos días no hay turnos libres en la ventana consultada. Probá otras fechas o contactá al coworking.",
        sugerenciasValidadas: [],
        catalogo: snapshot.catalogo,
        slots: snapshot.slots,
        meta: snapshot.meta,
      });
    }

    if (usarHeuristica) {
      const parsed = sugerirHeuristico(snapshot, mensaje.trim());
      const body = await armarRespuestaValidada(parsed, snapshot);
      return res.json({ ...body, origen: "heuristic" });
    }

    const catalogoPorId = Object.fromEntries(snapshot.catalogo.map((c) => [c.idRecurso, c]));

    const obtenerDiaSemana = (ymd, timeZone) => {
      const [y, m, d] = ymd.split("-").map(Number);
      return new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone }).format(
        new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      );
    };

    const slotsParaIA = snapshot.slots.map((slot) => ({
      fecha: slot.fecha,
      diaSemana: obtenerDiaSemana(slot.fecha, tz),
      horaInicio: slot.horaInicio,
      horaFin: slot.horaFin,
      recursosDisponibles: slot.idsDisponibles.map((id) => {
        const c = catalogoPorId[id];
        if (!c) return { idRecurso: id };
        return {
          idRecurso: id,
          nombre: c.nombre,
          ...(c.descripcion ? { descripcion: c.descripcion } : {}),
          ...(c.espacioNombre ? { espacioNombre: c.espacioNombre } : {}),
          capacidad: c.capacidadEspacio,
          precioHora: c.precioHora,
          esCompleto: c.esCompleto,
        };
      }),
    }));

    const payloadUsuario = JSON.stringify(
      {
        pedidoUsuario: mensaje.trim(),
        slotsDisponibles: slotsParaIA,
        meta: {
          ...snapshot.meta,
          hoyDiaSemana: obtenerDiaSemana(snapshot.meta.fechaInicioVentana, tz),
        },
      },
      null,
      0
    );

    const cuerpoPeticion = {
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: PROMPT_SISTEMA_ASISTENTE_RESERVAS },
        { role: "user", content: payloadUsuario },
      ],
    };
    if (!esBaseUrlLocal(baseUrl)) {
      cuerpoPeticion.response_format = { type: "json_object" };
    }

    const openaiRes = await fetch(chatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpoPeticion),
    });

    if (!openaiRes.ok) {
      const textoError = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, textoError);
      let openaiCode = null;
      try {
        const body = JSON.parse(textoError);
        openaiCode = body?.error?.code || body?.error?.type;
      } catch {
        /* cuerpo no JSON */
      }
      if (openaiCode === "insufficient_quota" || textoError.includes("insufficient_quota")) {
        return res.status(503).json({
          message:
            "OpenAI indica que no hay cuota o créditos disponibles para esta API key. Entrá a https://platform.openai.com/account/billing , verificá método de pago y límites de uso, o usá otra organización/cuenta.",
          code: "openai_insufficient_quota",
        });
      }
      return res.status(502).json({ message: "Error al consultar el proveedor de IA", detalle: textoError.slice(0, 500) });
    }

    const openaiData = await openaiRes.json();
    const content = openaiData?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ message: "Respuesta vacía del proveedor de IA" });
    }

    let parsed;
    try {
      parsed = extraerObjetoJson(content);
    } catch (e) {
      console.error("JSON IA:", content, e);
      return res.status(502).json({ message: "No se pudo interpretar la respuesta de la IA" });
    }

    const body = await armarRespuestaValidada(parsed, snapshot);
    return res.json({ ...body, origen: "llm" });
  } catch (error) {
    console.error("sugerirReservaIA:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
