-- ============================================================
-- Migración: sincronizar permisos granulares con los módulos actuales
--
-- Desde migration_roles_permisos.sql se agregaron módulos (estructura,
-- créditos, cobro presencial) cuyas claves nacieron sueltas en las
-- migraciones de cada feature, y el rol staff quedó sin los defaults.
--
-- Decisión de producto: el staff ve el módulo financiero por defecto.
-- El backend (finanzasCreditos.controller.js) le oculta los montos totales
-- a quien no es admin, así que ver_financiero solo expone conteos y
-- transacciones, nunca la recaudación.
-- ============================================================

BEGIN;

-- 1. Catálogo completo (idempotente; refresca descripción y módulo)
INSERT INTO permisos (clave, descripcion, modulo) VALUES
  ('ver_reservas',          'Ver listado de reservas',                            'reservas'),
  ('crear_reservas',        'Crear nuevas reservas',                              'reservas'),
  ('modificar_reservas',    'Modificar reservas existentes',                      'reservas'),
  ('eliminar_reservas',     'Eliminar reservas',                                  'reservas'),
  ('ver_clientes',          'Ver listado de clientes',                            'clientes'),
  ('gestionar_clientes',    'Crear, editar y eliminar clientes',                  'clientes'),
  ('ver_espacios',          'Ver panel de espacios y métricas',                   'espacios'),
  ('gestionar_espacios',    'Crear, editar y eliminar espacios',                  'espacios'),
  ('gestionar_estructura',  'Crear, editar y eliminar pisos, espacios y recursos', 'estructura'),
  ('reordenar_estructura',  'Reordenar y mover elementos en la estructura',       'estructura'),
  ('ver_financiero',        'Acceder al módulo de gestión financiera',            'financiero'),
  ('gestionar_pagos',       'Gestionar pagos, anulaciones y montos totales',      'financiero'),
  ('registrar_pagos',       'Registrar cobros presenciales en mostrador',         'financiero'),
  ('gestionar_creditos',    'Ajustar saldos y configurar paquetes de créditos',   'creditos'),
  ('ver_calendario',        'Ver calendario de disponibilidad',                   'calendario'),
  ('altas_clientes',        'Registrar asistencia y altas de clientes',           'altas'),
  ('gestionar_usuarios',    'Gestionar usuarios del sistema y solicitudes',       'usuarios')
ON CONFLICT (clave) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      modulo      = EXCLUDED.modulo;

-- 2. Otorgar los defaults del rol staff a las cuentas staff existentes.
--    Solo agrega: no revoca nada que el admin haya ajustado a mano.
--    Estructura y créditos NO son default: configuran el catálogo del coworking
--    y el saldo de los clientes, y se otorgan caso por caso desde "Permisos".
INSERT INTO usuario_permisos (usuario_id, permiso_clave)
SELECT u.id, p.clave
FROM usuarios u
CROSS JOIN permisos p
WHERE u.rol = 'staff'
  AND p.clave IN (
    'ver_reservas', 'crear_reservas', 'modificar_reservas', 'eliminar_reservas',
    'ver_clientes', 'gestionar_clientes',
    'ver_espacios', 'gestionar_espacios',
    'ver_calendario', 'altas_clientes',
    'ver_financiero', 'registrar_pagos'
  )
ON CONFLICT DO NOTHING;

-- 3. Limpiar permisos huérfanos de administradores: el rol los tiene implícitos.
DELETE FROM usuario_permisos up
USING usuarios u
WHERE up.usuario_id = u.id AND u.rol = 'admin';

COMMIT;
