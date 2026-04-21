# Convención de nombres en PostgreSQL (Bo WeWorking)

## Estado actual

El esquema mezcla estilos por razones históricas:

- Tablas en **minúsculas sin comillas**: `usuarios` (columnas típicamente `snake_case` implícito según cómo se crearon).
- Tablas y columnas con **PascalCase entre comillas dobles**, alineadas al modelo original de la tesis: `"Cliente"`, `"Reservas"`, `"EstadoPago"`, etc.

En PostgreSQL, los identificadores entre comillas conservan mayúsculas y deben citarse siempre en las consultas (`"Cliente"."DNI"`).

## Estándar recomendado para código nuevo

1. **Preferir `snake_case` sin comillas** para tablas y columnas nuevas (`reserva_pago`, `estado_pago`, `creado_en`).
2. **No mezclar** PascalCase citado y snake_case en la misma tabla salvo migración intermedia documentada.
3. **Nombres en español** están bien si el dominio del producto ya los usa; lo crítico es **un solo estilo por objeto** y consistencia en el código (DTOs / respuestas JSON pueden seguir `camelCase` en el API).

## Migración gradual (cuando se aborde)

- Renombrar columnas/tablas con `ALTER TABLE ... RENAME` y vistas de compatibilidad si hace falta.
- Actualizar consultas en el backend en el mismo despliegue que la migración.
- Evitar dejar dos nombres vivos (alias permanentes) sin plan de retirada.

## Equipo

Hasta la migración: **respetar el estilo del objeto que toquen** (si la tabla es `"Reservas"`, seguir comillas y mayúsculas en SQL). Para revisiones de PR, marcar desvíos solo en objetos nuevos o en cambios que ya toquen el esquema.
