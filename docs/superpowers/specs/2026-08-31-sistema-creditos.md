# Especificación — Sistema de créditos (RF06–RF10)

**Proyecto:** Bo WeWorking
**Fecha:** 2026-08-31
**Módulo previo del que depende:** roles de usuario final (RF01–RF05), ya implementado.

---

## 1. Requisitos funcionales

| RF | Descripción |
|----|-------------|
| RF06 | Los usuarios finales tienen un saldo de créditos. Los créditos son el **único** medio de pago de una reserva. |
| RF07 | Al confirmar una reserva, el saldo se descuenta automáticamente. |
| RF08 | El administrador puede sumar o restar créditos manualmente al saldo de cualquier usuario. |
| RF09 | El administrador puede crear y configurar paquetes de créditos (cantidad + precio). |
| RF10 | Los usuarios pueden consultar su saldo disponible desde su cuenta. |

---

## 2. Decisión de arquitectura: MercadoPago cambia de lugar

Hasta ahora MercadoPago cobraba reservas. A partir de este módulo:

- **Una reserva se paga siempre con créditos.** No hay checkout de MercadoPago
  al reservar. El cliente no elige medio de pago.
- **MercadoPago cobra exclusivamente compras de créditos.** El cliente compra un
  paquete, la acreditación llega por webhook y a partir de ahí reserva contra su
  saldo.
- **El flujo de pago de reserva por MercadoPago se elimina.** El registro de pago
  presencial del staff en el módulo financiero se conserva sin cambios: es el
  circuito de caja, ajeno a los créditos.

Ejemplo de punta a punta: el cliente compra 100 créditos por $10.000. Elige
espacios para reservar y el total en créditos se actualiza en cada selección. Al
confirmar, los créditos se descuentan del saldo comprado.

---

## 3. Alcance

### Dentro del alcance

- Modelo de datos: saldo por usuario, movimientos, paquetes, compras.
- Descuento transaccional de créditos al confirmar una reserva.
- Compra de paquetes con MercadoPago: preferencia, webhook y acreditación idempotente.
- Endpoints: saldo propio, historial propio, cotización de reserva en créditos,
  ajuste manual admin, CRUD de paquetes, compra de paquete.
- Validación Zod de todos los cuerpos, parámetros y queries.
- Frontend: widget de saldo y pop-up de compra en el header, cotización en vivo
  al seleccionar espacios, historial de movimientos, panel admin.
- Baja del checkout de MercadoPago para reservas.

### Fuera del alcance (módulos siguientes)

- **Reintegro por cancelación de reserva.** El tipo `reintegro_cancelacion` queda
  en el `CHECK` de la tabla de movimientos y la columna `id_reserva` queda
  disponible, pero no se implementa endpoint ni lógica de devolución.

---

## 4. Modelo de datos

Migración aditiva en `backend/database/migration_creditos.sql`.

### 4.1 `creditos_saldo` — saldo actual por usuario final

Una fila por usuario de `ClienteUsuario`. Es un **caché materializado** del saldo:
la verdad la tiene el libro de movimientos, pero mantener el saldo en una fila
permite bloquearla con `SELECT ... FOR UPDATE` y serializar las operaciones
concurrentes sin sumar todo el historial en cada reserva.

| Columna | Tipo | Notas |
|---------|------|-------|
| `cliente_usuario_id` | `INTEGER PRIMARY KEY` | FK a `"ClienteUsuario"(id) ON DELETE CASCADE` |
| `saldo` | `INTEGER NOT NULL DEFAULT 0` | Créditos enteros. Negativo solo si un admin lo autorizó. |
| `actualizado_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

Los créditos son **enteros**. No hay medios créditos.

### 4.2 `creditos_movimiento` — libro mayor, append-only

Nunca se hace `UPDATE` ni `DELETE`. Cada operación que toca el saldo inserta una
fila. `saldo_posterior` deja la auditoría cerrada: se puede verificar la
consistencia sin recalcular toda la historia.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `cliente_usuario_id` | `INTEGER NOT NULL` | FK a `"ClienteUsuario"(id) ON DELETE CASCADE` |
| `tipo` | `VARCHAR(30) NOT NULL` | `CHECK IN ('descuento_reserva','ajuste_admin','compra_paquete','reintegro_cancelacion')` |
| `cantidad` | `INTEGER NOT NULL` | **Con signo.** Negativa descuenta, positiva acredita. `CHECK (cantidad <> 0)`. |
| `saldo_posterior` | `INTEGER NOT NULL` | Saldo resultante tras aplicar `cantidad`. |
| `motivo` | `TEXT` | Obligatorio a nivel aplicación para `ajuste_admin`. |
| `id_reserva` | `INTEGER` | FK a `"Reservas"("idReserva") ON DELETE SET NULL`. |
| `compra_id` | `INTEGER` | FK a `creditos_compra(id) ON DELETE SET NULL`. Solo en `compra_paquete`. |
| `admin_usuario_id` | `INTEGER` | FK a `usuarios(id) ON DELETE SET NULL`. |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

Índice `(cliente_usuario_id, created_at DESC)` para el historial paginado.

Una reserva múltiple genera **un solo** movimiento por el total, referenciando la
reserva de menor id del grupo.

### 4.3 `creditos_paquete` — paquetes vendibles (RF09)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `nombre` | `VARCHAR(120) NOT NULL` | |
| `creditos` | `INTEGER NOT NULL` | `CHECK (creditos > 0)` |
| `precio` | `NUMERIC(10,2) NOT NULL` | `CHECK (precio >= 0)`. Pesos argentinos. |
| `descripcion` | `TEXT` | |
| `activo` | `BOOLEAN NOT NULL DEFAULT TRUE` | |
| `created_at` / `actualizado_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

**Baja lógica.** Eliminar un paquete lo marca `activo = FALSE`; nunca se borra la
fila, porque las compras históricas la referencian.

### 4.4 `creditos_compra` — compras de paquetes vía MercadoPago

Registra el intento de compra desde que se crea la preferencia. El webhook la
busca por `mp_payment_id` o por su `id`, y acredita una sola vez.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `SERIAL PRIMARY KEY` | |
| `cliente_usuario_id` | `INTEGER NOT NULL` | FK a `"ClienteUsuario"(id) ON DELETE CASCADE` |
| `paquete_id` | `INTEGER` | FK a `creditos_paquete(id) ON DELETE SET NULL` |
| `creditos` | `INTEGER NOT NULL` | Copia del paquete al momento de comprar. |
| `precio` | `NUMERIC(10,2) NOT NULL` | Copia del precio al momento de comprar. |
| `estado` | `VARCHAR(20) NOT NULL DEFAULT 'pendiente'` | `CHECK IN ('pendiente','acreditada','rechazada')` |
| `mp_preference_id` | `VARCHAR(120)` | |
| `mp_payment_id` | `VARCHAR(120)` | `UNIQUE`. Ancla la idempotencia del webhook. |
| `acreditada_at` | `TIMESTAMP` | |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | |

Los créditos y el precio se **copian** en la compra: si el admin edita el paquete
después, la compra histórica conserva lo que el cliente realmente pagó.

### 4.5 `creditos_config` — configuración global, fila única

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `INTEGER PRIMARY KEY` | `CHECK (id = 1)`. Fila única. |
| `pesos_por_credito` | `NUMERIC(10,2) NOT NULL DEFAULT 100.00` | `CHECK (pesos_por_credito > 0)` |

Convierte el monto en pesos de una reserva a créditos. Se siembra en `100.00`,
coherente con el ejemplo de negocio: 100 créditos por $10.000.

---

## 5. Reglas de negocio

### 5.1 Costo en créditos de una reserva

```
creditosNecesarios = ceil(montoEnPesos / pesos_por_credito)
```

Siempre hacia arriba: el coworking no regala fracciones. Monto `0` cuesta `0`
créditos y no genera movimiento.

Para una reserva múltiple, el costo se calcula sobre la **suma** de los montos y
se redondea una sola vez al final. Redondear cada renglón por separado le
cobraría de más al cliente.

### 5.2 Descuento automático (RF07)

Se dispara siempre que un cliente crea una reserva. No hay bandera ni elección:
los créditos son el único medio de pago.

- El staff que carga una reserva por mostrador **no** descuenta créditos: esa
  reserva se cobra por el circuito de caja del módulo financiero.
- Todo dentro de **una sola transacción** con la creación de la reserva:
  1. `BEGIN`
  2. Bloqueo de espacios (`bloquearEspaciosDeRecursos`), ya existente.
  3. `SELECT saldo FROM creditos_saldo WHERE cliente_usuario_id = $1 FOR UPDATE`
     — bloquea la fila; una segunda reserva simultánea del mismo usuario espera acá.
  4. Si no existe fila, se inserta con `saldo = 0` y se vuelve a bloquear.
  5. Si `saldo < creditosNecesarios` → `ROLLBACK` y `409` con código
     `SALDO_INSUFICIENTE`, informando `creditosNecesarios`, `saldoActual` y
     `creditosFaltantes` para que la interfaz abra la compra con el faltante ya calculado.
  6. `INSERT` de la reserva.
  7. `UPDATE creditos_saldo SET saldo = saldo - n`.
  8. `INSERT` en `creditos_movimiento` con `tipo = 'descuento_reserva'`.
  9. `COMMIT`
- El bloqueo de saldo se toma **después** del de espacios para conservar un orden
  de adquisición de locks único en todo el sistema y no introducir deadlocks.

### 5.3 Saldo insuficiente

La reserva **no se crea**. El servidor responde `409` con el faltante calculado y
la interfaz abre el pop-up de compra de créditos. No existen reservas en estado
"pendiente de pago": el espacio no se bloquea sin saldo.

### 5.4 Compra de créditos (RF09)

- El cliente elige un paquete **de la lista activa**. Nunca envía un monto: el
  precio sale del paquete leído en el servidor, así no puede manipularse desde
  el navegador.
- Se crea la fila `creditos_compra` en estado `pendiente` junto con la
  preferencia de MercadoPago.
- `external_reference` de la preferencia lleva el prefijo `creditos-<compraId>`,
  para que el webhook distinga una compra de créditos de cualquier referencia
  antigua de reserva.
- El webhook acredita cuando el pago llega `approved`:
  - Bloquea la compra con `FOR UPDATE`.
  - Si ya está `acreditada`, no hace nada y responde `200` (idempotencia: MercadoPago
    reintenta la misma notificación).
  - Si no, bloquea el saldo, suma los créditos, inserta el movimiento
    `compra_paquete` y marca la compra `acreditada`.
  - Todo en una transacción.
- Un pago `rejected` o `cancelled` marca la compra `rechazada` sin tocar el saldo.

### 5.5 Ajuste manual del administrador (RF08)

- Requiere permiso `gestionar_creditos` (permiso nuevo del catálogo).
- `motivo` es **obligatorio**: mínimo 3 caracteres tras recortar espacios.
- `cantidad` es un entero con signo distinto de cero.
- Si el ajuste dejaría el saldo **negativo**, se rechaza con `409` y código
  `SALDO_NEGATIVO_NO_AUTORIZADO`, salvo que el cuerpo traiga
  `permitirNegativo: true`. Ese flag es la autorización explícita del admin.
- Se registra `admin_usuario_id` con el id del token.

---

## 6. API

Todas las rutas devuelven JSON. Errores con `{ message, codigo? }`, coherente con
el resto del backend.

### 6.1 Usuario final — `/api/creditos` (token cliente, cuenta activa)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/creditos/saldo` | RF10. `{ saldo, pesosPorCredito, actualizadoAt }` |
| `GET` | `/api/creditos/movimientos?limit&offset` | Historial propio, más reciente primero. |
| `GET` | `/api/creditos/paquetes` | Paquetes activos, para el pop-up de compra. |
| `POST` | `/api/creditos/cotizar` | Costo en créditos de una selección de recursos, antes de reservar. |
| `POST` | `/api/creditos/comprar` | Body `{ paqueteId }`. Crea la preferencia de MercadoPago. |

### 6.2 Administración — `/api/admin/creditos` (permiso `gestionar_creditos`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/admin/creditos/usuarios/:id` | Saldo + últimos movimientos de un usuario. |
| `POST` | `/api/admin/creditos/usuarios/:id/ajuste` | RF08. Body `{ cantidad, motivo, permitirNegativo? }`. |
| `GET` | `/api/admin/creditos/paquetes` | Lista todos, incluidos inactivos. |
| `POST` | `/api/admin/creditos/paquetes` | RF09. Crea. |
| `PUT` | `/api/admin/creditos/paquetes/:id` | RF09. Edita. |
| `DELETE` | `/api/admin/creditos/paquetes/:id` | Baja lógica (`activo = FALSE`). |

### 6.3 Cambios en endpoints existentes

- `POST /api/reservas` y `POST /api/reservas/multiples`: para tokens de cliente,
  descuentan créditos. La respuesta incorpora
  `creditos: { descontados, saldo }`. Sin saldo, `409 SALDO_INSUFICIENTE`.
- `POST /api/pagos/crear-preferencia`: deja de aceptar `idReserva`, `idSerie` e
  `idReservaGrupo`. Responde `410 Gone` con el mensaje de que las reservas se
  pagan con créditos.
- `POST /api/pagos/webhook`: distingue por el prefijo de `external_reference`.
  `creditos-<id>` acredita créditos; cualquier otra referencia se ignora
  (compatibilidad con notificaciones tardías de pagos de reserva antiguos).

---

## 7. Frontend

- **Widget de saldo** en el header, junto al icono de perfil, solo para usuarios
  finales autenticados.
- **Pop-up de compra de créditos** con el logo de MercadoPago, abierto desde el
  header o automáticamente cuando falta saldo al confirmar una reserva. Muestra
  los paquetes activos y redirige al checkout.
- **Cotización en vivo**: al seleccionar espacios, el total en créditos se
  actualiza en cada cambio de selección, y se compara contra el saldo disponible.
- **Historial de movimientos**: sección en `/perfil`, tabla paginada.
- **Panel admin de créditos** en `/admin-creditos`, protegido por
  `gestionar_creditos`: paquetes y ajustes manuales.
- **Baja del checkout de reserva**: los botones de "Pagar con MercadoPago" sobre
  reservas desaparecen de la interfaz del cliente.
- **TanStack Query**: toda mutación que afecte el saldo invalida `["creditos"]`.
  La vuelta del checkout de compra invalida además el saldo tras confirmar la
  acreditación.

---

## 8. Restricciones globales

- Node.js 20+, ESM (`"type": "module"`), sin TypeScript.
- PostgreSQL 14+. Identificadores de tablas nuevas en `snake_case` sin comillas;
  las tablas heredadas (`"ClienteUsuario"`, `"Reservas"`, `"Recursos"`,
  `"Transaccion"`) mantienen su casing entrecomillado.
- Zod 4 para toda validación de entrada, vía `validateBody` / `validateQuery` /
  `validateParams` de `backend/src/middleware/validate.middleware.js`.
- Tests con el runner nativo `node:test`, sobre servicios de lógica pura y sin
  base de datos, siguiendo el patrón de `rolUsuario.service.test.js`.
- React 19 + Vite + Ant Design 5 + TanStack Query 5. Sin librerías nuevas.
- Textos de interfaz en español.
- Comentarios de código: los justos. Explican **por qué**, nunca **qué** hace la
  línea siguiente. Sin encabezados decorativos ni redundancias.
