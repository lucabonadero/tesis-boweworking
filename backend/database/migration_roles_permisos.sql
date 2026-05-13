-- ============================================================
-- Migración: Sistema de roles avanzado y permisos granulares
-- Ejecutar una sola vez contra la base de datos boweworking
-- ============================================================

-- 1. Extender constraint de rol (agrega 'staff' al enum de texto)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'empleado', 'staff'));

-- 2. Catálogo de permisos disponibles en el sistema
CREATE TABLE IF NOT EXISTS permisos (
  clave        VARCHAR(50) PRIMARY KEY,
  descripcion  TEXT        NOT NULL,
  modulo       VARCHAR(50) NOT NULL
);

INSERT INTO permisos (clave, descripcion, modulo) VALUES
  ('ver_reservas',       'Ver listado de reservas',                   'reservas'),
  ('crear_reservas',     'Crear nuevas reservas',                     'reservas'),
  ('modificar_reservas', 'Modificar reservas existentes',             'reservas'),
  ('eliminar_reservas',  'Eliminar reservas',                         'reservas'),
  ('ver_clientes',       'Ver listado de clientes',                   'clientes'),
  ('gestionar_clientes', 'Crear, editar y eliminar clientes',         'clientes'),
  ('ver_espacios',       'Ver panel de espacios y métricas',          'espacios'),
  ('gestionar_espacios', 'Crear, editar y eliminar espacios',         'espacios'),
  ('ver_financiero',     'Acceder al módulo de gestión financiera',   'financiero'),
  ('gestionar_pagos',    'Gestionar pagos y transacciones',           'financiero'),
  ('registrar_pagos',    'Registrar pagos presenciales',              'financiero'),
  ('ver_calendario',     'Ver calendario de disponibilidad',          'calendario'),
  ('altas_clientes',     'Registrar asistencia y altas de clientes',  'altas'),
  ('gestionar_usuarios', 'Gestionar usuarios staff del sistema',      'usuarios')
ON CONFLICT (clave) DO NOTHING;

-- 3. Tabla de permisos asignados por usuario
--    - admin no necesita entradas: el código siempre le otorga todo
--    - empleado y staff tienen sus permisos listados aquí
CREATE TABLE IF NOT EXISTS usuario_permisos (
  usuario_id    INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permiso_clave VARCHAR(50) NOT NULL REFERENCES permisos(clave) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, permiso_clave)
);

-- 4. Asignar permisos predeterminados a los empleados ya existentes
--    (excluye módulo financiero, tal como hará el rol staff)
INSERT INTO usuario_permisos (usuario_id, permiso_clave)
SELECT u.id, p.clave
FROM usuarios u
CROSS JOIN permisos p
WHERE u.rol = 'empleado'
  AND p.clave NOT IN ('ver_financiero', 'gestionar_pagos', 'registrar_pagos', 'gestionar_usuarios')
ON CONFLICT DO NOTHING;
