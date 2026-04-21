import nodemailer from "nodemailer";

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let cachedTransport = null;

function getTransport() {
  if (!smtpConfigured()) return null;
  if (cachedTransport) return cachedTransport;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure =
    process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1" || port === 465;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

/**
 * @param {{ to: string; subject: string; html: string; text?: string }} opts
 */
export async function sendMail(opts) {
  const transport = getTransport();
  if (!transport) {
    console.warn("[mailer] SMTP no configurado: omitiendo envío de correo.");
    return { skipped: true };
  }
  const from =
    process.env.MAIL_FROM ||
    `"${process.env.MAIL_FROM_NAME || "Bo WeWorking"}" <${process.env.SMTP_USER}>`;
  await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return { skipped: false };
}

export { smtpConfigured };
