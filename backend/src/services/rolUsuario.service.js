/**
 * Reglas de rol y permisos para los usuarios del panel (tabla `usuarios`).
 *
 * Logica pura, sin acceso a base de datos: los controladores leen el estado,
 * llaman a estas funciones y aplican el resultado dentro de una transaccion.
 *
 * Motivo: el cambio de rol actualizaba la columna `rol` sin tocar
 * `usuario_permisos`, dejando cuentas inconsistentes (un admin con permisos
 * huerfanos imposibles de limpiar, o un staff sin ningun permiso).
 * Centralizar la decision aca permite testearla sin base de datos.
 */

/** Roles validos en la tabla `usuarios`. 'empleado' es legacy: se acepta pero no se ofrece. */
export const ROLES_STAFF = ["admin", "staff", "empleado"];

/** Roles que el administrador puede elegir desde la interfaz. */
export const ROLES_ASIGNABLES = ["admin", "staff"];

/**
 * Permisos por defecto de cada rol.
 * `admin` no lleva filas: el middleware le concede todo de forma implicita.
 */
export const PERMISOS_POR_ROL = {
  admin: [],
  // `ver_financiero` entra por defecto: el modulo financiero oculta los montos
  // a quien no es admin (ver finanzasCreditos.controller.js), asi que el staff
  // solo accede a conteos y transacciones, nunca a la recaudacion total.
  // Estructura y creditos quedan fuera: configuran el catalogo del coworking y
  // el saldo de los clientes, y se otorgan caso por caso desde "Permisos".
  staff: [
    "ver_reservas", "crear_reservas", "modificar_reservas", "eliminar_reservas",
    "ver_clientes", "gestionar_clientes",
    "ver_espacios", "gestionar_espacios",
    "ver_calendario", "altas_clientes",
    "ver_financiero", "registrar_pagos",
  ],
  empleado: [
    "ver_reservas", "crear_reservas", "modificar_reservas", "eliminar_reservas",
    "ver_clientes", "gestionar_clientes",
    "ver_espacios", "gestionar_espacios",
    "ver_calendario", "altas_clientes",
  ],
};

/** Normaliza un email para comparar: recorta espacios y baja a minusculas. */
export function normalizarEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function esRolStaffValido(rol) {
  return ROLES_STAFF.includes(rol);
}

/** Permisos que corresponden a un rol. Devuelve siempre una copia nueva. */
export function permisosParaRol(rol) {
  return [...(PERMISOS_POR_ROL[rol] ?? [])];
}

/** Claves solicitadas que no figuran en el catalogo recibido. */
function permisosFueraDeCatalogo(solicitados, catalogo) {
  if (!Array.isArray(catalogo) || catalogo.length === 0) return [];
  return solicitados.filter((clave) => !catalogo.includes(clave));
}

/**
 * Decide el resultado de cambiar el rol de un usuario existente.
 *
 * @param {object}   params
 * @param {string}   params.rolActual          Rol que tiene hoy.
 * @param {string}   params.rolNuevo           Rol solicitado.
 * @param {string[]} params.permisosActuales   Permisos en `usuario_permisos`.
 * @param {string[]} [params.permisosSolicitados] Seleccion explicita del admin.
 * @param {string[]} [params.catalogoPermisos] Claves validas para validar.
 * @param {boolean}  [params.esAutoModificacion] El admin se edita a si mismo.
 * @param {number}   [params.totalAdmins]      Cantidad de admins del sistema.
 * @returns {{ok: boolean, codigo?: string, mensaje?: string, sinCambios?: boolean,
 *            debeReescribirPermisos: boolean, permisosFinales: string[],
 *            permisosInvalidos?: string[]}}
 */
export function evaluarCambioRol({
  rolActual,
  rolNuevo,
  permisosActuales = [],
  permisosSolicitados = null,
  catalogoPermisos = null,
  esAutoModificacion = false,
  totalAdmins = null,
} = {}) {
  const rechazo = (codigo, mensaje, extra = {}) => ({
    ok: false,
    codigo,
    mensaje,
    debeReescribirPermisos: false,
    permisosFinales: [...permisosActuales],
    ...extra,
  });

  if (!esRolStaffValido(rolNuevo)) {
    return rechazo(
      "ROL_INVALIDO",
      `Rol invalido. Valores permitidos: ${ROLES_ASIGNABLES.join(", ")}`
    );
  }

  // Sin cambio de rol: no se reescriben permisos.
  // Para editarlos existe el endpoint dedicado de permisos.
  if (rolActual === rolNuevo) {
    return {
      ok: true,
      sinCambios: true,
      debeReescribirPermisos: false,
      permisosFinales: [...permisosActuales],
      mensaje: "El usuario ya tiene ese rol",
    };
  }

  const pierdeAdmin = rolActual === "admin" && rolNuevo !== "admin";

  // Un admin no puede quitarse a si mismo el rol: se quedaria fuera del panel.
  if (pierdeAdmin && esAutoModificacion) {
    return rechazo(
      "AUTO_DEGRADACION",
      "No podes quitarte a vos mismo el rol de administrador"
    );
  }

  // Nunca dejar el sistema sin ningun administrador.
  if (pierdeAdmin && totalAdmins !== null && totalAdmins <= 1) {
    return rechazo(
      "ULTIMO_ADMIN",
      "No se puede degradar al unico administrador del sistema"
    );
  }

  // El admin tiene todos los permisos implicitos: no conserva filas propias.
  if (rolNuevo === "admin") {
    return {
      ok: true,
      debeReescribirPermisos: true,
      permisosFinales: [],
      mensaje: "El administrador recibe todos los permisos de forma implicita",
    };
  }

  // Rol no-admin: la seleccion explicita gana; si no, los permisos del rol.
  const usaSeleccion = Array.isArray(permisosSolicitados);
  const permisosFinales = usaSeleccion
    ? [...permisosSolicitados]
    : permisosParaRol(rolNuevo);

  if (usaSeleccion) {
    const invalidos = permisosFueraDeCatalogo(permisosFinales, catalogoPermisos);
    if (invalidos.length > 0) {
      return rechazo(
        "PERMISOS_INVALIDOS",
        `Permisos invalidos: ${invalidos.join(", ")}`,
        { permisosInvalidos: invalidos }
      );
    }
  }

  return {
    ok: true,
    debeReescribirPermisos: true,
    permisosFinales,
  };
}

/**
 * Decide si se puede dar de alta un usuario del panel.
 *
 * Separa "crear" de "editar": si el email ya existe nunca se escribe nada,
 * y se informa el rol actual para que la interfaz pueda ofrecer el cambio
 * de rol de forma explicita en lugar de mezclar ambas operaciones.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {object|null} params.usuarioExistente Fila hallada por email, o null.
 * @param {string} params.rolSolicitado
 * @param {string[]} [params.permisosSolicitados]
 * @param {string[]} [params.catalogoPermisos]
 * @returns {{ok: boolean, codigo?: string, mensaje?: string, email?: string,
 *            permisosFinales?: string[], usuarioId?: number, rolActual?: string,
 *            rolSolicitado?: string, puedeCambiarRol?: boolean}}
 */
export function evaluarAltaUsuario({
  email,
  usuarioExistente = null,
  rolSolicitado,
  permisosSolicitados = null,
  catalogoPermisos = null,
} = {}) {
  const emailNormalizado = normalizarEmail(email);

  if (!ROLES_ASIGNABLES.includes(rolSolicitado)) {
    return {
      ok: false,
      codigo: "ROL_INVALIDO",
      mensaje: `Rol invalido. Valores permitidos: ${ROLES_ASIGNABLES.join(", ")}`,
    };
  }

  // El email ya esta tomado: se rechaza sin escribir.
  if (usuarioExistente) {
    const rolActual = usuarioExistente.rol;
    const puedeCambiarRol =
      rolActual !== rolSolicitado && ROLES_ASIGNABLES.includes(rolSolicitado);

    return {
      ok: false,
      codigo: "EMAIL_EN_USO",
      mensaje: "Ya existe una cuenta con este email",
      usuarioId: usuarioExistente.id,
      email: emailNormalizado,
      rolActual,
      rolSolicitado,
      puedeCambiarRol,
    };
  }

  const usaSeleccion =
    Array.isArray(permisosSolicitados) && permisosSolicitados.length > 0;

  const permisosFinales =
    rolSolicitado === "admin"
      ? []
      : usaSeleccion
        ? [...permisosSolicitados]
        : permisosParaRol(rolSolicitado);

  if (rolSolicitado !== "admin" && usaSeleccion) {
    const invalidos = permisosFueraDeCatalogo(permisosFinales, catalogoPermisos);
    if (invalidos.length > 0) {
      return {
        ok: false,
        codigo: "PERMISOS_INVALIDOS",
        mensaje: `Permisos invalidos: ${invalidos.join(", ")}`,
        permisosInvalidos: invalidos,
      };
    }
  }

  return {
    ok: true,
    email: emailNormalizado,
    rolSolicitado,
    permisosFinales,
  };
}
