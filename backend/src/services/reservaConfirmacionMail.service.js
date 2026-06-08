import { sendMail, smtpConfigured } from "./mailer.service.js";
import { serializarHorariosReservaEnFilas } from "./horarioReserva.service.js";

function escaparHtml(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatearFecha(d) {
  if (!d) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: process.env.APP_TIMEZONE || "America/Argentina/Buenos_Aires",
  });
}

function duracionTurno(horaIni, horaFin) {
  if (!horaIni || !horaFin) return "—";
  const parse = (h) => {
    const [hh, mm = "0"] = String(h).trim().split(":");
    return parseInt(hh, 10) * 60 + parseInt(mm, 10);
  };
  const mins = parse(horaFin) - parse(horaIni);
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function etiquetaTipoReserva(tipo) {
  switch (tipo) {
    case "semanal":
      return "Pack semanal";
    case "mensual":
      return "Pack mensual";
    default:
      return "Por turno";
  }
}

function duracionPorTipo(tipo, horaIni, horaFin) {
  if (tipo === "semanal") return "7 días";
  if (tipo === "mensual") return "30 días";
  return duracionTurno(horaIni, horaFin);
}

function horarioTexto(row) {
  const tipo = row.TipoReserva || "turno";
  if (tipo === "turno" && row.HorarioReserva && row.HorarioFin) {
    return `${row.HorarioReserva} – ${row.HorarioFin}`;
  }
  if (tipo !== "turno") return "Todo el día (pack)";
  return "—";
}

function metodoPagoLegible(metodo, tipoPago) {
  if (!metodo) return "Sin registrar";
  const m = String(metodo).toLowerCase();
  if (m === "mercadopago") return "Mercado Pago";
  const base = escaparHtml(metodo);
  if (tipoPago === "online") return `${base} (online)`;
  if (tipoPago === "presencial") return `${base} (en local)`;
  return base;
}

function estadoPagoLegible(estado) {
  if (!estado) return { texto: "Pendiente", color: "#e67e22" };
  const e = String(estado);
  if (e === "Pagado") return { texto: "Pagado", color: "#2e7d32" };
  if (e === "Pendiente") return { texto: "Pendiente", color: "#e67e22" };
  if (e === "Rechazado") return { texto: "Rechazado", color: "#c0392b" };
  return { texto: escaparHtml(e), color: "#555" };
}

function formatearMonto(n) {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return "—";
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function armarHtml({ clienteNombre, emailCliente, dni, filas, cantidadLugares }) {
  const filasHtml = filas
    .map((row) => {
      const tipo = row.TipoReserva || "turno";
      const ep = estadoPagoLegible(row.EstadoPago);
      return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;vertical-align:top;">
          <strong>#${escaparHtml(row.idReserva)}</strong><br/>
          <span style="font-size:12px;color:#666;">${escaparHtml(row.recurso_nombre || "—")}</span>
        </td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${escaparHtml(row.espacio_nombre || "—")}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${escaparHtml(formatearFecha(row.DiaReserva))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${escaparHtml(horarioTexto(row))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${escaparHtml(etiquetaTipoReserva(tipo))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${escaparHtml(duracionPorTipo(tipo, row.HorarioReserva, row.HorarioFin))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">${formatearMonto(row.Monto)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;font-size:13px;">${metodoPagoLegible(row.MetodoPago, row.TipoPago)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #eee;">
          <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${ep.color}22;color:${ep.color};font-weight:600;font-size:13px;">${ep.texto}</span>
        </td>
      </tr>`;
    })
    .join("");

  const total = filas.reduce((s, r) => s + (parseFloat(r.Monto) || 0), 0);

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:640px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#2c3e50 0%,#34c08f 100%);padding:28px 24px;color:#fff;">
              <h1 style="margin:0;font-size:22px;font-weight:700;">¡Gracias por tu reserva!</h1>
              <p style="margin:10px 0 0;font-size:15px;opacity:.95;">Tu solicitud quedó registrada en Bo WeWorking.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#333;">
                Hola <strong>${escaparHtml(clienteNombre)}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#555;">
                Confirmamos los datos de tu reserva. Guardá este correo como comprobante.
              </p>
              <table role="presentation" width="100%" style="margin-bottom:20px;font-size:14px;color:#444;">
                <tr><td style="padding:6px 0;"><strong>Nombre</strong></td><td>${escaparHtml(clienteNombre)}</td></tr>
                <tr><td style="padding:6px 0;"><strong>Email</strong></td><td>${escaparHtml(emailCliente)}</td></tr>
                <tr><td style="padding:6px 0;"><strong>DNI</strong></td><td>${escaparHtml(dni)}</td></tr>
                <tr><td style="padding:6px 0;"><strong>Lugares / recursos reservados</strong></td><td>${cantidadLugares}</td></tr>
              </table>
              <h2 style="margin:0 0 12px;font-size:16px;color:#2c3e50;">Detalle</h2>
              <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                <table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;font-size:13px;min-width:520px;">
                  <thead>
                    <tr style="background:#f8fafb;color:#2c3e50;text-align:left;">
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Reserva / recurso</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Espacio</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Fecha</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Horario</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Modalidad</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Duración</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Monto</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Pago</th>
                      <th style="padding:10px;border-bottom:2px solid #e0e6ea;">Estado</th>
                    </tr>
                  </thead>
                  <tbody>${filasHtml}</tbody>
                </table>
              </div>
              <p style="margin:16px 0 0;font-size:15px;color:#2e7d32;font-weight:600;">
                Total estimado: ${formatearMonto(total)}
              </p>
              <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#777;">
                Si elegiste pagar en el local o tu pago está pendiente, podés completarlo al llegar o desde tu perfil en la web.
                Para consultas, respondé a este correo o contactanos por los canales habituales del coworking.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafb;font-size:12px;color:#999;text-align:center;">
              Bo WeWorking · Este es un mensaje automático, por favor no respondas si no es necesario.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function obtenerDestinatario(pool, dni) {
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(c."Email"),''), cu.email) AS email,
            TRIM(CONCAT(COALESCE(c."Nombre",''), ' ', COALESCE(c."Apellido",''))) AS nombre_cliente,
            c."Nombre", c."Apellido"
     FROM "Cliente" c
     LEFT JOIN "ClienteUsuario" cu ON cu.dni = c."DNI"
     WHERE c."DNI" = $1`,
    [dni]
  );
  if (rows.length === 0) return { email: null, nombre: null };
  const r = rows[0];
  const nombre =
    (r.nombre_cliente && r.nombre_cliente.trim()) ||
    [r.Nombre, r.Apellido].filter(Boolean).join(" ").trim() ||
    null;
  return { email: r.email || null, nombre };
}

async function obtenerFilasReserva(pool, idReservas) {
  const { rows } = await pool.query(
    `SELECT r."idReserva", r."Nombre", r."DNI", r."DiaReserva", r."HorarioReserva", r."HorarioFin",
            r."TipoReserva", r."Monto", r."Estado",
            rec."Nombre" AS recurso_nombre,
            e."Nombre" AS espacio_nombre,
            t."MetodoPago", t."EstadoPago", t."TipoPago"
     FROM "Reservas" r
     LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
     LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
     LEFT JOIN "Transaccion" t ON t."idReserva" = r."idReserva"
     WHERE r."idReserva" = ANY($1::int[])
     ORDER BY r."idReserva"`,
    [idReservas]
  );
  return rows;
}

// Envía el correo de confirmación. No lanza error si SMTP no está configurado.
export async function enviarConfirmacionReserva(pool, idReservas) {
  if (!idReservas?.length) return;
  if (!smtpConfigured()) {
    console.warn("[reserva email] SMTP no configurado; no se envía confirmación.");
    return;
  }

  const filasRaw = await obtenerFilasReserva(pool, idReservas);
  if (filasRaw.length === 0) return;
  const filas = serializarHorariosReservaEnFilas(filasRaw);

  const dni = filas[0].DNI;
  const clienteNombreReserva = filas[0].Nombre || "";
  const { email, nombre } = await obtenerDestinatario(pool, dni);
  const to = email?.trim();
  if (!to) {
    console.warn(`[reserva email] Cliente ${dni} sin email; no se envía confirmación.`);
    return;
  }

  const clienteNombre = (nombre && nombre.trim()) || clienteNombreReserva || "Cliente";

  const html = armarHtml({
    clienteNombre,
    emailCliente: to,
    dni: dni || "—",
    filas,
    cantidadLugares: filas.length,
  });

  const subject =
    filas.length > 1
      ? `Confirmación de reservas (${filas.length} lugares) — Bo WeWorking`
      : `Confirmación de reserva #${filas[0].idReserva} — Bo WeWorking`;

  await sendMail({
    to,
    subject,
    html,
    text: `Hola ${clienteNombre}, tu reserva en Bo WeWorking fue registrada. Revisá el detalle en la versión HTML del mensaje.`,
  });
}

// No bloquea la respuesta HTTP ni hace fallar la reserva si el correo falla.
export function enviarConfirmacionReservaEnBackground(pool, idReservas) {
  void enviarConfirmacionReserva(pool, idReservas).catch((err) => {
    console.error("[reserva email] Error al enviar confirmación:", err.message || err);
  });
}
