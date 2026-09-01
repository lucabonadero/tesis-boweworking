# Gestión de recursos y disponibilidad — Diseño

**Fecha:** 2026-09-01
**Requisitos:** RF16 (bloqueos temporales de recursos), RF17 (impedir reservas sobre recurso bloqueado o fuera de disponibilidad)
**Rama base:** `feat/sistema-creditos`

## Contexto

El proyecto ya tiene jerarquía `Pisos → Espacios → Recursos` (`migration_estructura_dinamica.sql`), módulo de reservas
(`reservas.controller.js`) y roles/permisos. El horario operativo hoy es global y hardcodeado en
`coworkingHours.service.js` (`COWORKING_APERTURA` 09:00 / `COWORKING_CIERRE` 21:00), sin disponibilidad por recurso ni
bloqueos temporales.

Este diseño agrega ambas cosas sin romper el comportamiento actual: un recurso sin disponibilidad configurada sigue
usando la ventana global.

## 1. Modelo de datos

Migración nueva: `backend/database/migration_disponibilidad_recursos.sql`. No modifica tablas existentes.

```sql
CREATE TABLE "DisponibilidadRecurso" (
  "idDisponibilidad" SERIAL PRIMARY KEY,
  "idRecurso"   INTEGER NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "DiaSemana"   SMALLINT NOT NULL CHECK ("DiaSemana" BETWEEN 0 AND 6), -- 0=domingo
  "HoraInicio"  TIME NOT NULL,
  "HoraFin"     TIME NOT NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ("HoraInicio" < "HoraFin")
);
CREATE INDEX idx_disp_recurso ON "DisponibilidadRecurso"("idRecurso", "DiaSemana");

CREATE TABLE "BloqueosRecurso" (
  "idBloqueo"   SERIAL PRIMARY KEY,
  "idRecurso"   INTEGER NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "FechaInicio" TIMESTAMP NOT NULL,
  "FechaFin"    TIMESTAMP NOT NULL,
  "Motivo"      VARCHAR(300),
  "creadoPor"   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ("FechaInicio" < "FechaFin")
);
CREATE INDEX idx_bloq_recurso_rango ON "BloqueosRecurso"("idRecurso", "FechaInicio", "FechaFin");
```

Decisiones:

- **Sin filas = horario global.** Un recurso sin `DisponibilidadRecurso` usa `[COWORKING_APERTURA, COWORKING_CIERRE]`.
  Backward-compatible: los recursos actuales siguen funcionando sin backfill.
- **Múltiples franjas por día de semana** (permite corte de mediodía).
- **Bloqueos con TIMESTAMP**, no DATE: soporta bloqueos parciales ("mañana de 14 a 18") y días completos.
- **La tabla de usuarios es `usuarios` (minúscula, PK `id`)**, verificado en `auth.controller.js:11`. No es
  `"Usuarios"."idUsuario"`.
- **Bloqueo sobre recurso padre cascadea a los hijos**, resuelto en el validador (no en el esquema).

## 2. Servicio de validación

Archivo nuevo: `backend/src/services/disponibilidadRecurso.service.js`.

```js
validarDisponibilidadRecurso({ idRecurso, diaReserva, horaInicio, horaFin, tipoReserva })
// → null si es válido, o { codigo, message, detalle } si falla
```

Orden de chequeos:

1. **Cadena de recursos.** CTE recursivo `idRecurso → idRecursoPadre → ...`. Los bloqueos se evalúan contra el recurso
   y todos sus ancestros, para que bloquear un grupo bloquee sus hijos.
2. **Bloqueos (RF16).** Solapamiento: `FechaInicio < finSolicitado AND FechaFin > inicioSolicitado`. Para
   `tipoReserva != 'turno'` el rango solicitado se expande a los 7 (semanal) o 30 (mensual) días, con la misma lógica de
   expansión que usa `disponibilidadTurno.service.js`.
3. **Disponibilidad configurada (RF17).** Si el recurso tiene franjas para ese día de semana, el turno debe entrar
   **completo** en alguna franja. Sin franjas, cae a `validarVentanaOperativaTurno`. Para semanal/mensual, el horario se
   valida contra cada día de semana abarcado.

**Puntos de llamada** — los cuatro caminos que crean o mueven una reserva:

| Función | Archivo | Línea aprox. |
|---|---|---|
| `crearReserva` | `reservas.controller.js` | 858 |
| `crearReservasMultiples` | `reservas.controller.js` | 988 |
| `crearSerieMensual` | `reservas.controller.js` | 454 |
| `actualizarReserva` (al cambiar recurso u horario) | `reservas.controller.js` | ~1175 |

Se ejecuta **dentro de la transacción**, después de `bloquearEspaciosDeRecursos`, para evitar la carrera entre un admin
creando un bloqueo y un usuario reservando.

## 3. Endpoints

`backend/src/routes/disponibilidad.routes.js`, montado en `/api/disponibilidad`. Escritura protegida con
`verificarToken, verificarStaff` (mismo patrón que `recursos.routes.js`).

```
GET    /api/disponibilidad/bloqueos?idRecurso=&desde=&hasta=   público
POST   /api/disponibilidad/bloqueos                            staff
PUT    /api/disponibilidad/bloqueos/:id                        staff
DELETE /api/disponibilidad/bloqueos/:id                        staff

GET    /api/disponibilidad/recurso/:idRecurso                  público
PUT    /api/disponibilidad/recurso/:idRecurso                  staff — reemplaza el set completo de franjas

GET    /api/disponibilidad/slots?idRecurso=&fecha=             público
```

- `PUT /recurso/:id` reemplaza todas las franjas en una transacción (DELETE + INSERT). Encaja con la grilla del admin,
  que envía un estado completo, no diffs.
- `GET /slots` devuelve `[{ hora, disponible, motivo }]` para el día pedido. Es lo que apaga horarios en el selector del
  usuario.
- Validación de body con Zod en `validation.schemas.js`, siguiendo lo existente.
- Al crear un bloqueo, la respuesta incluye `reservasAfectadas` (reservas confirmadas dentro del rango) como
  advertencia. **No se cancelan automáticamente**: cancelar dispara devolución de créditos, que es otro flujo.

## 4. Errores

El validador devuelve un objeto tipado; el controller responde `400`:

```json
{
  "codigo": "RECURSO_BLOQUEADO",
  "message": "La Sala Norte está bloqueada hasta el 12/03 a las 18:00.",
  "detalle": { "idBloqueo": 7, "fechaFin": "2026-03-12T18:00:00", "motivo": "Mantenimiento" }
}
```

| Código | Mensaje |
|---|---|
| `RECURSO_BLOQUEADO` | "X está bloqueado hasta el DD/MM a las HH:mm." (+ motivo si existe) |
| `FUERA_DE_DISPONIBILIDAD` | "X no está disponible en ese horario. Los martes se puede reservar de 10:00 a 18:00." |
| `DIA_NO_DISPONIBLE` | "X no está disponible los domingos." |
| `RECURSO_INACTIVO` | El recurso fue dado de baja. |

`message` viene listo para mostrar. `codigo` permite que el frontend reaccione distinto sin parsear texto.

## 5. Frontend

### Panel admin — `src/pages/admin/GestionDisponibilidad.jsx`

Entrada nueva en `PanelAdmin.jsx`. Layout de dos columnas:

- **Izquierda:** `Cascader` de Ant Design (Piso → Espacio). Al elegir espacio, grid de tarjetas de sus recursos con el
  icono de `TiposRecurso`. Tarjeta activa resaltada; badge rojo si el recurso tiene bloqueos vigentes.
- **Derecha, dos tabs:**
  - **Horarios** — grilla semanal (7 columnas × 09:00–21:00). Click-drag pinta franjas disponibles en verde. Botón
    "copiar lunes a toda la semana". Guardar → `PUT /recurso/:id`.
  - **Bloqueos** — `RangePicker` con `showTime`, campo motivo, botón crear. Lista debajo con editar/eliminar. Los
    bloqueos se pintan en rojo sobre la grilla de la tab Horarios.

### Flujo de reserva del usuario

Consume `GET /slots`: los horarios no disponibles quedan `disabled` con tooltip del motivo ("Bloqueado: mantenimiento",
"Fuera de horario"). Los recursos con bloqueo total en la fecha elegida se muestran atenuados. El backend sigue
validando igual — la UI previene, no garantiza.

## 6. TanStack Query

`src/hooks/useDisponibilidad.js`, mismo patrón de key-factory que `useAdminCreditos.js`:

```js
export const disponibilidadKeys = {
  all: ["disponibilidad"],
  recurso: (id) => ["disponibilidad", "recurso", id],
  bloqueos: (id) => ["disponibilidad", "bloqueos", id],
  slots: (id, fecha) => ["disponibilidad", "slots", id, fecha],
};
```

Cada mutation del admin invalida `disponibilidadKeys.all` en `onSuccess`. Como las queries de `slots` cuelgan del mismo
prefijo, el flujo del usuario se refresca solo.

Del lado del usuario: `refetchOnWindowFocus: true` y `staleTime: 30s` en `slots`. **Sin WebSockets** — no hay infra de
sockets en el proyecto y agregarla para esto es desproporcionado. Push real, si se quiere, es un cambio aditivo
posterior.

## Testing

Tests unitarios de `disponibilidadRecurso.service.js` siguiendo el patrón de `reservaMutability.service.test.js`:

- Recurso sin disponibilidad configurada → cae a la ventana global.
- Turno dentro / parcialmente fuera / totalmente fuera de una franja.
- Turno en un día de semana sin franjas configuradas.
- Bloqueo que solapa por el inicio, por el fin, que contiene el turno, y adyacente sin solapar.
- Bloqueo sobre el recurso padre → rechaza la reserva del hijo.
- Reserva semanal y mensual contra un bloqueo dentro del rango expandido.

## Fuera de alcance

- Cancelación automática de reservas afectadas por un bloqueo nuevo (solo se advierte).
- Disponibilidad heredada por piso o espacio (se configura por recurso).
- WebSockets / push en tiempo real.
- Bloqueos recurrentes (ej. "todos los feriados").
