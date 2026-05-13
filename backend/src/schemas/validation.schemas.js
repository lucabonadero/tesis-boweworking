import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(256),
});

export const staffRegistrarAdminSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  rol: z.enum(["admin", "empleado", "staff"]).optional(),
});

export const clienteRegistroSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
  nombre: z.string().min(1).max(120).trim(),
  apellido: z.string().min(1).max(120).trim(),
  dni: z.string().min(1).max(32).trim(),
  telefono: z.string().min(1).max(40).trim(),
});

export const clienteLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(256),
});

export const clienteGoogleSchema = z.object({
  credential: z.string().min(10).max(12000),
});

export const clienteActualizarPerfilSchema = z.object({
  nombre: z.string().min(1).max(120).trim(),
  apellido: z.string().min(1).max(120).trim(),
  telefono: z.string().max(40).optional().nullable(),
});

export const clienteCompletarPerfilSchema = z.object({
  dni: z.string().min(1).max(32).trim(),
  telefono: z.string().min(1).max(40).trim(),
});

export const clienteSolicitarRecuperacionSchema = z.object({
  email: z.string().email().max(255).trim(),
});

export const clienteValidarTokenRecuperacionQuerySchema = z.object({
  token: z.string().min(32).max(512).trim(),
});

export const clienteRestablecerPasswordSchema = z.object({
  token: z.string().min(32).max(512).trim(),
  password: z.string().min(8).max(128),
});

export const clienteCambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1).max(256),
  passwordNueva: z.string().min(8).max(128),
});

/** Body POST /api/reservas: clientes no envían Monto (se calcula en el servidor). */
const crearReservaBodyBaseSchema = z.object({
  idRecurso: z.coerce.number().int().positive(),
  DiaReserva: z.string().min(1).max(32),
  HorarioReserva: z.string().max(16).optional().nullable(),
  HorarioFin: z.string().max(16).optional().nullable(),
  TipoReserva: z.enum(["turno", "semanal", "mensual"]).optional(),
  DNI: z.union([z.string(), z.number()]).optional(),
  Nombre: z.string().max(300).optional(),
});

export const crearReservaSchemaCliente = crearReservaBodyBaseSchema;

/** Staff puede fijar Monto manualmente; si omite o envía ≤ 0, el servidor calcula como los clientes. */
export const crearReservaSchemaStaff = crearReservaBodyBaseSchema.extend({
  Monto: z.coerce.number().nonnegative().optional(),
});

/** Mismo cuerpo para todos los roles; el monto de cada fila se calcula en el servidor. */
export const crearReservasMultiplesSchema = z.object({
  DiaReserva: z.string().min(1).max(32),
  HorarioReserva: z.string().min(1).max(16),
  HorarioFin: z.string().min(1).max(16),
  items: z.array(z.object({ idRecurso: z.coerce.number().int().positive() })).min(1).max(24),
  DNI: z.union([z.string(), z.number()]).optional(),
  Nombre: z.string().max(300).optional(),
});

export const crearPreferenciaSchema = z
  .object({
    idReserva: z.coerce.number().int().positive().optional(),
    idSerie: z.coerce.number().int().positive().optional(),
    idReservaGrupo: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (b) => [b.idReserva != null, b.idSerie != null, b.idReservaGrupo != null].filter(Boolean).length === 1,
    { message: "Enviá exactamente uno: idReserva, idSerie o idReservaGrupo." }
  );

/** GET /api/reservas/serie-mensual/cotizar */
export const serieMensualCotizarQuerySchema = z.object({
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diaSemana: z.coerce.number().int().min(1).max(7),
  idRecurso: z.coerce.number().int().positive(),
  HorarioReserva: z.string().min(1).max(16),
  HorarioFin: z.string().min(1).max(16),
});

/** POST /api/reservas/serie-mensual */
export const serieMensualCrearBodySchema = serieMensualCotizarQuerySchema.extend({
  DNI: z.union([z.string(), z.number()]).optional(),
  Nombre: z.string().max(300).optional(),
});
