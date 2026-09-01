import test from "node:test";
import assert from "node:assert/strict";
import {
  ROL_POR_DEFECTO,
  beneficiosParaRol,
  descuentoParaUsuario,
  evaluarSolicitudEstudiante,
  evaluarResolucionEstudiante,
  evaluarCambioEstadoCuenta,
  puedeAccederConRol,
  usuarioFinalPublico,
} from "./rolClienteUsuario.service.js";

// ── RF03: beneficios diferenciados ─────────────────────────
test("el rol por defecto de todo registro es 'usuario'", () => {
  assert.equal(ROL_POR_DEFECTO, "usuario");
});

test("estudiante tiene beneficios distintos de usuario", () => {
  const usuario = beneficiosParaRol("usuario");
  const estudiante = beneficiosParaRol("estudiante");

  assert.equal(usuario.descuento, 0);
  assert.ok(estudiante.descuento > 0, "el estudiante debe tener descuento");
  assert.ok(estudiante.permisos.includes("tarifa_estudiante"));
  assert.ok(!usuario.permisos.includes("tarifa_estudiante"));
});

test("un rol desconocido cae al rol por defecto", () => {
  assert.deepEqual(beneficiosParaRol("inventado"), beneficiosParaRol("usuario"));
});

test("una cuenta bloqueada no acumula el descuento de estudiante", () => {
  const activo = { rol: "estudiante", estado_cuenta: "activo" };
  const bloqueado = { rol: "estudiante", estado_cuenta: "bloqueado" };

  assert.ok(descuentoParaUsuario(activo) > 0);
  assert.equal(descuentoParaUsuario(bloqueado), 0);
});

// ── RF04: solicitud de cambio a estudiante ─────────────────
test("un usuario sin solicitud previa puede solicitar el rol Estudiante", () => {
  const r = evaluarSolicitudEstudiante({
    rol: "usuario",
    estado_cuenta: "activo",
    estado_verificacion_estudiante: "no_solicitado",
  });

  assert.equal(r.ok, true);
  assert.equal(r.estadoDestino, "pendiente");
});

test("un rechazo previo admite volver a solicitar", () => {
  const r = evaluarSolicitudEstudiante({
    rol: "usuario",
    estado_cuenta: "activo",
    estado_verificacion_estudiante: "rechazado",
  });

  assert.equal(r.ok, true);
});

test("no se puede solicitar dos veces con una solicitud pendiente", () => {
  const r = evaluarSolicitudEstudiante({
    rol: "usuario",
    estado_cuenta: "activo",
    estado_verificacion_estudiante: "pendiente",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SOLICITUD_PENDIENTE");
});

test("quien ya es estudiante no vuelve a solicitar", () => {
  const r = evaluarSolicitudEstudiante({
    rol: "estudiante",
    estado_cuenta: "activo",
    estado_verificacion_estudiante: "aprobado",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "YA_ES_ESTUDIANTE");
});

test("una cuenta bloqueada no puede solicitar el cambio de rol", () => {
  const r = evaluarSolicitudEstudiante({
    rol: "usuario",
    estado_cuenta: "bloqueado",
    estado_verificacion_estudiante: "no_solicitado",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CUENTA_BLOQUEADA");
});

// ── RF04: resolucion por parte del administrador ───────────
test("aprobar una solicitud pendiente asigna el rol Estudiante", () => {
  const r = evaluarResolucionEstudiante({
    usuario: { rol: "usuario", estado_verificacion_estudiante: "pendiente" },
    decision: "aprobar",
  });

  assert.equal(r.ok, true);
  assert.equal(r.rolFinal, "estudiante");
  assert.equal(r.estadoFinal, "aprobado");
});

test("rechazar deja el rol en 'usuario' y guarda el motivo", () => {
  const r = evaluarResolucionEstudiante({
    usuario: { rol: "usuario", estado_verificacion_estudiante: "pendiente" },
    decision: "rechazar",
    motivo: "El comprobante no es legible",
  });

  assert.equal(r.ok, true);
  assert.equal(r.rolFinal, "usuario");
  assert.equal(r.estadoFinal, "rechazado");
  assert.equal(r.motivo, "El comprobante no es legible");
});

test("rechazar sin motivo se bloquea", () => {
  const r = evaluarResolucionEstudiante({
    usuario: { rol: "usuario", estado_verificacion_estudiante: "pendiente" },
    decision: "rechazar",
    motivo: "   ",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("no se puede resolver una solicitud que no esta pendiente", () => {
  const r = evaluarResolucionEstudiante({
    usuario: { rol: "estudiante", estado_verificacion_estudiante: "aprobado" },
    decision: "rechazar",
    motivo: "tardio",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SIN_SOLICITUD_PENDIENTE");
});

// ── RF01: bloqueo y habilitacion de cuenta ─────────────────
test("bloquear con motivo cambia el estado a bloqueado", () => {
  const r = evaluarCambioEstadoCuenta({
    usuario: { estado_cuenta: "activo" },
    accion: "bloquear",
    motivo: "Incumplimiento del reglamento",
  });

  assert.equal(r.ok, true);
  assert.equal(r.estadoFinal, "bloqueado");
  assert.equal(r.motivo, "Incumplimiento del reglamento");
});

test("bloquear sin motivo se rechaza", () => {
  const r = evaluarCambioEstadoCuenta({
    usuario: { estado_cuenta: "activo" },
    accion: "bloquear",
    motivo: "",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("habilitar limpia el motivo del bloqueo anterior", () => {
  const r = evaluarCambioEstadoCuenta({
    usuario: { estado_cuenta: "bloqueado" },
    accion: "habilitar",
  });

  assert.equal(r.ok, true);
  assert.equal(r.estadoFinal, "activo");
  assert.equal(r.motivo, null);
});

test("bloquear una cuenta ya bloqueada es idempotente", () => {
  const r = evaluarCambioEstadoCuenta({
    usuario: { estado_cuenta: "bloqueado" },
    accion: "bloquear",
    motivo: "otra vez",
  });

  assert.equal(r.ok, true);
  assert.equal(r.sinCambios, true);
});

// ── RF05: restriccion de acceso por rol ────────────────────
test("el acceso se restringe segun el rol", () => {
  const usuario = { rol: "usuario", estado_cuenta: "activo" };
  const estudiante = { rol: "estudiante", estado_cuenta: "activo" };

  assert.equal(puedeAccederConRol(estudiante, ["estudiante"]), true);
  assert.equal(puedeAccederConRol(usuario, ["estudiante"]), false);
  assert.equal(puedeAccederConRol(usuario, []), true, "sin roles exigidos, pasa");
});

test("una cuenta bloqueada no accede a ningun recurso", () => {
  const bloqueado = { rol: "estudiante", estado_cuenta: "bloqueado" };

  assert.equal(puedeAccederConRol(bloqueado, ["estudiante"]), false);
  assert.equal(puedeAccederConRol(bloqueado, []), false);
});

// ── Proyeccion publica ─────────────────────────────────────
test("la proyeccion publica nunca expone password ni el comprobante", () => {
  const publico = usuarioFinalPublico({
    id: 1,
    email: "ana@ejemplo.com",
    password: "$2a$10$hash",
    google_id: "goog-123",
    rol: "estudiante",
    estado_cuenta: "activo",
    comprobante_estudiante: "data:image/png;base64,AAA",
  });

  assert.equal(publico.password, undefined);
  assert.equal(publico.google_id, undefined);
  assert.equal(publico.comprobante_estudiante, undefined);
  assert.equal(publico.tiene_comprobante, true);
  assert.ok(publico.beneficios.descuento > 0);
});
