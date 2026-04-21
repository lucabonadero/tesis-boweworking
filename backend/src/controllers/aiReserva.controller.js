import { buildVentanaDisponibilidad } from "../services/aiReservaSnapshot.service.js";
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
  const rawSugerencias = Array.isArray(parsed.sugerencias) ? parsed.sugerencias : [];
  const sugerenciasValidadas = [];

  for (const s of rawSugerencias.slice(0, 5)) {
    const idRecurso = Number(s.idRecurso);
    const fecha = String(s.fecha || "").slice(0, 10);
    const horaInicio = String(s.horaInicio || "");
    const horaFin = String(s.horaFin || "");

    const slot = snapshot.slots.find(
      (sl) =>
        sl.fecha === fecha &&
        sl.horaInicio === horaInicio &&
        sl.horaFin === horaFin &&
        slotContains(sl, idRecurso)
    );

    if (!slot) continue;

    const okDb = await validarSugerenciaConDb({ idRecurso, fecha, horaInicio, horaFin });
    if (!okDb) continue;

    const cat = snapshot.catalogo.find((c) => c.idRecurso === idRecurso);
    sugerenciasValidadas.push({
      idRecurso,
      fecha,
      horaInicio,
      horaFin,
      motivo: s.motivo || "",
      etiquetaRecurso: s.etiquetaRecurso || cat?.nombre || String(idRecurso),
      espacioNombre: cat?.espacioNombre || "",
      precioHora: cat?.precioHora ?? null,
    });

    if (sugerenciasValidadas.length >= 3) break;
  }

  return {
    mensajeAmigable: parsed.mensajeAmigable || "Estas son opciones que encajan con tu pedido.",
    preguntaAclaratoria: parsed.preguntaAclaratoria ?? null,
    sugerenciasValidadas,
    descartadasPorValidacion: rawSugerencias.length - sugerenciasValidadas.length,
    meta: snapshot.meta,
  };
}

/**
 * Prompt de sistema: la IA solo elige entre datos provistos; no inventa ids ni horarios.
 * (Copiá este texto para documentación o ajustes en el panel del proveedor.)
 */
export const PROMPT_SISTEMA_ASISTENTE_RESERVAS = `Sos el asistente de reservas de un coworking. Tu trabajo es interpretar el pedido del usuario en español y proponer opciones de reserva SOLO usando el JSON que recibís en el mensaje del usuario.

Reglas estrictas:
- NO inventes idRecurso, fechas u horarios. Cada sugerencia DEBE usar exactamente un idRecurso que aparezca en "catalogo" y ese id DEBE estar en idsDisponibles del mismo slot (fecha + horaInicio + horaFin).
- Si el pedido no encaja con ningún slot o recurso (capacidad, tipo de espacio), devolvé sugerencias vacías y explicá qué falta en "preguntaAclaratoria" o en "mensajeAmigable".
- La capacidad por recurso es la del espacio ("capacidadEspacio"). Si piden más personas que la capacidad de todos los recursos disponibles, no fuerces una opción: sugerencias vacías y mensaje claro.
- Preferí recursos adecuados para reuniones (nombres/descripciones tipo sala, conferencias, completo) cuando el usuario pide reunión o equipo; para trabajo individual, puestos o zonas abiertas si encajan.
- Respondé SIEMPRE con un único objeto JSON válido (sin markdown) con las claves exactas del esquema indicado al final.
- Máximo 3 sugerencias, ordenadas de mejor a peor opción.

Esquema de salida:
{
  "mensajeAmigable": "string",
  "sugerencias": [
    {
      "idRecurso": number,
      "fecha": "YYYY-MM-DD",
      "horaInicio": "HH:MM",
      "horaFin": "HH:MM",
      "motivo": "string breve por qué conviene",
      "etiquetaRecurso": "nombre legible del recurso tal como en catalogo"
    }
  ],
  "preguntaAclaratoria": null
}

Si necesitás más datos del usuario, usá "preguntaAclaratoria" como string; si no, null.`;

function extractJsonObject(text) {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Respuesta sin JSON");
  return JSON.parse(t.slice(start, end + 1));
}

function slotContains(slot, idRecurso) {
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

    const snapshot = await buildVentanaDisponibilidad({
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

    const payloadUsuario = JSON.stringify(
      {
        instruccion:
          "Elegí hasta 3 opciones que cumplan el pedido. Solo ids y horarios que existan en slots y catalogo.",
        pedidoUsuario: mensaje.trim(),
        catalogo: snapshot.catalogo,
        slots: snapshot.slots,
        meta: snapshot.meta,
      },
      null,
      0
    );

    const requestBody = {
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: PROMPT_SISTEMA_ASISTENTE_RESERVAS },
        { role: "user", content: payloadUsuario },
      ],
    };
    if (!esBaseUrlLocal(baseUrl)) {
      requestBody.response_format = { type: "json_object" };
    }

    const openaiRes = await fetch(chatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      let openaiCode = null;
      try {
        const body = JSON.parse(errText);
        openaiCode = body?.error?.code || body?.error?.type;
      } catch {
        /* cuerpo no JSON */
      }
      if (openaiCode === "insufficient_quota" || errText.includes("insufficient_quota")) {
        return res.status(503).json({
          message:
            "OpenAI indica que no hay cuota o créditos disponibles para esta API key. Entrá a https://platform.openai.com/account/billing , verificá método de pago y límites de uso, o usá otra organización/cuenta.",
          code: "openai_insufficient_quota",
        });
      }
      return res.status(502).json({ message: "Error al consultar el proveedor de IA", detalle: errText.slice(0, 500) });
    }

    const openaiData = await openaiRes.json();
    const content = openaiData?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ message: "Respuesta vacía del proveedor de IA" });
    }

    let parsed;
    try {
      parsed = extractJsonObject(content);
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
