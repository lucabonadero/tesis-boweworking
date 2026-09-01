import test from "node:test";
import assert from "node:assert/strict";
import {
  PERMISOS_POR_ROL,
  ROLES_STAFF,
  permisosParaRol,
  evaluarCambioRol,
  evaluarAltaUsuario,
  normalizarEmail,
} from "./rolUsuario.service.js";

// ── normalizarEmail ────────────────────────────────────────
test("normalizarEmail recorta espacios y baja a minúsculas", () => {
  assert.equal(normalizarEmail("  Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.equal(normalizarEmail(null), "");
});

// ── permisosParaRol ────────────────────────────────────────
test("admin no recibe filas de permisos: los tiene implícitos", () => {
  assert.deepEqual(permisosParaRol("admin"), []);
});

test("staff recibe el conjunto por defecto y nunca el módulo financiero", () => {
  const permisos = permisosParaRol("staff");
  assert.ok(permisos.includes("ver_reservas"));
  assert.ok(permisos.includes("altas_clientes"));
  assert.ok(!permisos.includes("ver_financiero"));
  assert.ok(!permisos.includes("gestionar_usuarios"));
});

test("permisosParaRol devuelve una copia, no la constante compartida", () => {
  const a = permisosParaRol("staff");
  a.push("permiso_inventado");
  assert.ok(!PERMISOS_POR_ROL.staff.includes("permiso_inventado"));
});

test("rol legacy 'empleado' sigue siendo un rol de staff válido", () => {
  assert.ok(ROLES_STAFF.includes("empleado"));
  assert.ok(permisosParaRol("empleado").length > 0);
});

// ── evaluarCambioRol: reproducción del bug ─────────────────
test("BUG staff->admin: los permisos previos deben borrarse, no quedar huérfanos", () => {
  // Antes del fix: el rol pasaba a 'admin' y estas filas quedaban en
  // usuario_permisos. El endpoint de permisos luego las rechazaba, así que
  // no había forma de limpiarlas desde la interfaz: cuenta trabada.
  const r = evaluarCambioRol({
    rolActual: "staff",
    rolNuevo: "admin",
    permisosActuales: ["ver_reservas", "crear_reservas", "ver_clientes"],
  });

  assert.equal(r.ok, true);
  assert.equal(r.debeReescribirPermisos, true);
  assert.deepEqual(r.permisosFinales, [], "un admin no debe conservar filas de permisos");
});

test("BUG admin->staff: la cuenta no puede quedar con cero permisos", () => {
  // Antes del fix: el rol pasaba a 'staff' con la tabla de permisos vacía.
  // El usuario entraba al panel y no veía ningún módulo.
  const r = evaluarCambioRol({
    rolActual: "admin",
    rolNuevo: "staff",
    permisosActuales: [],
  });

  assert.equal(r.ok, true);
  assert.equal(r.debeReescribirPermisos, true);
  assert.ok(r.permisosFinales.length > 0, "debe recibir los permisos por defecto de su nuevo rol");
  assert.deepEqual(r.permisosFinales, PERMISOS_POR_ROL.staff);
});

test("cambio a staff con permisos explícitos: se respeta la selección del admin", () => {
  const r = evaluarCambioRol({
    rolActual: "admin",
    rolNuevo: "staff",
    permisosActuales: [],
    permisosSolicitados: ["ver_reservas", "ver_clientes"],
  });

  assert.equal(r.ok, true);
  assert.deepEqual(r.permisosFinales, ["ver_reservas", "ver_clientes"]);
});

test("permisos solicitados para un admin se ignoran: los tiene todos", () => {
  const r = evaluarCambioRol({
    rolActual: "staff",
    rolNuevo: "admin",
    permisosActuales: ["ver_reservas"],
    permisosSolicitados: ["ver_reservas", "ver_financiero"],
  });

  assert.equal(r.ok, true);
  assert.deepEqual(r.permisosFinales, []);
});

test("mismo rol: operación sin efecto, no reescribe permisos", () => {
  const r = evaluarCambioRol({
    rolActual: "staff",
    rolNuevo: "staff",
    permisosActuales: ["ver_reservas"],
  });

  assert.equal(r.ok, true);
  assert.equal(r.sinCambios, true);
  assert.equal(r.debeReescribirPermisos, false);
});

test("rol destino inválido: se rechaza sin escribir nada", () => {
  const r = evaluarCambioRol({
    rolActual: "staff",
    rolNuevo: "superusuario",
    permisosActuales: [],
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "ROL_INVALIDO");
  assert.equal(r.debeReescribirPermisos, false);
});

test("un admin no puede quitarse a sí mismo el rol de admin", () => {
  const r = evaluarCambioRol({
    rolActual: "admin",
    rolNuevo: "staff",
    permisosActuales: [],
    esAutoModificacion: true,
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "AUTO_DEGRADACION");
});

test("degradar al último admin del sistema queda bloqueado", () => {
  const r = evaluarCambioRol({
    rolActual: "admin",
    rolNuevo: "staff",
    permisosActuales: [],
    totalAdmins: 1,
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "ULTIMO_ADMIN");
});

test("con más de un admin, degradar a otro está permitido", () => {
  const r = evaluarCambioRol({
    rolActual: "admin",
    rolNuevo: "staff",
    permisosActuales: [],
    totalAdmins: 2,
  });

  assert.equal(r.ok, true);
});

test("permisos solicitados fuera del catálogo se rechazan", () => {
  const r = evaluarCambioRol({
    rolActual: "admin",
    rolNuevo: "staff",
    permisosActuales: [],
    permisosSolicitados: ["ver_reservas", "borrar_todo"],
    catalogoPermisos: ["ver_reservas", "ver_clientes"],
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "PERMISOS_INVALIDOS");
  assert.deepEqual(r.permisosInvalidos, ["borrar_todo"]);
});

// ── evaluarAltaUsuario: alta con email ya existente ────────
test("BUG alta con email existente: se rechaza informando el rol actual", () => {
  // Antes del fix el 409 era genérico: el admin no sabía qué rol ocupaba
  // la cuenta ni que existía la opción de cambiárselo.
  const r = evaluarAltaUsuario({
    email: "ana@ejemplo.com",
    usuarioExistente: { id: 7, email: "ana@ejemplo.com", rol: "staff" },
    rolSolicitado: "admin",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "EMAIL_EN_USO");
  assert.equal(r.usuarioId, 7);
  assert.equal(r.rolActual, "staff");
  assert.equal(r.rolSolicitado, "admin");
  assert.equal(r.puedeCambiarRol, true, "el frontend debe poder ofrecer el cambio de rol");
});

test("alta duplicada con el mismo rol: no se ofrece cambio de rol", () => {
  const r = evaluarAltaUsuario({
    email: "ana@ejemplo.com",
    usuarioExistente: { id: 7, email: "ana@ejemplo.com", rol: "staff" },
    rolSolicitado: "staff",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "EMAIL_EN_USO");
  assert.equal(r.puedeCambiarRol, false);
});

test("el email duplicado se detecta ignorando mayúsculas y espacios", () => {
  const r = evaluarAltaUsuario({
    email: "  ANA@Ejemplo.com ",
    usuarioExistente: { id: 7, email: "ana@ejemplo.com", rol: "staff" },
    rolSolicitado: "admin",
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "EMAIL_EN_USO");
});

test("alta con email libre: se permite y el email queda normalizado", () => {
  const r = evaluarAltaUsuario({
    email: "  Nuevo@Ejemplo.com ",
    usuarioExistente: null,
    rolSolicitado: "staff",
  });

  assert.equal(r.ok, true);
  assert.equal(r.email, "nuevo@ejemplo.com");
  assert.deepEqual(r.permisosFinales, PERMISOS_POR_ROL.staff);
});

test("alta de admin: sin filas de permisos", () => {
  const r = evaluarAltaUsuario({
    email: "jefe@ejemplo.com",
    usuarioExistente: null,
    rolSolicitado: "admin",
  });

  assert.equal(r.ok, true);
  assert.deepEqual(r.permisosFinales, []);
});

test("alta con rol inválido: se rechaza antes de escribir", () => {
  const r = evaluarAltaUsuario({
    email: "nuevo@ejemplo.com",
    usuarioExistente: null,
    rolSolicitado: "estudiante", // rol de usuario final, no de staff
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "ROL_INVALIDO");
});
