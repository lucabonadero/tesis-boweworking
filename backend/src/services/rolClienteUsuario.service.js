/**
 * Reglas de rol, verificacion de estudiante y estado de cuenta para los
 * usuarios finales (tabla `ClienteUsuario`).
 *
 * Cubre RF03, RF04, RF05. Logica pura, sin acceso a base de datos: los
 * controladores leen el estado, llaman a estas funciones y aplican el
 * resultado dentro de una transaccion.
 */

/** Roles del usuario final (RF03). */
export const ROLES_CLIENTE = ["usuario", "estudiante"];

/** Rol asignado a todo registro nuevo (RF04). */
export const ROL_POR_DEFECTO = "usuario";

/** Estados de la solicitud de verificacion de estudiante (RF04). */
export const ESTADOS_VERIFICACION = [
  "no_solicitado",
  "pendiente",
  "aprobado",
  "rechazado",
];

/** Estados de la cuenta (RF01). */
export const ESTADOS_CUENTA = ["activo", "bloqueado"];

/**
 * Beneficios y permisos diferenciados por rol (RF03).
 * `descuento` se aplica sobre el monto de la reserva.
 */
export const BENEFICIOS_POR_ROL = {
  usuario: {
    descuento: 0,
    permisos: ["reservar_espacios", "ver_perfil", "solicitar_estudiante"],
    etiqueta: "Usuario",
  },
  estudiante: {
    descuento: 0.2,
    permisos: ["reservar_espacios", "ver_perfil", "tarifa_estudiante"],
    etiqueta: "Estudiante",
  },
};

/** Beneficios del rol. Devuelve una copia para no exponer la constante. */
export function beneficiosParaRol(rol) {
  const base = BENEFICIOS_POR_ROL[rol] ?? BENEFICIOS_POR_ROL[ROL_POR_DEFECTO];
  return { ...base, permisos: [...base.permisos] };
}

/** Descuento vigente del usuario. Una cuenta bloqueada no acumula beneficios. */
export function descuentoParaUsuario(usuario) {
  if (!usuario || usuario.estado_cuenta === "bloqueado") return 0;
  return beneficiosParaRol(usuario.rol).descuento;
}

/**
 * Decide si un usuario puede solicitar el cambio a Estudiante (RF04).
 *
 * @param {object} usuario Fila de ClienteUsuario.
 * @returns {{ok: boolean, codigo?: string, mensaje?: string, estadoDestino?: string}}
 */
export function evaluarSolicitudEstudiante(usuario) {
  if (!usuario) {
    return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "Usuario no encontrado" };
  }

  if (usuario.estado_cuenta === "bloqueado") {
    return {
      ok: false,
      codigo: "CUENTA_BLOQUEADA",
      mensaje: "Tu cuenta esta bloqueada. Contactate con el coworking.",
    };
  }

  if (usuario.rol === "estudiante") {
    return {
      ok: false,
      codigo: "YA_ES_ESTUDIANTE",
      mensaje: "Tu cuenta ya tiene el rol Estudiante",
    };
  }

  if (usuario.estado_verificacion_estudiante === "pendiente") {
    return {
      ok: false,
      codigo: "SOLICITUD_PENDIENTE",
      mensaje: "Ya tenes una solicitud pendiente de revision",
    };
  }

  // 'no_solicitado' y 'rechazado' pueden solicitar: un rechazo admite reintento.
  return { ok: true, estadoDestino: "pendiente" };
}

/**
 * Decide el resultado de aprobar o rechazar una solicitud de estudiante (RF04).
 *
 * @param {object} params
 * @param {object} params.usuario   Fila de ClienteUsuario.
 * @param {"aprobar"|"rechazar"} params.decision
 * @param {string} [params.motivo]  Obligatorio al rechazar.
 * @returns {{ok: boolean, codigo?: string, mensaje?: string,
 *            rolFinal?: string, estadoFinal?: string, motivo?: string|null}}
 */
export function evaluarResolucionEstudiante({ usuario, decision, motivo = null } = {}) {
  if (!usuario) {
    return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "Usuario no encontrado" };
  }

  if (!["aprobar", "rechazar"].includes(decision)) {
    return {
      ok: false,
      codigo: "DECISION_INVALIDA",
      mensaje: "La decision debe ser 'aprobar' o 'rechazar'",
    };
  }

  // Solo se resuelve lo que esta pendiente: evita reabrir casos ya cerrados.
  if (usuario.estado_verificacion_estudiante !== "pendiente") {
    return {
      ok: false,
      codigo: "SIN_SOLICITUD_PENDIENTE",
      mensaje: "Este usuario no tiene una solicitud pendiente",
    };
  }

  if (decision === "aprobar") {
    return {
      ok: true,
      rolFinal: "estudiante",
      estadoFinal: "aprobado",
      motivo: null,
    };
  }

  const motivoLimpio = String(motivo ?? "").trim();
  if (motivoLimpio.length === 0) {
    return {
      ok: false,
      codigo: "MOTIVO_REQUERIDO",
      mensaje: "Indica el motivo del rechazo",
    };
  }

  // Al rechazar, el rol vuelve a 'usuario': el rechazo no otorga beneficios.
  return {
    ok: true,
    rolFinal: ROL_POR_DEFECTO,
    estadoFinal: "rechazado",
    motivo: motivoLimpio,
  };
}

/**
 * Decide el resultado de bloquear o habilitar una cuenta (RF01).
 *
 * @param {object} params
 * @param {object} params.usuario  Fila de ClienteUsuario.
 * @param {"bloquear"|"habilitar"} params.accion
 * @param {string} [params.motivo] Obligatorio al bloquear.
 * @returns {{ok: boolean, codigo?: string, mensaje?: string,
 *            estadoFinal?: string, motivo?: string|null, sinCambios?: boolean}}
 */
export function evaluarCambioEstadoCuenta({ usuario, accion, motivo = null } = {}) {
  if (!usuario) {
    return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "Usuario no encontrado" };
  }

  if (!["bloquear", "habilitar"].includes(accion)) {
    return {
      ok: false,
      codigo: "ACCION_INVALIDA",
      mensaje: "La accion debe ser 'bloquear' o 'habilitar'",
    };
  }

  const estadoFinal = accion === "bloquear" ? "bloqueado" : "activo";

  if (usuario.estado_cuenta === estadoFinal) {
    return {
      ok: true,
      sinCambios: true,
      estadoFinal,
      motivo: null,
      mensaje: `La cuenta ya se encuentra en estado ${estadoFinal}`,
    };
  }

  if (accion === "bloquear") {
    const motivoLimpio = String(motivo ?? "").trim();
    if (motivoLimpio.length === 0) {
      return {
        ok: false,
        codigo: "MOTIVO_REQUERIDO",
        mensaje: "Indica el motivo del bloqueo",
      };
    }
    return { ok: true, estadoFinal, motivo: motivoLimpio };
  }

  // Al habilitar se limpia el motivo del bloqueo anterior.
  return { ok: true, estadoFinal, motivo: null };
}

/**
 * Autorizacion por rol para usuarios finales (RF05).
 * El staff del panel no pasa por aca: usa `verificarPermiso`.
 */
export function puedeAccederConRol(usuario, rolesPermitidos = []) {
  if (!usuario) return false;
  if (usuario.estado_cuenta === "bloqueado") return false;
  if (rolesPermitidos.length === 0) return true;
  return rolesPermitidos.includes(usuario.rol);
}

/** Proyeccion segura de una fila para exponer por la API. */
export function usuarioFinalPublico(row) {
  if (!row) return null;
  const {
    password,
    google_id,
    comprobante_estudiante,
    tiene_comprobante,
    ...resto
  } = row;
  // SQL puede traer tiene_comprobante ya calculado, sin la columna pesada.
  return {
    ...resto,
    beneficios: beneficiosParaRol(row.rol),
    tiene_comprobante:
      tiene_comprobante !== undefined
        ? Boolean(tiene_comprobante)
        : Boolean(comprobante_estudiante),
  };
}
