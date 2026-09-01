-- ============================================================
-- Reparación de cuentas rotas por el bug de cambio de rol
-- ============================================================
-- CONTEXTO DEL BUG
-- El endpoint PUT /api/admin/usuarios/:id cambiaba la columna `rol` sin
-- tocar la tabla `usuario_permisos` y sin transacción. Consecuencias:
--
--   staff -> admin : quedan filas huérfanas en usuario_permisos. El endpoint
--                    de permisos luego las rechaza ("Los permisos del
--                    administrador no se pueden modificar"), así que no hay
--                    forma de limpiarlas desde la interfaz.
--   admin -> staff : la cuenta queda con CERO permisos y sin aviso. El
--                    usuario entra al panel y no ve ningún módulo.
--
-- CÓMO USAR ESTE ARCHIVO
--   1. Ejecutar el BLOQUE 1 (diagnóstico). Solo lee, no modifica nada.
--   2. Revisar las filas devueltas y anotar los id afectados.
--   3. Descomentar en el BLOQUE 2 únicamente los UPDATE/INSERT que
--      correspondan a esos id y ejecutarlos.
--
-- El BLOQUE 2 está comentado a propósito: nada se repara automáticamente.
-- ============================================================


-- ============================================================
-- BLOQUE 1 — DIAGNÓSTICO (solo lectura, seguro de ejecutar)
-- ============================================================

-- 1.a Administradores con permisos huérfanos en usuario_permisos.
--     El rol admin tiene todos los permisos de forma implícita, así que
--     estas filas no deberían existir. Son restos de un staff -> admin.
SELECT
  'admin con permisos huerfanos' AS problema,
  u.id,
  u.email,
  u.rol,
  COUNT(up.permiso_clave) AS permisos_huerfanos
FROM usuarios u
JOIN usuario_permisos up ON up.usuario_id = u.id
WHERE u.rol = 'admin'
GROUP BY u.id, u.email, u.rol
ORDER BY u.id;

-- 1.b Usuarios no-admin sin ningún permiso: no pueden operar el panel.
--     Resto típico de un admin -> staff.
SELECT
  'usuario sin permisos' AS problema,
  u.id,
  u.email,
  u.rol,
  0 AS permisos_actuales
FROM usuarios u
LEFT JOIN usuario_permisos up ON up.usuario_id = u.id
WHERE u.rol <> 'admin'
GROUP BY u.id, u.email, u.rol
HAVING COUNT(up.permiso_clave) = 0
ORDER BY u.id;

-- 1.c Usuarios con rol legacy 'empleado'. El CHECK de la tabla lo permite,
--     pero el controlador solo acepta 'admin' y 'staff': no se pueden
--     editar desde la interfaz sin cambiarles el rol.
SELECT
  'rol legacy empleado' AS problema,
  u.id,
  u.email,
  u.rol,
  COUNT(up.permiso_clave) AS permisos_actuales
FROM usuarios u
LEFT JOIN usuario_permisos up ON up.usuario_id = u.id
WHERE u.rol = 'empleado'
GROUP BY u.id, u.email, u.rol
ORDER BY u.id;

-- 1.d Permisos asignados que ya no existen en el catálogo.
SELECT
  'permiso inexistente en catalogo' AS problema,
  up.usuario_id,
  u.email,
  up.permiso_clave
FROM usuario_permisos up
JOIN usuarios u ON u.id = up.usuario_id
LEFT JOIN permisos p ON p.clave = up.permiso_clave
WHERE p.clave IS NULL
ORDER BY up.usuario_id;

-- 1.e Emails duplicados en ClienteUsuario ignorando mayúsculas y espacios.
--     Si devuelve filas, resolverlas ANTES de correr
--     migration_rol_estudiante.sql (su índice único fallaría).
SELECT
  'email duplicado case-insensitive' AS problema,
  LOWER(TRIM(email)) AS email_normalizado,
  COUNT(*)           AS cuentas,
  ARRAY_AGG(id ORDER BY id) AS ids
FROM "ClienteUsuario"
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1;

-- 1.f Emails que aparecen a la vez como staff y como usuario final.
SELECT
  'email en usuarios y ClienteUsuario' AS problema,
  u.id   AS usuario_staff_id,
  cu.id  AS cliente_usuario_id,
  u.email
FROM usuarios u
JOIN "ClienteUsuario" cu ON LOWER(TRIM(cu.email)) = LOWER(TRIM(u.email))
ORDER BY u.id;

-- 1.g Desfase entre Cliente y ClienteUsuario para el mismo DNI.
--     sincronizarCliente() buscaba por DNI y sobrescribía el Email.
SELECT
  'email desincronizado Cliente vs ClienteUsuario' AS problema,
  cu.id AS cliente_usuario_id,
  cu.dni,
  cu.email       AS email_cuenta,
  c."Email"      AS email_cliente
FROM "ClienteUsuario" cu
JOIN "Cliente" c ON c."DNI" = cu.dni
WHERE LOWER(TRIM(COALESCE(c."Email", ''))) IS DISTINCT FROM LOWER(TRIM(cu.email))
ORDER BY cu.id;


-- ============================================================
-- BLOQUE 2 — REPARACIÓN (comentado: descomentar solo lo necesario)
-- ============================================================
-- Reemplazar los id de ejemplo por los que devolvió el BLOQUE 1.
-- Ejecutar dentro de la transacción y verificar antes del COMMIT.

-- BEGIN;

-- 2.a Limpiar permisos huérfanos de un administrador (caso 1.a).
--     El admin conserva todos los permisos de forma implícita.
-- DELETE FROM usuario_permisos
-- WHERE usuario_id IN (/* ids del 1.a */ 0)
--   AND usuario_id IN (SELECT id FROM usuarios WHERE rol = 'admin');

-- 2.b Restaurar los permisos por defecto de staff (casos 1.b y 1.c).
--     Mismo conjunto que PERMISOS_POR_ROL.staff en rolUsuario.service.js.
-- INSERT INTO usuario_permisos (usuario_id, permiso_clave)
-- SELECT u.id, p.clave
-- FROM usuarios u
-- CROSS JOIN permisos p
-- WHERE u.id IN (/* ids del 1.b / 1.c */ 0)
--   AND u.rol <> 'admin'
--   AND p.clave IN (
--     'ver_reservas', 'crear_reservas', 'modificar_reservas', 'eliminar_reservas',
--     'ver_clientes', 'gestionar_clientes',
--     'ver_espacios', 'gestionar_espacios',
--     'ver_calendario', 'altas_clientes'
--   )
-- ON CONFLICT DO NOTHING;

-- 2.c Normalizar el rol legacy 'empleado' a 'staff' (caso 1.c).
--     Correr DESPUÉS de 2.b para que no quede sin permisos.
-- UPDATE usuarios SET rol = 'staff'
-- WHERE id IN (/* ids del 1.c */ 0) AND rol = 'empleado';

-- 2.d Eliminar permisos que ya no existen en el catálogo (caso 1.d).
-- DELETE FROM usuario_permisos
-- WHERE permiso_clave NOT IN (SELECT clave FROM permisos);

-- 2.e Realinear el Email de Cliente con el de su cuenta (caso 1.g).
--     ClienteUsuario es la fuente de verdad: es la cuenta con la que
--     el usuario inicia sesión.
-- UPDATE "Cliente" c
-- SET "Email" = cu.email
-- FROM "ClienteUsuario" cu
-- WHERE c."DNI" = cu.dni
--   AND cu.id IN (/* ids del 1.g */ 0);

-- Verificación previa al COMMIT: ambas consultas deben volver vacías.
-- SELECT u.id, u.email FROM usuarios u
-- JOIN usuario_permisos up ON up.usuario_id = u.id
-- WHERE u.rol = 'admin' GROUP BY u.id, u.email;
--
-- SELECT u.id, u.email FROM usuarios u
-- LEFT JOIN usuario_permisos up ON up.usuario_id = u.id
-- WHERE u.rol <> 'admin' GROUP BY u.id, u.email
-- HAVING COUNT(up.permiso_clave) = 0;

-- COMMIT;
-- En caso de duda: ROLLBACK;
