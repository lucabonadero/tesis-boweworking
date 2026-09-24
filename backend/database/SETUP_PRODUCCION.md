# Preparar la base de datos en producción

`init/01_schema.sql` es un dump actualizado: ya contiene las 23 tablas y todas
las columnas que agregaron las migraciones (`RecepcionadaEn`, `idPiso`,
`CreditosDescontados`, `estado_verificacion_estudiante`, etc.).

Por eso **en una base nueva no hay que correr las `migration_*.sql` una por una**.
Solo faltan dos cosas que el dump no trae:

| Archivo | Qué aporta | ¿Correr en base nueva? |
|---|---|---|
| `init/01_schema.sql` | Estructura completa | **Sí, primero** |
| `migration_permisos_staff_v2.sql` | Cataloga los 17 permisos. La tabla `permisos` nace vacía y sin esto el panel de admin no muestra ningún módulo | **Sí, segundo** |
| `migration_indice_password_reset.sql` | Índice de recuperación de contraseña | **Sí, tercero** (opcional, solo rendimiento) |
| Las otras 11 `migration_*.sql` | Ya aplicadas dentro del dump | No |
| `reparacion_permisos_rol.sql` | Arregla datos corrompidos por un bug viejo | No — es para bases existentes |

## Comandos

Con la *External Database URL* que te da Render:

```bash
export DB="postgresql://usuario:password@host.oregon-postgres.render.com/basename"

psql "$DB" -v ON_ERROR_STOP=1 -f init/01_schema.sql
psql "$DB" -v ON_ERROR_STOP=1 -f migration_permisos_staff_v2.sql
psql "$DB" -v ON_ERROR_STOP=1 -f migration_indice_password_reset.sql
```

En PowerShell:

```powershell
$env:DB = "postgresql://usuario:password@host.oregon-postgres.render.com/basename"
psql $env:DB -v ON_ERROR_STOP=1 -f init/01_schema.sql
psql $env:DB -v ON_ERROR_STOP=1 -f migration_permisos_staff_v2.sql
psql $env:DB -v ON_ERROR_STOP=1 -f migration_indice_password_reset.sql
```

`ON_ERROR_STOP=1` corta al primer error en vez de seguir y dejar la base a medias.

## Verificar

```bash
psql "$DB" -c "\dt"                          # deben aparecer 23 tablas
psql "$DB" -c "SELECT COUNT(*) FROM permisos;" # debe dar 17
```

## Crear el primer admin

El schema no trae usuarios. Sin un admin no podés entrar al panel.
Desde la raíz del backend, con `DATABASE_URL` ya apuntando a producción:

```bash
node crear-admin.mjs
```

## Datos de prueba (opcional)

`seed.mjs` y `seed-asistencia-hoy.mjs` cargan datos de ejemplo. Útiles para una
demo, pero revisá su contenido antes de correrlos contra producción.
