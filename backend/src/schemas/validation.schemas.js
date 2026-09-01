import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(256),
});

export const staffRegistrarAdminSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  rol: z.enum(["admin", "staff"]).optional(),
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

// ============================================================
// Gestion de usuarios del panel (tabla `usuarios`)
// ============================================================

/** Roles asignables desde la interfaz de Gestion de Usuarios. */
const rolStaffSchema = z.enum(["admin", "staff"]);

/** Clave de permiso del catalogo. */
const permisoClaveSchema = z.string().min(1).max(50).trim();

/** POST /api/admin/usuarios */
export const adminCrearUsuarioSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(6).max(128),
  rol: rolStaffSchema,
  permisos: z.array(permisoClaveSchema).max(50).optional(),
});

/**
 * PUT /api/admin/usuarios/:id
 * No acepta `rol`: el cambio de rol tiene su endpoint dedicado para que
 * recalcule los permisos en la misma transaccion.
 */
export const adminActualizarUsuarioSchema = z
  .object({
    email: z.string().email().max(255).trim().toLowerCase().optional(),
    password: z.string().min(6).max(128).optional(),
  })
  .refine((b) => b.email !== undefined || b.password !== undefined, {
    message: "No hay datos para actualizar",
  });

/** PUT /api/admin/usuarios/:id/rol */
export const adminCambiarRolUsuarioSchema = z.object({
  rol: rolStaffSchema,
  permisos: z.array(permisoClaveSchema).max(50).optional(),
});

/** PUT /api/admin/usuarios/:id/permisos */
export const adminActualizarPermisosSchema = z.object({
  permisos: z.array(permisoClaveSchema).max(50),
});

/** Parametro :id de las rutas de administracion. */
export const adminIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ============================================================
// Gestion de usuarios finales (tabla `ClienteUsuario`)
// ============================================================

/** Roles del usuario final (RF03). */
const rolClienteSchema = z.enum(["usuario", "estudiante"]);

/** GET /api/admin/clientes-usuarios - filtros del panel (RF02). */
export const adminListarClientesUsuariosQuerySchema = z.object({
  rol: rolClienteSchema.optional(),
  estado_cuenta: z.enum(["activo", "bloqueado"]).optional(),
  estado_verificacion_estudiante: z
    .enum(["no_solicitado", "pendiente", "aprobado", "rechazado"])
    .optional(),
  q: z.string().max(160).trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** PUT /api/admin/clientes-usuarios/:id/estado - bloquear o habilitar (RF01). */
export const adminCambiarEstadoCuentaSchema = z
  .object({
    accion: z.enum(["bloquear", "habilitar"]),
    motivo: z.string().max(500).trim().optional(),
  })
  .refine((b) => b.accion !== "bloquear" || (b.motivo && b.motivo.length > 0), {
    message: "Indica el motivo del bloqueo",
    path: ["motivo"],
  });

/** PUT /api/admin/clientes-usuarios/:id/verificacion-estudiante (RF04). */
export const adminResolverEstudianteSchema = z
  .object({
    decision: z.enum(["aprobar", "rechazar"]),
    motivo: z.string().max(500).trim().optional(),
  })
  .refine((b) => b.decision !== "rechazar" || (b.motivo && b.motivo.length > 0), {
    message: "Indica el motivo del rechazo",
    path: ["motivo"],
  });

/** POST /api/auth/cliente/solicitar-estudiante (RF04). */
export const clienteSolicitarEstudianteSchema = z.object({
  institucion: z.string().min(2).max(160).trim(),
  comprobante: z.string().max(2_000_000).optional(),
});

// Sistema de créditos (RF06 - RF10).

export const creditosMovimientosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Id en la ruta: usuario o paquete. */
export const creditosIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Cotización previa: cuántos créditos cuesta la selección actual. */
export const creditosCotizarSchema = z.object({
  items: z.array(z.object({ idRecurso: z.coerce.number().int().positive() })).min(1).max(24),
  DiaReserva: z.string().min(1).max(32),
  HorarioReserva: z.string().max(16).optional().nullable(),
  HorarioFin: z.string().max(16).optional().nullable(),
  TipoReserva: z.enum(["turno", "semanal", "mensual"]).default("turno"),
});

/** El cliente elige un paquete; el precio lo pone el servidor. */
export const creditosComprarSchema = z.object({
  paqueteId: z.coerce.number().int().positive(),
});

/**
 * `z.coerce.boolean()` convierte cualquier texto no vacio en `true`, incluido
 * "false". Estos flags autorizan operaciones sensibles: se leen de forma
 * explicita.
 */
const flagBooleano = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((v) => v === "true"),
]);

/**
 * Ajuste manual (RF08). `permitirNegativo` es la autorización explícita para
 * dejar el saldo bajo cero.
 */
export const adminAjusteCreditosSchema = z.object({
  cantidad: z.coerce
    .number()
    .int({ message: "Los créditos son enteros" })
    .refine((n) => n !== 0, { message: "La cantidad no puede ser cero" }),
  motivo: z.string().trim().min(3).max(500),
  permitirNegativo: flagBooleano.default(false),
});

export const adminCrearPaqueteSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  creditos: z.coerce.number().int().positive(),
  precio: z.coerce.number().nonnegative(),
  descripcion: z.string().trim().max(1000).optional().nullable(),
});

export const adminActualizarPaqueteSchema = adminCrearPaqueteSchema.extend({
  activo: flagBooleano.optional(),
});

const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_YMD = /^\d{4}-\d{2}-\d{2}$/;

export const crearBloqueoSchema = z
  .object({
    idRecurso: z.coerce.number().int().positive(),
    fechaInicio: z.string().min(10),
    fechaFin: z.string().min(10),
    motivo: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => new Date(v.fechaInicio) < new Date(v.fechaFin), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["fechaFin"],
  });

export const actualizarBloqueoSchema = z
  .object({
    fechaInicio: z.string().min(10),
    fechaFin: z.string().min(10),
    motivo: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => new Date(v.fechaInicio) < new Date(v.fechaFin), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["fechaFin"],
  });

export const guardarDisponibilidadSchema = z.object({
  franjas: z
    .array(
      z
        .object({
          diaSemana: z.coerce.number().int().min(0).max(6),
          horaInicio: z.string().regex(HORA_HHMM, "Formato de hora inválido (HH:MM)."),
          horaFin: z.string().regex(HORA_HHMM, "Formato de hora inválido (HH:MM)."),
        })
        .refine((f) => f.horaInicio < f.horaFin, {
          message: "La hora de fin debe ser posterior a la de inicio.",
          path: ["horaFin"],
        })
    )
    .max(70),
});

export const slotsQuerySchema = z.object({
  idRecurso: z.coerce.number().int().positive(),
  fecha: z.string().regex(FECHA_YMD, "La fecha debe tener formato YYYY-MM-DD."),
});

export const bloqueosQuerySchema = z.object({
  idRecurso: z.coerce.number().int().positive().optional(),
  desde: z.string().regex(FECHA_YMD).optional(),
  hasta: z.string().regex(FECHA_YMD).optional(),
});
