# Sistema de Créditos — Plan de Implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para el seguimiento.

**Goal:** Convertir los créditos en el único medio de pago de reservas de Bo WeWorking, con compra de créditos por MercadoPago, descuento transaccional al reservar, ajuste manual del administrador y paquetes configurables (RF06–RF10).

**Architecture:** El saldo vive en una fila por usuario (`creditos_saldo`) que actúa de caché bloqueable, mientras la verdad auditable está en un libro append-only (`creditos_movimiento`). Toda operación que toca el saldo bloquea la fila con `SELECT ... FOR UPDATE` dentro de la misma transacción que la operación de negocio, de modo que dos reservas simultáneas del mismo usuario se serializan y no pueden sobregirar el saldo. MercadoPago deja de cobrar reservas y pasa a cobrar compras de paquetes: la fila `creditos_compra` nace con la preferencia y el webhook la acredita una sola vez, distinguiendo el flujo por el prefijo `creditos-` en `external_reference`. Las decisiones de negocio viven en servicios de lógica pura sin base de datos, testeables con `node:test`.

**Tech Stack:** Node.js 20 (ESM), Express 4, PostgreSQL 14+ (driver `pg`), Zod 4, JWT, `node:test`. Frontend React 19, Vite, Ant Design 5, TanStack Query 5.

**Spec:** `docs/superpowers/specs/2026-08-31-sistema-creditos.md`

## Global Constraints

- Node.js 20+, ESM: todo archivo nuevo usa `import`/`export`, nunca `require`.
- PostgreSQL 14+. Tablas nuevas en `snake_case` sin comillas dobles. Las tablas heredadas conservan su casing y **siempre van entrecomilladas**: `"ClienteUsuario"`, `"Reservas"`, `"Recursos"`, `"Transaccion"`.
- Los créditos son **enteros**. Nunca decimales.
- Zod 4 para toda validación de entrada, aplicada con `validateBody` / `validateQuery` / `validateParams` de `backend/src/middleware/validate.middleware.js`.
- Todos los esquemas Zod se definen en `backend/src/schemas/validation.schemas.js`.
- Tests con `node:test` + `node:assert/strict`, sólo sobre servicios de lógica pura sin base de datos.
- Cada archivo de test nuevo debe agregarse al script `test` de `backend/package.json`.
- Permiso nuevo del catálogo: `gestionar_creditos`. El rol `admin` lo tiene implícito.
- Textos de interfaz y mensajes de error en español.
- React 19 + Ant Design 5 + TanStack Query 5. Sin dependencias nuevas.
- `pesos_por_credito` sale de `creditos_config` (fila única, `id = 1`), sembrada en `100.00`.
- `external_reference` de una compra de créditos es `creditos-<compraId>`.
- Mensajes de commit en inglés con prefijo convencional (`feat:`, `fix:`, `test:`).
- **Comentarios de código: los justos.** Explican *por qué*, nunca *qué* hace la línea siguiente. Nada de encabezados decorativos ni de repetir en prosa lo que el código ya dice.

---

## Estructura de archivos

### Backend — a crear

| Archivo | Responsabilidad |
|---------|-----------------|
| `backend/database/migration_creditos.sql` | Tablas `creditos_saldo`, `creditos_movimiento`, `creditos_paquete`, `creditos_compra`, `creditos_config`; permiso `gestionar_creditos`. |
| `backend/src/services/creditos.service.js` | Lógica pura: costo en créditos, descuento, ajuste manual, paquetes, referencia externa de MercadoPago. |
| `backend/src/services/creditos.service.test.js` | Tests de la lógica pura. |
| `backend/src/repositories/creditos.repository.js` | Único lugar que ejecuta SQL de créditos. Recibe el `pool` o un `client` de transacción. |
| `backend/src/controllers/creditos.controller.js` | Endpoints del usuario final: saldo, movimientos, paquetes, cotización, compra. |
| `backend/src/controllers/adminCreditos.controller.js` | Endpoints de administración: ajuste manual y CRUD de paquetes. |
| `backend/src/routes/creditos.routes.js` | Rutas `/api/creditos`. |
| `backend/src/routes/adminCreditos.routes.js` | Rutas `/api/admin/creditos`. |

### Backend — a modificar

| Archivo | Cambio |
|---------|--------|
| `backend/src/schemas/validation.schemas.js` | Esquemas Zod de créditos. |
| `backend/src/controllers/reservas.controller.js` | Descuento de créditos en `crearReserva` y `crearReservasMultiples`. |
| `backend/src/controllers/mercadopago.controller.js` | Baja del checkout de reserva; acreditación de compras en el webhook. |
| `backend/src/server.js` | Montaje de las rutas nuevas. |
| `backend/package.json` | Alta del test nuevo. |

### Frontend — a crear

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/hooks/useCreditos.js` | Hooks del usuario final: saldo, movimientos, paquetes, cotización, compra. |
| `src/hooks/useAdminCreditos.js` | Hooks de administración. |
| `src/utils/creditosFormato.js` | Etiquetas, colores y formato de los movimientos. |
| `src/components/SaldoCreditosWidget.jsx` | Chip de saldo del header, abre la compra. |
| `src/components/ComprarCreditosModal.jsx` | Pop-up de compra con los paquetes y MercadoPago. |
| `src/components/HistorialCreditos.jsx` | Tabla de movimientos para `/perfil`. |
| `src/pages/admin/GestionCreditos.jsx` | Panel admin: paquetes y ajustes. |

### Frontend — a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/header.jsx` | Widget de saldo junto al perfil. |
| `src/pages/public/registrocliente.jsx` | Cotización en créditos en vivo; baja del pago de reserva; compra ante saldo insuficiente. |
| `src/pages/public/perfil.jsx` | Historial de créditos; baja del pago de reserva. |
| `src/pages/public/pagoConfirmacion.jsx` | Vuelta del checkout de compra de créditos. |
| `src/App.jsx` | Ruta `/admin-creditos`. |
| `src/pages/admin/PanelAdmin.jsx` | Acceso al panel de créditos. |

---

## Tarea 1: Migración de base de datos

**Files:**
- Create: `backend/database/migration_creditos.sql`

**Interfaces:**
- Consumes: tablas existentes `"ClienteUsuario"(id)`, `"Reservas"("idReserva")`, `usuarios(id)`, `permisos(clave, descripcion, modulo)`.
- Produces: tablas `creditos_saldo`, `creditos_movimiento`, `creditos_paquete`, `creditos_compra`, `creditos_config`; permiso `gestionar_creditos`.

- [ ] **Paso 1: Escribir la migración**

Crear `backend/database/migration_creditos.sql`:

```sql
-- Migración: sistema de créditos (RF06 - RF10).
-- Aditiva: no modifica ni borra datos existentes. Ejecutar una sola vez.

BEGIN;

CREATE TABLE IF NOT EXISTS creditos_config (
  id                INTEGER       PRIMARY KEY CHECK (id = 1),
  pesos_por_credito NUMERIC(10,2) NOT NULL DEFAULT 100.00
                    CHECK (pesos_por_credito > 0)
);

INSERT INTO creditos_config (id, pesos_por_credito)
VALUES (1, 100.00)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS creditos_paquete (
  id             SERIAL        PRIMARY KEY,
  nombre         VARCHAR(120)  NOT NULL,
  creditos       INTEGER       NOT NULL CHECK (creditos > 0),
  precio         NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  descripcion    TEXT,
  activo         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP     NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creditos_paquete_activo
  ON creditos_paquete (activo) WHERE activo = TRUE;

-- El saldo se materializa en una fila por usuario para poder bloquearlo con
-- FOR UPDATE y serializar reservas simultáneas.
CREATE TABLE IF NOT EXISTS creditos_saldo (
  cliente_usuario_id INTEGER   PRIMARY KEY
                     REFERENCES "ClienteUsuario"(id) ON DELETE CASCADE,
  saldo              INTEGER   NOT NULL DEFAULT 0,
  actualizado_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Compras de paquetes vía Mercado Pago. mp_payment_id es UNIQUE: ancla la
-- idempotencia del webhook, que reintenta la misma notificación.
CREATE TABLE IF NOT EXISTS creditos_compra (
  id                 SERIAL        PRIMARY KEY,
  cliente_usuario_id INTEGER       NOT NULL
                     REFERENCES "ClienteUsuario"(id) ON DELETE CASCADE,
  paquete_id         INTEGER       REFERENCES creditos_paquete(id) ON DELETE SET NULL,
  creditos           INTEGER       NOT NULL CHECK (creditos > 0),
  precio             NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  estado             VARCHAR(20)   NOT NULL DEFAULT 'pendiente',
  mp_preference_id   VARCHAR(120),
  mp_payment_id      VARCHAR(120)  UNIQUE,
  acreditada_at      TIMESTAMP,
  created_at         TIMESTAMP     NOT NULL DEFAULT NOW()
);

ALTER TABLE creditos_compra DROP CONSTRAINT IF EXISTS creditos_compra_estado_check;
ALTER TABLE creditos_compra
  ADD CONSTRAINT creditos_compra_estado_check
  CHECK (estado IN ('pendiente', 'acreditada', 'rechazada'));

CREATE INDEX IF NOT EXISTS idx_creditos_compra_usuario
  ON creditos_compra (cliente_usuario_id, created_at DESC);

-- Libro append-only: nunca UPDATE ni DELETE. saldo_posterior cierra la
-- auditoría sin recalcular la historia entera.
CREATE TABLE IF NOT EXISTS creditos_movimiento (
  id                 SERIAL      PRIMARY KEY,
  cliente_usuario_id INTEGER     NOT NULL
                     REFERENCES "ClienteUsuario"(id) ON DELETE CASCADE,
  tipo               VARCHAR(30) NOT NULL,
  cantidad           INTEGER     NOT NULL CHECK (cantidad <> 0),
  saldo_posterior    INTEGER     NOT NULL,
  motivo             TEXT,
  id_reserva         INTEGER     REFERENCES "Reservas"("idReserva") ON DELETE SET NULL,
  compra_id          INTEGER     REFERENCES creditos_compra(id) ON DELETE SET NULL,
  admin_usuario_id   INTEGER     REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- 'reintegro_cancelacion' queda habilitado para el módulo de cancelaciones.
ALTER TABLE creditos_movimiento DROP CONSTRAINT IF EXISTS creditos_movimiento_tipo_check;
ALTER TABLE creditos_movimiento
  ADD CONSTRAINT creditos_movimiento_tipo_check
  CHECK (tipo IN (
    'descuento_reserva',
    'ajuste_admin',
    'compra_paquete',
    'reintegro_cancelacion'
  ));

CREATE INDEX IF NOT EXISTS idx_creditos_movimiento_usuario_fecha
  ON creditos_movimiento (cliente_usuario_id, created_at DESC);

INSERT INTO permisos (clave, descripcion, modulo) VALUES
  ('gestionar_creditos', 'Ajustar saldos y configurar paquetes de créditos', 'creditos')
ON CONFLICT (clave) DO NOTHING;

COMMIT;
```

- [ ] **Paso 2: Ejecutar la migración**

```bash
psql -h localhost -U postgres -d boweworking -f backend/database/migration_creditos.sql
```

Esperado: la salida termina en `COMMIT` sin ningún `ERROR`.

- [ ] **Paso 3: Verificar las tablas y sembrar un paquete de prueba**

```bash
psql -h localhost -U postgres -d boweworking \
  -c "\d creditos_compra" \
  -c "SELECT * FROM creditos_config;" \
  -c "INSERT INTO creditos_paquete (nombre, creditos, precio, descripcion) VALUES ('Pack 100', 100, 10000, 'Cien créditos') RETURNING id, nombre, creditos, precio;"
```

Esperado: la descripción de `creditos_compra` aparece, `creditos_config` devuelve una fila con `pesos_por_credito = 100.00`, y el paquete se inserta.

- [ ] **Paso 4: Commit**

```bash
git add backend/database/migration_creditos.sql
git commit -m "feat: add credits system database migration"
```

---

## Tarea 2: Servicio de lógica pura de créditos

Toda la decisión de negocio vive acá, sin base de datos, para poder testearla sin levantar PostgreSQL.

**Files:**
- Create: `backend/src/services/creditos.service.js`
- Test: `backend/src/services/creditos.service.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `TIPOS_MOVIMIENTO: string[]`
  - `PESOS_POR_CREDITO_DEFECTO: number` (`100`)
  - `PREFIJO_REFERENCIA_COMPRA: string` (`"creditos-"`)
  - `creditosParaMonto(montoEnPesos: number, pesosPorCredito: number): number`
  - `creditosParaMontos(montos: number[], pesosPorCredito: number): number`
  - `evaluarDescuentoReserva({ saldoActual, montoEnPesos, pesosPorCredito }): { ok, codigo?, mensaje?, creditosNecesarios, creditosFaltantes, saldoPosterior, requiereMovimiento }`
  - `evaluarAjusteManual({ saldoActual, cantidad, motivo, permitirNegativo? }): { ok, codigo?, mensaje?, cantidad?, motivo?, saldoPosterior? }`
  - `normalizarPaquete({ nombre, creditos, precio, descripcion }): { ok, codigo?, mensaje?, paquete? }`
  - `referenciaCompra(compraId: number): string`
  - `parsearReferenciaCompra(externalReference: string): number|null`
  - `estadoCompraParaPago(estadoMercadoPago: string): "acreditada"|"rechazada"|null`

- [ ] **Paso 1: Escribir el test que falla**

Crear `backend/src/services/creditos.service.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_MOVIMIENTO,
  PESOS_POR_CREDITO_DEFECTO,
  creditosParaMonto,
  creditosParaMontos,
  evaluarDescuentoReserva,
  evaluarAjusteManual,
  normalizarPaquete,
  referenciaCompra,
  parsearReferenciaCompra,
  estadoCompraParaPago,
} from "./creditos.service.js";

test("el reintegro por cancelación queda preparado aunque no se implemente aún", () => {
  assert.ok(TIPOS_MOVIMIENTO.includes("reintegro_cancelacion"));
  assert.ok(TIPOS_MOVIMIENTO.includes("descuento_reserva"));
  assert.ok(TIPOS_MOVIMIENTO.includes("ajuste_admin"));
  assert.ok(TIPOS_MOVIMIENTO.includes("compra_paquete"));
});

test("monto exacto: un múltiplo no redondea de más", () => {
  assert.equal(creditosParaMonto(3000, 100), 30);
});

test("monto con resto: siempre redondea hacia arriba", () => {
  assert.equal(creditosParaMonto(2550, 100), 26);
  assert.equal(creditosParaMonto(1, 100), 1);
});

test("monto cero no cuesta créditos", () => {
  assert.equal(creditosParaMonto(0, 100), 0);
});

test("montos negativos o inválidos se tratan como cero", () => {
  assert.equal(creditosParaMonto(-500, 100), 0);
  assert.equal(creditosParaMonto(null, 100), 0);
  assert.equal(creditosParaMonto("abc", 100), 0);
});

test("tasa inválida cae al valor por defecto en lugar de dividir por cero", () => {
  assert.equal(creditosParaMonto(2000, 0), creditosParaMonto(2000, PESOS_POR_CREDITO_DEFECTO));
  assert.equal(creditosParaMonto(2000, null), 20);
});

test("reserva múltiple: se redondea el total, no cada renglón", () => {
  // Tres renglones de $150 son $450: 5 créditos. Redondear uno por uno daría 6
  // y le cobraría de más al cliente.
  assert.equal(creditosParaMontos([150, 150, 150], 100), 5);
});

test("cotizar una lista vacía no cuesta créditos", () => {
  assert.equal(creditosParaMontos([], 100), 0);
});

test("saldo suficiente: descuenta y deja el saldo posterior calculado", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 100, montoEnPesos: 3000, pesosPorCredito: 100 });

  assert.equal(r.ok, true);
  assert.equal(r.creditosNecesarios, 30);
  assert.equal(r.saldoPosterior, 70);
  assert.equal(r.requiereMovimiento, true);
  assert.equal(r.creditosFaltantes, 0);
});

test("saldo justo: alcanza y deja el saldo en cero", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 30, montoEnPesos: 3000, pesosPorCredito: 100 });

  assert.equal(r.ok, true);
  assert.equal(r.saldoPosterior, 0);
});

test("saldo insuficiente: informa cuántos créditos faltan para poder comprarlos", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 12, montoEnPesos: 3000, pesosPorCredito: 100 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SALDO_INSUFICIENTE");
  assert.equal(r.creditosNecesarios, 30);
  assert.equal(r.creditosFaltantes, 18, "la interfaz abre la compra con este número");
});

test("reserva sin costo: se permite y no genera movimiento", () => {
  const r = evaluarDescuentoReserva({ saldoActual: 0, montoEnPesos: 0, pesosPorCredito: 100 });

  assert.equal(r.ok, true);
  assert.equal(r.creditosNecesarios, 0);
  assert.equal(r.requiereMovimiento, false, "un movimiento de cantidad 0 viola el CHECK de la tabla");
  assert.equal(r.saldoPosterior, 0);
});

test("saldo negativo previo: no se puede reservar hasta regularizar", () => {
  const r = evaluarDescuentoReserva({ saldoActual: -5, montoEnPesos: 1000, pesosPorCredito: 100 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SALDO_INSUFICIENTE");
  assert.equal(r.creditosFaltantes, 15);
});

test("acreditación con motivo: suma al saldo", () => {
  const r = evaluarAjusteManual({ saldoActual: 5, cantidad: 10, motivo: "Compra presencial" });

  assert.equal(r.ok, true);
  assert.equal(r.cantidad, 10);
  assert.equal(r.saldoPosterior, 15);
  assert.equal(r.motivo, "Compra presencial");
});

test("débito que deja saldo positivo: permitido", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: -4, motivo: "Corrección de carga" });

  assert.equal(r.ok, true);
  assert.equal(r.saldoPosterior, 6);
});

test("motivo obligatorio: sin motivo se rechaza", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 5, motivo: "" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("motivo de solo espacios no cuenta como motivo", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 5, motivo: "   " });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("el motivo se recorta antes de guardarse", () => {
  const r = evaluarAjusteManual({ saldoActual: 0, cantidad: 3, motivo: "  Premio de fidelidad  " });

  assert.equal(r.ok, true);
  assert.equal(r.motivo, "Premio de fidelidad");
});

test("cantidad cero: no es un ajuste, se rechaza", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 0, motivo: "Sin efecto" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CANTIDAD_INVALIDA");
});

test("cantidad decimal: los créditos son enteros", () => {
  const r = evaluarAjusteManual({ saldoActual: 10, cantidad: 2.5, motivo: "Medio crédito" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CANTIDAD_INVALIDA");
});

test("débito que dejaría saldo negativo: bloqueado por defecto", () => {
  const r = evaluarAjusteManual({ saldoActual: 3, cantidad: -10, motivo: "Penalización" });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SALDO_NEGATIVO_NO_AUTORIZADO");
  assert.ok(r.mensaje.includes("-7"), "el mensaje debe mostrar el saldo que quedaría");
});

test("saldo negativo permitido cuando el admin lo autoriza explícitamente", () => {
  const r = evaluarAjusteManual({
    saldoActual: 3,
    cantidad: -10,
    motivo: "Penalización por no presentarse",
    permitirNegativo: true,
  });

  assert.equal(r.ok, true);
  assert.equal(r.saldoPosterior, -7);
});

test("el flag permitirNegativo no exime del motivo obligatorio", () => {
  const r = evaluarAjusteManual({
    saldoActual: 3,
    cantidad: -10,
    motivo: "",
    permitirNegativo: true,
  });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "MOTIVO_REQUERIDO");
});

test("paquete válido: se normaliza nombre y tipos", () => {
  const r = normalizarPaquete({
    nombre: "  Pack 100  ",
    creditos: "100",
    precio: "10000.5",
    descripcion: "  Cien créditos  ",
  });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.nombre, "Pack 100");
  assert.equal(r.paquete.creditos, 100);
  assert.equal(r.paquete.precio, 10000.5);
  assert.equal(r.paquete.descripcion, "Cien créditos");
});

test("descripción vacía se guarda como null, no como cadena vacía", () => {
  const r = normalizarPaquete({ nombre: "Pack 5", creditos: 5, precio: 4000, descripcion: "   " });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.descripcion, null);
});

test("paquete sin nombre: se rechaza", () => {
  const r = normalizarPaquete({ nombre: "  ", creditos: 5, precio: 4000 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "NOMBRE_REQUERIDO");
});

test("paquete de cero créditos: no tiene sentido vender nada", () => {
  const r = normalizarPaquete({ nombre: "Pack vacío", creditos: 0, precio: 4000 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CREDITOS_INVALIDOS");
});

test("créditos decimales en un paquete: se rechazan", () => {
  const r = normalizarPaquete({ nombre: "Pack raro", creditos: 2.5, precio: 4000 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "CREDITOS_INVALIDOS");
});

test("precio negativo: se rechaza", () => {
  const r = normalizarPaquete({ nombre: "Pack regalo", creditos: 5, precio: -1 });

  assert.equal(r.ok, false);
  assert.equal(r.codigo, "PRECIO_INVALIDO");
});

test("precio cero: permitido, es un paquete promocional", () => {
  const r = normalizarPaquete({ nombre: "Bienvenida", creditos: 2, precio: 0 });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.precio, 0);
});

test("el precio se redondea a dos decimales: la columna es NUMERIC(10,2)", () => {
  const r = normalizarPaquete({ nombre: "Pack", creditos: 5, precio: 1000.567 });

  assert.equal(r.ok, true);
  assert.equal(r.paquete.precio, 1000.57);
});

test("la referencia de compra se puede volver a leer", () => {
  assert.equal(referenciaCompra(42), "creditos-42");
  assert.equal(parsearReferenciaCompra("creditos-42"), 42);
});

test("una referencia de reserva antigua no se confunde con una compra", () => {
  // El webhook sigue recibiendo notificaciones de pagos de reserva viejos:
  // deben ignorarse, no acreditar créditos.
  assert.equal(parsearReferenciaCompra("17"), null);
  assert.equal(parsearReferenciaCompra(""), null);
  assert.equal(parsearReferenciaCompra(null), null);
  assert.equal(parsearReferenciaCompra("creditos-abc"), null);
});

test("solo un pago aprobado acredita créditos", () => {
  assert.equal(estadoCompraParaPago("approved"), "acreditada");
  assert.equal(estadoCompraParaPago("rejected"), "rechazada");
  assert.equal(estadoCompraParaPago("cancelled"), "rechazada");
  assert.equal(estadoCompraParaPago("pending"), null, "un pago pendiente no cambia el estado");
  assert.equal(estadoCompraParaPago("in_process"), null);
});
```

- [ ] **Paso 2: Registrar el test en el script `test`**

En `backend/package.json`, agregar `src/services/creditos.service.test.js` al final del script `test`:

```json
"test": "node --test src/services/reservaConcurrency.service.test.js src/services/reservaMutability.service.test.js src/services/extensionReserva.service.test.js src/services/rolUsuario.service.test.js src/services/rolClienteUsuario.service.test.js src/services/creditos.service.test.js"
```

- [ ] **Paso 3: Ejecutar el test para verificar que falla**

```bash
cd backend && npm test
```

Esperado: FALLA con `Cannot find module` apuntando a `creditos.service.js`.

- [ ] **Paso 4: Escribir la implementación**

Crear `backend/src/services/creditos.service.js`:

```javascript
/**
 * Reglas del sistema de créditos (RF06 - RF10).
 *
 * Lógica pura: los controladores leen el estado, llaman a estas funciones y
 * aplican el resultado dentro de una transacción. Separar la decisión del SQL
 * permite testear los bordes sin base de datos.
 */

/** Debe coincidir con el CHECK de creditos_movimiento. */
export const TIPOS_MOVIMIENTO = [
  "descuento_reserva",
  "ajuste_admin",
  "compra_paquete",
  "reintegro_cancelacion",
];

export const PESOS_POR_CREDITO_DEFECTO = 100;

/** Distingue una compra de créditos de una referencia de reserva antigua. */
export const PREFIJO_REFERENCIA_COMPRA = "creditos-";

function aNumero(valor, porDefecto = 0) {
  const n = typeof valor === "number" ? valor : Number.parseFloat(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

function tasaValida(pesosPorCredito) {
  const tasa = aNumero(pesosPorCredito, 0);
  return tasa > 0 ? tasa : PESOS_POR_CREDITO_DEFECTO;
}

/** Redondea hacia arriba: no se cobran fracciones de crédito. */
export function creditosParaMonto(montoEnPesos, pesosPorCredito) {
  const monto = aNumero(montoEnPesos, 0);
  if (monto <= 0) return 0;
  return Math.ceil(monto / tasaValida(pesosPorCredito));
}

/**
 * Costo de una reserva de varios recursos. Suma primero y redondea una sola
 * vez: redondear cada renglón por separado le cobraría de más al cliente.
 */
export function creditosParaMontos(montos, pesosPorCredito) {
  if (!Array.isArray(montos) || montos.length === 0) return 0;
  const total = montos.reduce((acc, m) => acc + aNumero(m, 0), 0);
  return creditosParaMonto(total, pesosPorCredito);
}

/**
 * Decide si una reserva puede pagarse con el saldo disponible.
 *
 * `creditosFaltantes` es lo que la interfaz usa para abrir la compra con el
 * número ya calculado.
 *
 * @param {object} params
 * @param {number} params.saldoActual     Saldo leído con FOR UPDATE.
 * @param {number} params.montoEnPesos    Monto total ya calculado de la reserva.
 * @param {number} params.pesosPorCredito Tasa de creditos_config.
 */
export function evaluarDescuentoReserva({
  saldoActual = 0,
  montoEnPesos = 0,
  pesosPorCredito = PESOS_POR_CREDITO_DEFECTO,
} = {}) {
  const saldo = Math.trunc(aNumero(saldoActual, 0));
  const creditosNecesarios = creditosParaMonto(montoEnPesos, pesosPorCredito);

  // Sin costo no se inserta movimiento: la tabla exige cantidad <> 0.
  if (creditosNecesarios === 0) {
    return {
      ok: true,
      creditosNecesarios: 0,
      creditosFaltantes: 0,
      saldoPosterior: saldo,
      requiereMovimiento: false,
    };
  }

  if (saldo < creditosNecesarios) {
    const creditosFaltantes = creditosNecesarios - saldo;
    return {
      ok: false,
      codigo: "SALDO_INSUFICIENTE",
      mensaje: `Necesitás ${creditosNecesarios} créditos y tenés ${saldo}. Te faltan ${creditosFaltantes}.`,
      creditosNecesarios,
      creditosFaltantes,
      saldoPosterior: saldo,
      requiereMovimiento: false,
    };
  }

  return {
    ok: true,
    creditosNecesarios,
    creditosFaltantes: 0,
    saldoPosterior: saldo - creditosNecesarios,
    requiereMovimiento: true,
  };
}

/**
 * Decide si un ajuste manual del administrador es admisible (RF08).
 *
 * El motivo es obligatorio: el ajuste es la única vía por la que un saldo
 * cambia sin una operación de negocio detrás.
 */
export function evaluarAjusteManual({
  saldoActual = 0,
  cantidad,
  motivo,
  permitirNegativo = false,
} = {}) {
  const motivoLimpio = String(motivo ?? "").trim();
  if (motivoLimpio.length < 3) {
    return {
      ok: false,
      codigo: "MOTIVO_REQUERIDO",
      mensaje: "El motivo del ajuste es obligatorio (mínimo 3 caracteres)",
    };
  }

  const n = aNumero(cantidad, Number.NaN);
  if (!Number.isInteger(n) || n === 0) {
    return {
      ok: false,
      codigo: "CANTIDAD_INVALIDA",
      mensaje: "La cantidad debe ser un número entero distinto de cero",
    };
  }

  const saldo = Math.trunc(aNumero(saldoActual, 0));
  const saldoPosterior = saldo + n;

  if (saldoPosterior < 0 && !permitirNegativo) {
    return {
      ok: false,
      codigo: "SALDO_NEGATIVO_NO_AUTORIZADO",
      mensaje: `El ajuste dejaría el saldo en ${saldoPosterior}. Autorizá el saldo negativo para continuar.`,
    };
  }

  return { ok: true, cantidad: n, motivo: motivoLimpio, saldoPosterior };
}

/** Normaliza y valida los datos de un paquete de créditos (RF09). */
export function normalizarPaquete({ nombre, creditos, precio, descripcion } = {}) {
  const nombreLimpio = String(nombre ?? "").trim();
  if (nombreLimpio.length === 0) {
    return {
      ok: false,
      codigo: "NOMBRE_REQUERIDO",
      mensaje: "El nombre del paquete es obligatorio",
    };
  }

  const creditosNum = aNumero(creditos, Number.NaN);
  if (!Number.isInteger(creditosNum) || creditosNum <= 0) {
    return {
      ok: false,
      codigo: "CREDITOS_INVALIDOS",
      mensaje: "Los créditos deben ser un número entero mayor a cero",
    };
  }

  const precioNum = aNumero(precio, Number.NaN);
  if (!Number.isFinite(precioNum) || precioNum < 0) {
    return {
      ok: false,
      codigo: "PRECIO_INVALIDO",
      mensaje: "El precio debe ser un número mayor o igual a cero",
    };
  }

  const descripcionLimpia = String(descripcion ?? "").trim();

  return {
    ok: true,
    paquete: {
      nombre: nombreLimpio,
      creditos: creditosNum,
      precio: Math.round(precioNum * 100) / 100,
      descripcion: descripcionLimpia.length > 0 ? descripcionLimpia : null,
    },
  };
}

export function referenciaCompra(compraId) {
  return `${PREFIJO_REFERENCIA_COMPRA}${compraId}`;
}

/** Devuelve null si la referencia no es de una compra de créditos. */
export function parsearReferenciaCompra(externalReference) {
  const ref = String(externalReference ?? "");
  if (!ref.startsWith(PREFIJO_REFERENCIA_COMPRA)) return null;

  const id = Number.parseInt(ref.slice(PREFIJO_REFERENCIA_COMPRA.length), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Estado de la compra según el pago de Mercado Pago.
 * null significa que el pago sigue en curso y la compra no se toca.
 */
export function estadoCompraParaPago(estadoMercadoPago) {
  if (estadoMercadoPago === "approved") return "acreditada";
  if (estadoMercadoPago === "rejected" || estadoMercadoPago === "cancelled") return "rechazada";
  return null;
}
```

- [ ] **Paso 5: Ejecutar el test para verificar que pasa**

```bash
cd backend && npm test
```

Esperado: PASA. Todos los tests de `creditos.service.test.js` en verde, y los cinco archivos preexistentes siguen pasando.

- [ ] **Paso 6: Commit**

```bash
git add backend/src/services/creditos.service.js backend/src/services/creditos.service.test.js backend/package.json
git commit -m "feat: add credits business rules service with tests"
```

---

## Tarea 3: Repositorio de acceso a datos

**Files:**
- Create: `backend/src/repositories/creditos.repository.js`

**Interfaces:**
- Consumes: tablas de la Tarea 1.
- Produces:
  - `obtenerPesosPorCredito(db): Promise<number>`
  - `obtenerSaldo(db, clienteUsuarioId): Promise<{saldo: number, actualizadoAt: Date|null}>`
  - `bloquearSaldo(db, clienteUsuarioId): Promise<number>`
  - `aplicarMovimiento(db, { clienteUsuarioId, tipo, cantidad, saldoPosterior, motivo, idReserva, compraId, adminUsuarioId }): Promise<object>`
  - `listarMovimientos(db, clienteUsuarioId, { limit, offset }): Promise<{movimientos: object[], total: number}>`
  - `listarPaquetes(db, { soloActivos }): Promise<object[]>`
  - `obtenerPaquete(db, id): Promise<object|null>`
  - `crearPaquete(db, { nombre, creditos, precio, descripcion }): Promise<object>`
  - `actualizarPaquete(db, id, { nombre, creditos, precio, descripcion, activo }): Promise<object|null>`
  - `desactivarPaquete(db, id): Promise<object|null>`
  - `crearCompra(db, { clienteUsuarioId, paqueteId, creditos, precio }): Promise<object>`
  - `guardarPreferenciaCompra(db, compraId, mpPreferenceId): Promise<void>`
  - `bloquearCompra(db, compraId): Promise<object|null>`
  - `marcarCompraAcreditada(db, compraId, mpPaymentId): Promise<void>`
  - `marcarCompraRechazada(db, compraId, mpPaymentId): Promise<void>`
  - `obtenerCompra(db, compraId): Promise<object|null>`

- [ ] **Paso 1: Escribir el repositorio**

Crear `backend/src/repositories/creditos.repository.js`:

```javascript
/**
 * Acceso a datos del sistema de créditos.
 *
 * Cada función recibe `db`: el pool para lecturas sueltas, o un client de
 * transacción para las escrituras. Así el descuento de la reserva reutiliza
 * estas funciones dentro de su propia transacción.
 */

const COLUMNAS_PAQUETE = `
  id, nombre, creditos, precio, descripcion, activo, created_at, actualizado_at
`;

export async function obtenerPesosPorCredito(db) {
  const { rows } = await db.query(
    "SELECT pesos_por_credito FROM creditos_config WHERE id = 1"
  );
  if (rows.length === 0) return 100;
  return Number.parseFloat(rows[0].pesos_por_credito);
}

/** Un usuario sin fila todavía tiene saldo 0. */
export async function obtenerSaldo(db, clienteUsuarioId) {
  const { rows } = await db.query(
    "SELECT saldo, actualizado_at FROM creditos_saldo WHERE cliente_usuario_id = $1",
    [clienteUsuarioId]
  );
  if (rows.length === 0) return { saldo: 0, actualizadoAt: null };
  return { saldo: Number(rows[0].saldo), actualizadoAt: rows[0].actualizado_at };
}

/**
 * Bloquea la fila de saldo y devuelve el saldo vigente.
 *
 * DEBE llamarse dentro de una transacción: el FOR UPDATE se sostiene hasta el
 * COMMIT. Es lo que impide que dos reservas simultáneas del mismo usuario lean
 * el mismo saldo y lo sobregiren. El ON CONFLICT crea la fila la primera vez
 * sin fallar si otra transacción la creó en el intervalo.
 */
export async function bloquearSaldo(db, clienteUsuarioId) {
  await db.query(
    `INSERT INTO creditos_saldo (cliente_usuario_id, saldo)
     VALUES ($1, 0)
     ON CONFLICT (cliente_usuario_id) DO NOTHING`,
    [clienteUsuarioId]
  );

  const { rows } = await db.query(
    "SELECT saldo FROM creditos_saldo WHERE cliente_usuario_id = $1 FOR UPDATE",
    [clienteUsuarioId]
  );
  return Number(rows[0].saldo);
}

/**
 * Escribe el nuevo saldo e inserta la fila del libro. Las dos escrituras van
 * juntas: el libro nunca puede quedar desfasado del saldo.
 */
export async function aplicarMovimiento(
  db,
  {
    clienteUsuarioId,
    tipo,
    cantidad,
    saldoPosterior,
    motivo = null,
    idReserva = null,
    compraId = null,
    adminUsuarioId = null,
  }
) {
  await db.query(
    `UPDATE creditos_saldo
     SET saldo = $2, actualizado_at = NOW()
     WHERE cliente_usuario_id = $1`,
    [clienteUsuarioId, saldoPosterior]
  );

  const { rows } = await db.query(
    `INSERT INTO creditos_movimiento (
       cliente_usuario_id, tipo, cantidad, saldo_posterior,
       motivo, id_reserva, compra_id, admin_usuario_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [clienteUsuarioId, tipo, cantidad, saldoPosterior, motivo, idReserva, compraId, adminUsuarioId]
  );
  return rows[0];
}

export async function listarMovimientos(db, clienteUsuarioId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT id, tipo, cantidad, saldo_posterior, motivo,
            id_reserva, compra_id, created_at
     FROM creditos_movimiento
     WHERE cliente_usuario_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [clienteUsuarioId, limit, offset]
  );

  const { rows: conteo } = await db.query(
    "SELECT COUNT(*) AS total FROM creditos_movimiento WHERE cliente_usuario_id = $1",
    [clienteUsuarioId]
  );

  return { movimientos: rows, total: Number.parseInt(conteo[0].total, 10) };
}

export async function listarPaquetes(db, { soloActivos = false } = {}) {
  const filtro = soloActivos ? "WHERE activo = TRUE" : "";
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_PAQUETE}
     FROM creditos_paquete
     ${filtro}
     ORDER BY creditos ASC, id ASC`
  );
  return rows;
}

export async function obtenerPaquete(db, id) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_PAQUETE} FROM creditos_paquete WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function crearPaquete(db, { nombre, creditos, precio, descripcion }) {
  const { rows } = await db.query(
    `INSERT INTO creditos_paquete (nombre, creditos, precio, descripcion)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNAS_PAQUETE}`,
    [nombre, creditos, precio, descripcion]
  );
  return rows[0];
}

/** `activo` permite reactivar un paquete dado de baja. Null si el id no existe. */
export async function actualizarPaquete(db, id, { nombre, creditos, precio, descripcion, activo }) {
  const { rows } = await db.query(
    `UPDATE creditos_paquete
     SET nombre = $2, creditos = $3, precio = $4, descripcion = $5,
         activo = COALESCE($6, activo), actualizado_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNAS_PAQUETE}`,
    [id, nombre, creditos, precio, descripcion, activo ?? null]
  );
  return rows[0] ?? null;
}

/**
 * Baja lógica. Nunca DELETE: las compras históricas referencian la fila y el
 * administrador necesita seguir viendo qué paquete se compró.
 */
export async function desactivarPaquete(db, id) {
  const { rows } = await db.query(
    `UPDATE creditos_paquete
     SET activo = FALSE, actualizado_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNAS_PAQUETE}`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Los créditos y el precio se copian del paquete: si el admin lo edita después,
 * la compra conserva lo que el cliente realmente pagó.
 */
export async function crearCompra(db, { clienteUsuarioId, paqueteId, creditos, precio }) {
  const { rows } = await db.query(
    `INSERT INTO creditos_compra (cliente_usuario_id, paquete_id, creditos, precio)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clienteUsuarioId, paqueteId, creditos, precio]
  );
  return rows[0];
}

export async function guardarPreferenciaCompra(db, compraId, mpPreferenceId) {
  await db.query(
    "UPDATE creditos_compra SET mp_preference_id = $2 WHERE id = $1",
    [compraId, mpPreferenceId]
  );
}

/** DEBE usarse dentro de una transacción: sostiene el lock hasta el COMMIT. */
export async function bloquearCompra(db, compraId) {
  const { rows } = await db.query(
    "SELECT * FROM creditos_compra WHERE id = $1 FOR UPDATE",
    [compraId]
  );
  return rows[0] ?? null;
}

export async function marcarCompraAcreditada(db, compraId, mpPaymentId) {
  await db.query(
    `UPDATE creditos_compra
     SET estado = 'acreditada', mp_payment_id = $2, acreditada_at = NOW()
     WHERE id = $1`,
    [compraId, mpPaymentId]
  );
}

export async function marcarCompraRechazada(db, compraId, mpPaymentId) {
  await db.query(
    `UPDATE creditos_compra
     SET estado = 'rechazada', mp_payment_id = $2
     WHERE id = $1`,
    [compraId, mpPaymentId]
  );
}

export async function obtenerCompra(db, compraId) {
  const { rows } = await db.query("SELECT * FROM creditos_compra WHERE id = $1", [compraId]);
  return rows[0] ?? null;
}
```

- [ ] **Paso 2: Verificar que el módulo carga**

```bash
cd backend && node --input-type=module -e "import('./src/repositories/creditos.repository.js').then(m => console.log(Object.keys(m).length + ' exports'))"
```

Esperado: `15 exports`.

- [ ] **Paso 3: Commit**

```bash
git add backend/src/repositories/creditos.repository.js
git commit -m "feat: add credits data access repository"
```

---

## Tarea 4: Esquemas Zod de créditos

**Files:**
- Modify: `backend/src/schemas/validation.schemas.js` (agregar al final)

**Interfaces:**
- Consumes: `z` de `zod`, ya importado en la primera línea.
- Produces:
  - `creditosMovimientosQuerySchema` — `{ limit, offset }`
  - `creditosIdParamSchema` — `{ id }`
  - `creditosCotizarSchema` — `{ items, DiaReserva, HorarioReserva, HorarioFin, TipoReserva }`
  - `creditosComprarSchema` — `{ paqueteId }`
  - `adminAjusteCreditosSchema` — `{ cantidad, motivo, permitirNegativo }`
  - `adminCrearPaqueteSchema` — `{ nombre, creditos, precio, descripcion? }`
  - `adminActualizarPaqueteSchema` — igual más `activo?`

- [ ] **Paso 1: Agregar los esquemas**

Añadir al final de `backend/src/schemas/validation.schemas.js`:

```javascript
// Sistema de créditos (RF06 - RF10).

export const creditosMovimientosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Id en la ruta: usuario o paquete. */
export const creditosIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Cotización previa: cuántos créditos cuesta la selección actual. */
export const creditosCotizarSchema = z.object({
  items: z.array(z.object({ idRecurso: z.coerce.number().int().positive() })).min(1).max(24),
  DiaReserva: z.string().min(1).max(32),
  HorarioReserva: z.string().max(16).optional().nullable(),
  HorarioFin: z.string().max(16).optional().nullable(),
  TipoReserva: z.enum(["turno", "semanal", "mensual"]).default("turno"),
});

/** El cliente elige un paquete; el precio lo pone el servidor. */
export const creditosComprarSchema = z.object({
  paqueteId: z.coerce.number().int().positive(),
});

/**
 * Ajuste manual (RF08). `permitirNegativo` es la autorización explícita para
 * dejar el saldo bajo cero.
 */
export const adminAjusteCreditosSchema = z.object({
  cantidad: z.coerce
    .number()
    .int({ message: "Los créditos son enteros" })
    .refine((n) => n !== 0, { message: "La cantidad no puede ser cero" }),
  motivo: z.string().trim().min(3).max(500),
  permitirNegativo: z.coerce.boolean().default(false),
});

export const adminCrearPaqueteSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  creditos: z.coerce.number().int().positive(),
  precio: z.coerce.number().nonnegative(),
  descripcion: z.string().trim().max(1000).optional().nullable(),
});

export const adminActualizarPaqueteSchema = adminCrearPaqueteSchema.extend({
  activo: z.coerce.boolean().optional(),
});
```

- [ ] **Paso 2: Verificar el parseo y las coerciones**

```bash
cd backend && node --input-type=module -e "
import { adminAjusteCreditosSchema, creditosMovimientosQuerySchema, creditosComprarSchema } from './src/schemas/validation.schemas.js';
console.log(JSON.stringify(adminAjusteCreditosSchema.parse({ cantidad: '5', motivo: '  Carga manual  ' })));
console.log(JSON.stringify(creditosMovimientosQuerySchema.parse({})));
console.log(JSON.stringify(creditosComprarSchema.parse({ paqueteId: '3' })));
try { adminAjusteCreditosSchema.parse({ cantidad: 0, motivo: 'x y z' }); console.log('ERROR: aceptó cantidad cero'); }
catch { console.log('OK: rechaza cantidad cero'); }
"
```

Esperado:
```
{"cantidad":5,"motivo":"Carga manual","permitirNegativo":false}
{"limit":20,"offset":0}
{"paqueteId":3}
OK: rechaza cantidad cero
```

- [ ] **Paso 3: Commit**

```bash
git add backend/src/schemas/validation.schemas.js
git commit -m "feat: add zod schemas for credits endpoints"
```

---

## Tarea 5: Endpoints de saldo, historial y paquetes (RF06, RF10)

**Files:**
- Create: `backend/src/controllers/creditos.controller.js`
- Create: `backend/src/routes/creditos.routes.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: repositorio (Tarea 3); `creditosMovimientosQuerySchema` (Tarea 4); `verificarToken`, `verificarCuentaActiva`.
- Produces: `GET /api/creditos/saldo`, `GET /api/creditos/movimientos`, `GET /api/creditos/paquetes`. El archivo del controlador se amplía en la Tarea 8 con `cotizar` y `comprar`.

- [ ] **Paso 1: Escribir el controlador**

Crear `backend/src/controllers/creditos.controller.js`:

```javascript
import pool from "../config/db.js";
import {
  obtenerSaldo,
  obtenerPesosPorCredito,
  listarMovimientos,
  listarPaquetes,
} from "../repositories/creditos.repository.js";

/** El staff no tiene saldo propio: los créditos son del usuario final. */
function exigirCliente(req, res) {
  if (req.usuario?.tipo !== "cliente") {
    res.status(403).json({
      message: "Los créditos son de las cuentas de usuario, no del personal",
      codigo: "SIN_CUENTA_DE_CREDITOS",
    });
    return false;
  }
  return true;
}

/** GET /api/creditos/saldo (RF10) */
export const obtenerMiSaldo = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const [{ saldo, actualizadoAt }, pesosPorCredito] = await Promise.all([
      obtenerSaldo(pool, req.usuario.id),
      obtenerPesosPorCredito(pool),
    ]);

    res.json({ saldo, pesosPorCredito, actualizadoAt });
  } catch (error) {
    console.error("Error al obtener el saldo de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/creditos/movimientos (RF06) */
export const obtenerMisMovimientos = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const { limit, offset } = req.query;
    const { movimientos, total } = await listarMovimientos(pool, req.usuario.id, { limit, offset });

    res.json({ movimientos, total, limit, offset });
  } catch (error) {
    console.error("Error al listar los movimientos de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/creditos/paquetes — los que se ofrecen en el pop-up de compra. */
export const obtenerPaquetesActivos = async (_req, res) => {
  try {
    const paquetes = await listarPaquetes(pool, { soloActivos: true });
    res.json({ paquetes });
  } catch (error) {
    console.error("Error al listar los paquetes de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
```

- [ ] **Paso 2: Escribir las rutas**

Crear `backend/src/routes/creditos.routes.js`:

```javascript
import { Router } from "express";
import { verificarToken, verificarCuentaActiva } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validate.middleware.js";
import { creditosMovimientosQuerySchema } from "../schemas/validation.schemas.js";
import {
  obtenerMiSaldo,
  obtenerMisMovimientos,
  obtenerPaquetesActivos,
} from "../controllers/creditos.controller.js";

const router = Router();

router.use(verificarToken, verificarCuentaActiva);

router.get("/saldo", obtenerMiSaldo);
router.get("/movimientos", validateQuery(creditosMovimientosQuerySchema), obtenerMisMovimientos);
router.get("/paquetes", obtenerPaquetesActivos);

export default router;
```

- [ ] **Paso 3: Montar las rutas**

En `backend/src/server.js`, agregar el import junto a los demás:

```javascript
import creditosRoutes from "./routes/creditos.routes.js";
```

Y montar después de `app.use("/api/pagos", pagosRoutes);`:

```javascript
app.use("/api/creditos", creditosRoutes);
```

- [ ] **Paso 4: Verificar los endpoints**

En una terminal: `cd backend && npm run dev`

En otra, sin token:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/creditos/saldo
```

Esperado: `401`.

Con un token de cliente (de `localStorage.clienteToken` tras iniciar sesión):

```bash
TOKEN=TU_TOKEN_CLIENTE
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/creditos/saldo
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/creditos/movimientos
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/creditos/paquetes
```

Esperado: `{"saldo":0,"pesosPorCredito":100,"actualizadoAt":null}`,
`{"movimientos":[],"total":0,"limit":20,"offset":0}`, y el paquete "Pack 100"
sembrado en la Tarea 1.

- [ ] **Paso 5: Commit**

```bash
git add backend/src/controllers/creditos.controller.js backend/src/routes/creditos.routes.js backend/src/server.js
git commit -m "feat: add end-user credits balance and history endpoints"
```

---

## Tarea 6: Endpoints de administración (RF08, RF09)

**Files:**
- Create: `backend/src/controllers/adminCreditos.controller.js`
- Create: `backend/src/routes/adminCreditos.routes.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: repositorio (Tarea 3); `evaluarAjusteManual`, `normalizarPaquete` (Tarea 2); esquemas admin (Tarea 4).
- Produces: rutas bajo `/api/admin/creditos`.

- [ ] **Paso 1: Escribir el controlador**

Crear `backend/src/controllers/adminCreditos.controller.js`:

```javascript
import pool from "../config/db.js";
import { evaluarAjusteManual, normalizarPaquete } from "../services/creditos.service.js";
import {
  obtenerSaldo,
  bloquearSaldo,
  aplicarMovimiento,
  listarMovimientos,
  listarPaquetes,
  crearPaquete,
  actualizarPaquete,
  desactivarPaquete,
} from "../repositories/creditos.repository.js";

function estadoHttpPara(codigo) {
  switch (codigo) {
    case "NO_ENCONTRADO":
      return 404;
    case "SALDO_NEGATIVO_NO_AUTORIZADO":
      return 409;
    default:
      return 400;
  }
}

/** GET /api/admin/creditos/usuarios/:id */
export const obtenerCreditosDeUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'SELECT id, nombre, apellido, email FROM "ClienteUsuario" WHERE id = $1',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado", codigo: "NO_ENCONTRADO" });
    }

    const { saldo, actualizadoAt } = await obtenerSaldo(pool, id);
    const { movimientos, total } = await listarMovimientos(pool, id, { limit: 20, offset: 0 });

    res.json({ usuario: rows[0], saldo, actualizadoAt, movimientos, total });
  } catch (error) {
    console.error("Error al obtener los créditos del usuario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * POST /api/admin/creditos/usuarios/:id/ajuste (RF08)
 *
 * Transaccional con el saldo bloqueado: un ajuste no puede pisar el descuento
 * de una reserva que el usuario esté confirmando en el mismo instante.
 */
export const ajustarCreditosDeUsuario = async (req, res) => {
  const { id } = req.params;
  const { cantidad, motivo, permitirNegativo } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: usuarios } = await client.query(
      'SELECT id FROM "ClienteUsuario" WHERE id = $1',
      [id]
    );
    if (usuarios.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado", codigo: "NO_ENCONTRADO" });
    }

    const saldoActual = await bloquearSaldo(client, id);
    const decision = evaluarAjusteManual({ saldoActual, cantidad, motivo, permitirNegativo });

    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res
        .status(estadoHttpPara(decision.codigo))
        .json({ message: decision.mensaje, codigo: decision.codigo });
    }

    const movimiento = await aplicarMovimiento(client, {
      clienteUsuarioId: Number(id),
      tipo: "ajuste_admin",
      cantidad: decision.cantidad,
      saldoPosterior: decision.saldoPosterior,
      motivo: decision.motivo,
      adminUsuarioId: req.usuario.id,
    });

    await client.query("COMMIT");
    res.status(201).json({ saldo: decision.saldoPosterior, movimiento });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    console.error("Error al ajustar los créditos del usuario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/** GET /api/admin/creditos/paquetes — incluye los dados de baja. */
export const listarPaquetesAdmin = async (_req, res) => {
  try {
    const paquetes = await listarPaquetes(pool, { soloActivos: false });
    res.json({ paquetes });
  } catch (error) {
    console.error("Error al listar los paquetes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** POST /api/admin/creditos/paquetes (RF09) */
export const crearPaqueteAdmin = async (req, res) => {
  try {
    const decision = normalizarPaquete(req.body);
    if (!decision.ok) {
      return res.status(400).json({ message: decision.mensaje, codigo: decision.codigo });
    }

    const paquete = await crearPaquete(pool, decision.paquete);
    res.status(201).json(paquete);
  } catch (error) {
    console.error("Error al crear el paquete:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** PUT /api/admin/creditos/paquetes/:id (RF09) */
export const actualizarPaqueteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const decision = normalizarPaquete(req.body);
    if (!decision.ok) {
      return res.status(400).json({ message: decision.mensaje, codigo: decision.codigo });
    }

    const paquete = await actualizarPaquete(pool, id, {
      ...decision.paquete,
      activo: req.body.activo,
    });
    if (!paquete) {
      return res.status(404).json({ message: "Paquete no encontrado", codigo: "NO_ENCONTRADO" });
    }

    res.json(paquete);
  } catch (error) {
    console.error("Error al actualizar el paquete:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** DELETE /api/admin/creditos/paquetes/:id — baja lógica. */
export const eliminarPaqueteAdmin = async (req, res) => {
  try {
    const paquete = await desactivarPaquete(pool, req.params.id);
    if (!paquete) {
      return res.status(404).json({ message: "Paquete no encontrado", codigo: "NO_ENCONTRADO" });
    }
    res.json({ message: "Paquete dado de baja", paquete });
  } catch (error) {
    console.error("Error al dar de baja el paquete:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
```

- [ ] **Paso 2: Escribir las rutas**

Crear `backend/src/routes/adminCreditos.routes.js`:

```javascript
import { Router } from "express";
import { verificarToken, verificarPermiso } from "../middleware/auth.middleware.js";
import { validateBody, validateParams } from "../middleware/validate.middleware.js";
import {
  creditosIdParamSchema,
  adminAjusteCreditosSchema,
  adminCrearPaqueteSchema,
  adminActualizarPaqueteSchema,
} from "../schemas/validation.schemas.js";
import {
  obtenerCreditosDeUsuario,
  ajustarCreditosDeUsuario,
  listarPaquetesAdmin,
  crearPaqueteAdmin,
  actualizarPaqueteAdmin,
  eliminarPaqueteAdmin,
} from "../controllers/adminCreditos.controller.js";

const router = Router();

router.use(verificarToken, verificarPermiso("gestionar_creditos"));

router.get("/paquetes", listarPaquetesAdmin);
router.post("/paquetes", validateBody(adminCrearPaqueteSchema), crearPaqueteAdmin);
router.put(
  "/paquetes/:id",
  validateParams(creditosIdParamSchema),
  validateBody(adminActualizarPaqueteSchema),
  actualizarPaqueteAdmin
);
router.delete("/paquetes/:id", validateParams(creditosIdParamSchema), eliminarPaqueteAdmin);

router.get("/usuarios/:id", validateParams(creditosIdParamSchema), obtenerCreditosDeUsuario);
router.post(
  "/usuarios/:id/ajuste",
  validateParams(creditosIdParamSchema),
  validateBody(adminAjusteCreditosSchema),
  ajustarCreditosDeUsuario
);

export default router;
```

- [ ] **Paso 3: Montar las rutas**

En `backend/src/server.js`, agregar el import:

```javascript
import adminCreditosRoutes from "./routes/adminCreditos.routes.js";
```

Montar **antes** de `app.use("/api/admin", adminUsuariosRoutes);`, por el mismo
motivo documentado ahí para `/api/admin/estructura`: el router de usuarios aplica
un middleware global que interceptaría estas rutas.

```javascript
app.use("/api/admin/creditos", adminCreditosRoutes);
```

- [ ] **Paso 4: Verificar el ajuste manual**

Con el servidor levantado, un token de admin y el id de un usuario final (ej. `1`):

```bash
TOKEN=TU_TOKEN_ADMIN

curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cantidad":100,"motivo":"Carga inicial de prueba"}'

curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cantidad":-500,"motivo":"Prueba de negativo"}'

curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cantidad":-500,"motivo":"Prueba de negativo","permitirNegativo":true}'

curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cantidad":5}'
```

Esperado, en orden:
1. `{"saldo":100,...}`
2. `{"message":"El ajuste dejaría el saldo en -400. Autorizá el saldo negativo para continuar.","codigo":"SALDO_NEGATIVO_NO_AUTORIZADO"}`
3. `{"saldo":-400,...}`
4. `{"message":"Validación fallida","errors":{...}}`

Dejar el saldo en 100 para las tareas siguientes:

```bash
curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cantidad":500,"motivo":"Reponer saldo de prueba"}'
```

- [ ] **Paso 5: Verificar el CRUD de paquetes**

```bash
TOKEN=TU_TOKEN_ADMIN

curl -s -X POST http://localhost:3001/api/admin/creditos/paquetes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"Pack 50","creditos":50,"precio":5000,"descripcion":"Cincuenta créditos"}'

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/creditos/paquetes
```

Esperado: el `POST` devuelve el paquete con `id` y `activo: true`; el `GET` lista los dos paquetes.

- [ ] **Paso 6: Commit**

```bash
git add backend/src/controllers/adminCreditos.controller.js backend/src/routes/adminCreditos.routes.js backend/src/server.js
git commit -m "feat: add admin credits adjustment and package CRUD endpoints"
```

---

## Tarea 7: Descuento transaccional al reservar (RF07)

El corazón del módulo. El saldo se bloquea con `FOR UPDATE` dentro de la misma
transacción que inserta la reserva. Aplica a la reserva simple y a la múltiple.

**Files:**
- Modify: `backend/src/controllers/reservas.controller.js` (`crearReserva` ~línea 792, `crearReservasMultiples` ~línea 894)

**Interfaces:**
- Consumes: `evaluarDescuentoReserva`, `creditosParaMontos` (Tarea 2); `bloquearSaldo`, `aplicarMovimiento`, `obtenerPesosPorCredito` (Tarea 3).
- Produces: `POST /api/reservas` y `POST /api/reservas/multiples` descuentan créditos para tokens de cliente y devuelven `creditos: { descontados, saldo }`.

- [ ] **Paso 1: Importar lo necesario**

En `backend/src/controllers/reservas.controller.js`, agregar tras el import de `transaccionUltimaJoin.service.js`:

```javascript
import { evaluarDescuentoReserva } from "../services/creditos.service.js";
import {
  obtenerPesosPorCredito,
  bloquearSaldo,
  aplicarMovimiento,
} from "../repositories/creditos.repository.js";
```

- [ ] **Paso 2: Agregar el ayudante compartido de descuento**

Las dos funciones de creación necesitan lo mismo. Agregar cerca de
`resolverTitularReserva` (después de esa función, alrededor de la línea 113):

```javascript
/**
 * Bloquea el saldo del cliente y decide si alcanza para la reserva (RF07).
 *
 * Devuelve null para el staff: una reserva cargada por mostrador se cobra por
 * el circuito de caja, no con créditos del cliente.
 *
 * DEBE llamarse dentro de la transacción y DESPUÉS de bloquearEspaciosDeRecursos:
 * el orden de adquisición de locks es único en todo el sistema para no generar
 * deadlocks.
 */
async function evaluarPagoConCreditos(client, usuario, montoTotal) {
  if (usuario?.tipo !== "cliente") return null;

  const pesosPorCredito = await obtenerPesosPorCredito(client);
  const saldoActual = await bloquearSaldo(client, usuario.id);

  return {
    ...evaluarDescuentoReserva({ saldoActual, montoEnPesos: montoTotal, pesosPorCredito }),
    saldoActual,
  };
}

/** Cuerpo del 409 cuando no alcanza el saldo: la interfaz abre la compra con esto. */
function respuestaSaldoInsuficiente(decision) {
  return {
    message: decision.mensaje,
    codigo: decision.codigo,
    creditosNecesarios: decision.creditosNecesarios,
    creditosFaltantes: decision.creditosFaltantes,
    saldoActual: decision.saldoActual,
  };
}
```

- [ ] **Paso 3: Aplicar el descuento en `crearReserva`**

En `crearReserva`, el bloque que va desde el cálculo de `montoFinal` hasta
`res.status(201).json(...)` se reemplaza por:

```javascript
      let montoFinal;
      if (esStaff(req.usuario)) {
        const raw = req.body.Monto;
        const parsed = raw === undefined || raw === null ? NaN : parseFloat(raw);
        montoFinal =
          Number.isFinite(parsed) && parsed > 0
            ? parsed
            : await calcularMonto(idRecurso, tipo, horaIniStore || undefined, horaFinStore || undefined);
      } else {
        montoFinal = await calcularMonto(idRecurso, tipo, horaIniStore || undefined, horaFinStore || undefined);
      }

      // Se decide antes de insertar: sin saldo, la reserva no llega a existir.
      const decisionCreditos = await evaluarPagoConCreditos(client, req.usuario, montoFinal);
      if (decisionCreditos && !decisionCreditos.ok) {
        await client.query("ROLLBACK");
        return res.status(409).json(respuestaSaldoInsuficiente(decisionCreditos));
      }

      const { rows } = await client.query(
        `INSERT INTO "Reservas" ("DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva","Estado")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'activa')
         RETURNING *`,
        [
          titular.dni,
          titular.nombre,
          idRecurso,
          tipo === "turno" ? horaIniStore : HorarioReserva || null,
          tipo === "turno" ? horaFinStore : HorarioFin || null,
          montoFinal,
          DiaReserva,
          tipo,
        ]
      );

      // Después del INSERT para poder referenciar la reserva. Comparten
      // transacción: o van los dos, o no va ninguno.
      if (decisionCreditos?.requiereMovimiento) {
        await aplicarMovimiento(client, {
          clienteUsuarioId: req.usuario.id,
          tipo: "descuento_reserva",
          cantidad: -decisionCreditos.creditosNecesarios,
          saldoPosterior: decisionCreditos.saldoPosterior,
          motivo: `Reserva #${rows[0].idReserva}`,
          idReserva: rows[0].idReserva,
        });
      }

      await client.query("COMMIT");
      enviarConfirmacionReservaEnBackground(pool, [rows[0].idReserva]);

      const cuerpo = serializarHorariosReservaEnFila(rows[0]);
      if (decisionCreditos) {
        cuerpo.creditos = {
          descontados: decisionCreditos.creditosNecesarios,
          saldo: decisionCreditos.saldoPosterior,
        };
      }
      res.status(201).json(cuerpo);
```

- [ ] **Paso 4: Aplicar el descuento en `crearReservasMultiples`**

En `crearReservasMultiples`, el bucle que inserta cada fila calcula
`montoFila` por recurso. Hay que sumar los montos primero, cotizar el total una
sola vez y descontar después del bucle.

Reemplazar el bloque que va desde `const creadas = [];` hasta el `res.status(201).json({...})` por:

```javascript
    const creadas = [];
    let montoTotal = 0;

    for (const idRecurso of ids) {
      const msgTurno = await mensajeTurnoNoDisponibleParaRecurso(idRecurso);
      if (msgTurno) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: msgTurno });
      }
      const conflicto = await verificarConflictos(
        client,
        idRecurso,
        DiaReserva,
        nh.horaIni,
        nh.horaFin,
        "turno",
        null
      );
      if (conflicto) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: conflicto });
      }

      const montoFila = await calcularMonto(idRecurso, "turno", nh.horaIni, nh.horaFin);
      montoTotal += montoFila;

      const ins = await client.query(
        `INSERT INTO "Reservas" ("DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva","Estado")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'turno','activa')
         RETURNING *`,
        [titular.dni, titular.nombre, idRecurso, nh.horaIni, nh.horaFin, montoFila, DiaReserva]
      );
      creadas.push(ins.rows[0]);
    }

    // Se cotiza el total una sola vez: redondear renglón por renglón le
    // cobraría de más al cliente.
    const decisionCreditos = await evaluarPagoConCreditos(client, req.usuario, montoTotal);
    if (decisionCreditos && !decisionCreditos.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json(respuestaSaldoInsuficiente(decisionCreditos));
    }

    const idsCreadas = creadas.map((r) => r.idReserva);
    const idReservaGrupo = Math.min(...idsCreadas);
    try {
      await client.query(
        `UPDATE "Reservas" SET "idReservaGrupo" = $1 WHERE "idReserva" = ANY($2::int[])`,
        [idReservaGrupo, idsCreadas]
      );
    } catch (err) {
      if (err.code === "42703" && String(err.message || "").includes("idReservaGrupo")) {
        await client.query("ROLLBACK");
        return res.status(503).json({
          message:
            "Ejecutá la migración backend/database/migration_reserva_grupo_multiples.sql para unificar reservas múltiples.",
        });
      }
      throw err;
    }

    // Un solo movimiento por el grupo, anclado a la reserva de menor id.
    if (decisionCreditos?.requiereMovimiento) {
      await aplicarMovimiento(client, {
        clienteUsuarioId: req.usuario.id,
        tipo: "descuento_reserva",
        cantidad: -decisionCreditos.creditosNecesarios,
        saldoPosterior: decisionCreditos.saldoPosterior,
        motivo: `Reserva múltiple #${idReservaGrupo} (${creadas.length} lugares)`,
        idReserva: idReservaGrupo,
      });
    }

    await client.query("COMMIT");
    enviarConfirmacionReservaEnBackground(
      pool,
      creadas.map((r) => r.idReserva)
    );

    const cuerpo = {
      reservas: serializarHorariosReservaEnFilas(creadas),
      count: creadas.length,
      idReservaGrupo,
    };
    if (decisionCreditos) {
      cuerpo.creditos = {
        descontados: decisionCreditos.creditosNecesarios,
        saldo: decisionCreditos.saldoPosterior,
      };
    }
    res.status(201).json(cuerpo);
```

- [ ] **Paso 5: Verificar el descuento con saldo suficiente**

Con el servidor levantado, el usuario de prueba con 100 créditos y un token de cliente:

```bash
TOKEN=TU_TOKEN_CLIENTE

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/creditos/saldo

curl -s -X POST http://localhost:3001/api/reservas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"idRecurso":1,"DiaReserva":"2026-12-15","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}'

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/creditos/movimientos
```

Esperado: la respuesta incluye `"creditos":{"descontados":N,"saldo":M}`, el saldo
bajó exactamente `N`, y el historial muestra un `descuento_reserva` con
`cantidad` negativa e `id_reserva` de la reserva creada.

- [ ] **Paso 6: Verificar que sin saldo no se crea la reserva**

Vaciar el saldo con el endpoint de admin y reintentar:

```bash
TOKEN_ADMIN=TU_TOKEN_ADMIN
TOKEN=TU_TOKEN_CLIENTE

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/creditos/saldo

curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"cantidad":-SALDO_ACTUAL,"motivo":"Vaciar para probar saldo insuficiente"}'

curl -s -X POST http://localhost:3001/api/reservas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"idRecurso":1,"DiaReserva":"2026-12-16","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}'
```

Esperado: HTTP `409` con `"codigo":"SALDO_INSUFICIENTE"` y las claves
`creditosNecesarios`, `creditosFaltantes` y `saldoActual`.

Verificar que la reserva **no** se creó:

```bash
psql -h localhost -U postgres -d boweworking \
  -c "SELECT COUNT(*) FROM \"Reservas\" WHERE \"DiaReserva\" = '2026-12-16';"
```

Esperado: `0`.

- [ ] **Paso 7: Verificar que el staff no gasta créditos**

Con un token de staff, creando una reserva a nombre de un DNI de cliente:

```bash
TOKEN_STAFF=TU_TOKEN_STAFF

curl -s -X POST http://localhost:3001/api/reservas \
  -H "Authorization: Bearer $TOKEN_STAFF" -H "Content-Type: application/json" \
  -d '{"idRecurso":1,"DiaReserva":"2026-12-18","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno","DNI":"DNI_DEL_CLIENTE","Nombre":"Cliente Prueba"}'
```

Esperado: HTTP `201` y la respuesta **no** trae la clave `creditos`.

- [ ] **Paso 8: Correr los tests**

```bash
cd backend && npm test
```

Esperado: todos los tests pasan.

- [ ] **Paso 9: Commit**

```bash
git add backend/src/controllers/reservas.controller.js
git commit -m "feat: pay reservations with credits transactionally"
```

---

## Tarea 8: Cotización y compra de créditos

Dos endpoints nuevos en el controlador de créditos: cotizar una selección antes
de reservar, y arrancar la compra de un paquete por MercadoPago.

**Files:**
- Modify: `backend/src/controllers/creditos.controller.js`
- Modify: `backend/src/routes/creditos.routes.js`

**Interfaces:**
- Consumes: `creditosParaMontos`, `referenciaCompra` (Tarea 2); `obtenerPaquete`, `crearCompra`, `guardarPreferenciaCompra`, `obtenerPesosPorCredito`, `obtenerSaldo` (Tarea 3); `creditosCotizarSchema`, `creditosComprarSchema` (Tarea 4).
- Produces: `POST /api/creditos/cotizar`, `POST /api/creditos/comprar`.

- [ ] **Paso 1: Agregar los dos manejadores**

Añadir al final de `backend/src/controllers/creditos.controller.js`, y ampliar sus imports:

```javascript
import { creditosParaMontos, referenciaCompra } from "../services/creditos.service.js";
import {
  obtenerPaquete,
  crearCompra,
  guardarPreferenciaCompra,
} from "../repositories/creditos.repository.js";
```

`obtenerSaldo` y `obtenerPesosPorCredito` ya están importados desde la Tarea 5:
no repetir el import, agregar sólo los nombres nuevos a la lista existente del
repositorio.

```javascript
/** Precio por hora de un recurso, ya resuelto contra su fila. */
async function precioRecurso(idRecurso, tipoReserva, minutos) {
  const { rows } = await pool.query(
    'SELECT "PrecioHora", "PrecioSemanal", "PrecioMensual" FROM "Recursos" WHERE "idRecurso" = $1',
    [idRecurso]
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  if (tipoReserva === "semanal") return Number.parseFloat(r.PrecioSemanal) || 0;
  if (tipoReserva === "mensual") return Number.parseFloat(r.PrecioMensual) || 0;

  const precioHora = Number.parseFloat(r.PrecioHora) || 0;
  return precioHora * (minutos / 60);
}

function minutosEntre(horaIni, horaFin) {
  const aMin = (h) => {
    const [hh, mm] = String(h ?? "").split(":").map(Number);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  const ini = aMin(horaIni);
  const fin = aMin(horaFin);
  if (ini == null || fin == null || fin <= ini) return 0;
  return fin - ini;
}

/**
 * POST /api/creditos/cotizar
 * Costo en créditos de la selección actual, para mostrarlo antes de reservar.
 * No reserva ni bloquea nada.
 */
export const cotizarReserva = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const { items, HorarioReserva, HorarioFin, TipoReserva } = req.body;
    const minutos = TipoReserva === "turno" ? minutosEntre(HorarioReserva, HorarioFin) : 0;

    if (TipoReserva === "turno" && minutos <= 0) {
      return res.status(400).json({ message: "El horario de inicio y fin no es válido" });
    }

    const montos = [];
    for (const item of items) {
      const monto = await precioRecurso(item.idRecurso, TipoReserva, minutos);
      if (monto === null) {
        return res.status(404).json({ message: `Recurso ${item.idRecurso} no encontrado` });
      }
      montos.push(monto);
    }

    const [pesosPorCredito, { saldo }] = await Promise.all([
      obtenerPesosPorCredito(pool),
      obtenerSaldo(pool, req.usuario.id),
    ]);

    const creditosNecesarios = creditosParaMontos(montos, pesosPorCredito);
    const montoEnPesos = montos.reduce((acc, m) => acc + m, 0);

    res.json({
      creditosNecesarios,
      montoEnPesos: Math.round(montoEnPesos * 100) / 100,
      saldo,
      alcanza: saldo >= creditosNecesarios,
      creditosFaltantes: Math.max(0, creditosNecesarios - saldo),
      pesosPorCredito,
    });
  } catch (error) {
    console.error("Error al cotizar la reserva en créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * POST /api/creditos/comprar
 * Crea la compra y su preferencia de Mercado Pago (RF09).
 *
 * El cliente solo manda el id del paquete: el precio sale de la fila leída acá,
 * nunca del navegador.
 */
export const comprarCreditos = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(503).json({ message: "Mercado Pago no está configurado en el servidor" });
  }

  try {
    const paquete = await obtenerPaquete(pool, req.body.paqueteId);
    if (!paquete || !paquete.activo) {
      return res.status(404).json({ message: "Paquete no disponible", codigo: "PAQUETE_NO_DISPONIBLE" });
    }

    const precio = Number.parseFloat(paquete.precio);
    if (!(precio > 0)) {
      return res.status(400).json({
        message: "Este paquete no tiene precio de venta. Pedile al coworking que lo acredite manualmente.",
        codigo: "PAQUETE_SIN_PRECIO",
      });
    }

    const compra = await crearCompra(pool, {
      clienteUsuarioId: req.usuario.id,
      paqueteId: paquete.id,
      creditos: paquete.creditos,
      precio,
    });

    const frontend = (process.env.FRONTEND_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
    const backend = (
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
    ).trim().replace(/\/+$/, "");
    const vuelta = `${frontend}/pago/confirmacion?compra=${compra.id}`;

    const preferencia = {
      items: [
        {
          title: `${paquete.creditos} créditos - ${paquete.nombre}`,
          quantity: 1,
          unit_price: precio,
          currency_id: "ARS",
        },
      ],
      external_reference: referenciaCompra(compra.id),
      back_urls: {
        success: vuelta,
        failure: `${vuelta}&resultado=error`,
        pending: `${vuelta}&resultado=pendiente`,
      },
      ...(vuelta.startsWith("https://") ? { auto_return: "approved" } : {}),
      notification_url: `${backend}/api/pagos/webhook`,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferencia),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("Error de Mercado Pago al crear la preferencia de créditos:", mpData);
      return res.status(502).json({ message: "No pudimos iniciar el pago", detail: mpData.message });
    }

    await guardarPreferenciaCompra(pool, compra.id, mpData.id);

    res.status(201).json({
      compraId: compra.id,
      creditos: paquete.creditos,
      precio,
      preferenceId: mpData.id,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
    });
  } catch (error) {
    console.error("Error al iniciar la compra de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
```

- [ ] **Paso 2: Registrar las rutas**

En `backend/src/routes/creditos.routes.js`, ampliar los imports y agregar las rutas:

```javascript
import { validateBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  creditosMovimientosQuerySchema,
  creditosCotizarSchema,
  creditosComprarSchema,
} from "../schemas/validation.schemas.js";
import {
  obtenerMiSaldo,
  obtenerMisMovimientos,
  obtenerPaquetesActivos,
  cotizarReserva,
  comprarCreditos,
} from "../controllers/creditos.controller.js";
```

```javascript
router.post("/cotizar", validateBody(creditosCotizarSchema), cotizarReserva);
router.post("/comprar", validateBody(creditosComprarSchema), comprarCreditos);
```

- [ ] **Paso 3: Verificar la cotización**

```bash
TOKEN=TU_TOKEN_CLIENTE

curl -s -X POST http://localhost:3001/api/creditos/cotizar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"idRecurso":1}],"DiaReserva":"2026-12-20","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}'

curl -s -X POST http://localhost:3001/api/creditos/cotizar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"idRecurso":1},{"idRecurso":2}],"DiaReserva":"2026-12-20","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}'
```

Esperado: las dos respuestas traen `creditosNecesarios`, `saldo`, `alcanza` y
`creditosFaltantes`. La segunda cuesta más que la primera.

- [ ] **Paso 4: Verificar el inicio de la compra**

```bash
TOKEN=TU_TOKEN_CLIENTE

curl -s -X POST http://localhost:3001/api/creditos/comprar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"paqueteId":1}'
```

Esperado: `{"compraId":N,"creditos":100,"precio":10000,"preferenceId":"...","initPoint":"https://..."}`.

Verificar que la compra quedó registrada en estado `pendiente`:

```bash
psql -h localhost -U postgres -d boweworking \
  -c "SELECT id, creditos, precio, estado, mp_preference_id FROM creditos_compra ORDER BY id DESC LIMIT 1;"
```

Esperado: una fila con `estado = pendiente` y `mp_preference_id` no nulo.

Si `MP_ACCESS_TOKEN` no está configurado en el `.env`, el endpoint responde
`503` y esta verificación queda pendiente hasta configurarlo; el resto del plan
no se bloquea por eso.

- [ ] **Paso 5: Commit**

```bash
git add backend/src/controllers/creditos.controller.js backend/src/routes/creditos.routes.js
git commit -m "feat: add credits quote and package purchase endpoints"
```

---

## Tarea 9: Acreditación por webhook y baja del pago de reservas

MercadoPago deja de cobrar reservas y pasa a acreditar créditos. El webhook debe
distinguir los dos casos y ser idempotente: MercadoPago reintenta la misma
notificación varias veces.

**Files:**
- Modify: `backend/src/controllers/mercadopago.controller.js`

**Interfaces:**
- Consumes: `parsearReferenciaCompra`, `estadoCompraParaPago` (Tarea 2); `bloquearCompra`, `bloquearSaldo`, `aplicarMovimiento`, `marcarCompraAcreditada`, `marcarCompraRechazada` (Tarea 3).
- Produces: `POST /api/pagos/crear-preferencia` responde `410`; el webhook acredita compras de créditos.

- [ ] **Paso 1: Importar lo necesario**

En `backend/src/controllers/mercadopago.controller.js`, agregar tras `import pool from "../config/db.js";`:

```javascript
import { parsearReferenciaCompra, estadoCompraParaPago } from "../services/creditos.service.js";
import {
  bloquearCompra,
  bloquearSaldo,
  aplicarMovimiento,
  marcarCompraAcreditada,
  marcarCompraRechazada,
} from "../repositories/creditos.repository.js";
```

- [ ] **Paso 2: Escribir la acreditación de la compra**

Agregar antes de `export const crearPreferencia`:

```javascript
/**
 * Acredita una compra de créditos a partir del pago de Mercado Pago.
 *
 * Idempotente: Mercado Pago reintenta la misma notificación, así que una compra
 * ya acreditada se ignora en silencio. Todo en una transacción con la compra y
 * el saldo bloqueados.
 */
async function acreditarCompraCreditos(compraId, payment, paymentId) {
  const estadoDestino = estadoCompraParaPago(payment.status);
  if (!estadoDestino) return { skipped: true, motivo: "pago en curso" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const compra = await bloquearCompra(client, compraId);
    if (!compra) {
      await client.query("ROLLBACK");
      return { skipped: true, motivo: "compra inexistente" };
    }

    if (compra.estado !== "pendiente") {
      await client.query("ROLLBACK");
      return { compraId, estado: compra.estado, idempotent: true };
    }

    if (estadoDestino === "rechazada") {
      await marcarCompraRechazada(client, compraId, String(paymentId));
      await client.query("COMMIT");
      return { compraId, estado: "rechazada", idempotent: false };
    }

    const saldoActual = await bloquearSaldo(client, compra.cliente_usuario_id);
    const saldoPosterior = saldoActual + compra.creditos;

    await aplicarMovimiento(client, {
      clienteUsuarioId: compra.cliente_usuario_id,
      tipo: "compra_paquete",
      cantidad: compra.creditos,
      saldoPosterior,
      motivo: `Compra de ${compra.creditos} créditos`,
      compraId: compra.id,
    });
    await marcarCompraAcreditada(client, compraId, String(paymentId));

    await client.query("COMMIT");
    return { compraId, estado: "acreditada", saldoPosterior, idempotent: false };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    throw error;
  } finally {
    client.release();
  }
}
```

- [ ] **Paso 3: Dar de baja el checkout de reservas**

Reemplazar el cuerpo completo de `export const crearPreferencia` por:

```javascript
/**
 * Las reservas se pagan con créditos desde este módulo: el checkout de reserva
 * quedó fuera de servicio. Para comprar créditos, POST /api/creditos/comprar.
 */
export const crearPreferencia = async (_req, res) => {
  res.status(410).json({
    message: "Las reservas se pagan con créditos. Comprá créditos desde tu cuenta.",
    codigo: "PAGO_RESERVA_DISCONTINUADO",
  });
};
```

- [ ] **Paso 4: Enrutar el webhook según la referencia**

En `webhook`, reemplazar el bloque que hoy dice:

```javascript
    const payment = await paymentRes.json();
    const result = await persistirPagoMercadoPago(payment, paymentId);

    if (!result.skipped) {
      console.log(
        `[MP Webhook] payment ${paymentId} -> ${result.estadoPago} | reserva ${result.idReserva}${result.idempotent ? " (idempotente)" : ""}`
      );
    }

    res.sendStatus(200);
```

por:

```javascript
    const payment = await paymentRes.json();

    // Una referencia sin el prefijo 'creditos-' es un pago de reserva antiguo:
    // ese flujo está discontinuado y la notificación se ignora.
    const compraId = parsearReferenciaCompra(payment.external_reference);
    if (compraId == null) {
      console.log(`[MP Webhook] payment ${paymentId} ignorado: no es una compra de créditos`);
      return res.sendStatus(200);
    }

    const result = await acreditarCompraCreditos(compraId, payment, paymentId);
    if (!result.skipped) {
      console.log(
        `[MP Webhook] payment ${paymentId} -> compra ${result.compraId} ${result.estado}${result.idempotent ? " (idempotente)" : ""}`
      );
    }

    res.sendStatus(200);
```

- [ ] **Paso 5: Adecuar `verificarPago` y `obtenerEstadoPago`**

`verificarPago` consulta un pago de MercadoPago y persiste el resultado;
`obtenerEstadoPago` lee el estado de una reserva. Con el flujo de reserva dado de
baja, `verificarPago` debe acreditar compras de créditos.

Reemplazar el cuerpo de `verificarPago` por:

```javascript
/**
 * GET /api/pagos/verificar/:paymentId
 * Vuelta del checkout: acredita sin esperar al webhook, que puede demorar.
 */
export const verificarPago = async (req, res) => {
  if (!MP_ACCESS_TOKEN) {
    return res.status(503).json({ message: "Mercado Pago no está configurado en el servidor" });
  }

  try {
    const { paymentId } = req.params;

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!paymentRes.ok) {
      return res.status(502).json({ message: "No pudimos consultar el pago en Mercado Pago" });
    }

    const payment = await paymentRes.json();
    const compraId = parsearReferenciaCompra(payment.external_reference);
    if (compraId == null) {
      return res.status(404).json({ message: "El pago no corresponde a una compra de créditos" });
    }

    const result = await acreditarCompraCreditos(compraId, payment, paymentId);
    res.json({ estadoPago: payment.status, compraId, ...result });
  } catch (error) {
    console.error("Error al verificar el pago:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
```

Y el de `obtenerEstadoPago` por:

```javascript
/**
 * GET /api/pagos/estado/:idReserva
 * El pago de reserva quedó discontinuado; se conserva la ruta para no romper
 * clientes viejos que la sigan consultando.
 */
export const obtenerEstadoPago = async (_req, res) => {
  res.status(410).json({
    message: "Las reservas se pagan con créditos.",
    codigo: "PAGO_RESERVA_DISCONTINUADO",
  });
};
```

- [ ] **Paso 6: Verificar la baja del checkout de reserva**

```bash
TOKEN=TU_TOKEN_CLIENTE

curl -s -X POST http://localhost:3001/api/pagos/crear-preferencia \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"idReserva":1}'
```

Esperado: HTTP `410` con `"codigo":"PAGO_RESERVA_DISCONTINUADO"`.

- [ ] **Paso 7: Verificar la acreditación y su idempotencia**

Simular la acreditación de la compra creada en la Tarea 8 sin depender del
checkout real. Tomar el `id` de la compra pendiente y ejecutar la lógica dos
veces con el mismo pago:

```bash
cd backend && node --input-type=module -e "
import pool from './src/config/db.js';
import { bloquearCompra, bloquearSaldo, aplicarMovimiento, marcarCompraAcreditada, obtenerSaldo } from './src/repositories/creditos.repository.js';

const { rows } = await pool.query(\"SELECT id FROM creditos_compra WHERE estado = 'pendiente' ORDER BY id DESC LIMIT 1\");
if (rows.length === 0) { console.log('No hay compras pendientes: creá una con POST /api/creditos/comprar'); process.exit(0); }
const compraId = rows[0].id;

async function acreditar() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const compra = await bloquearCompra(client, compraId);
    if (compra.estado !== 'pendiente') { await client.query('ROLLBACK'); return 'idempotente'; }
    const saldo = await bloquearSaldo(client, compra.cliente_usuario_id);
    await aplicarMovimiento(client, {
      clienteUsuarioId: compra.cliente_usuario_id, tipo: 'compra_paquete',
      cantidad: compra.creditos, saldoPosterior: saldo + compra.creditos,
      motivo: 'Prueba de acreditación', compraId,
    });
    await marcarCompraAcreditada(client, compraId, 'test-' + compraId);
    await client.query('COMMIT');
    return 'acreditada';
  } finally { client.release(); }
}

console.log('primera vez:', await acreditar());
console.log('segunda vez:', await acreditar());
const { rows: c } = await pool.query('SELECT cliente_usuario_id, creditos FROM creditos_compra WHERE id = \$1', [compraId]);
console.log('saldo final:', (await obtenerSaldo(pool, c[0].cliente_usuario_id)).saldo, '| créditos de la compra:', c[0].creditos);
await pool.end();
"
```

Esperado: `primera vez: acreditada`, `segunda vez: idempotente`, y el saldo
aumentó **una sola vez** por los créditos de la compra.

- [ ] **Paso 8: Correr los tests**

```bash
cd backend && npm test
```

Esperado: todos los tests pasan.

- [ ] **Paso 9: Commit**

```bash
git add backend/src/controllers/mercadopago.controller.js
git commit -m "feat: credit purchases via mercadopago webhook, retire reservation checkout"
```

---

## Tarea 10: Utilidades de formato del frontend

**Files:**
- Create: `src/utils/creditosFormato.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `MOVIMIENTO_LABEL: Record<string, string>`
  - `MOVIMIENTO_COLOR: Record<string, string>`
  - `formatearCantidad(cantidad: number): string`
  - `colorCantidad(cantidad: number): string`
  - `formatearPrecio(precio: number|string): string`
  - `etiquetaCreditos(cantidad: number): string`

- [ ] **Paso 1: Escribir el módulo**

Crear `src/utils/creditosFormato.js`:

```javascript
/** Formato compartido por el historial del perfil y el panel de administración. */

export const MOVIMIENTO_LABEL = {
  descuento_reserva: "Reserva",
  ajuste_admin: "Ajuste del coworking",
  compra_paquete: "Compra de créditos",
  reintegro_cancelacion: "Reintegro por cancelación",
};

export const MOVIMIENTO_COLOR = {
  descuento_reserva: "blue",
  ajuste_admin: "gold",
  compra_paquete: "green",
  reintegro_cancelacion: "purple",
};

/** Con signo siempre: el usuario ve de un vistazo si sumó o restó. */
export function formatearCantidad(cantidad) {
  const n = Number(cantidad);
  if (!Number.isFinite(n)) return "0";
  return n > 0 ? `+${n}` : String(n);
}

export function colorCantidad(cantidad) {
  return Number(cantidad) > 0 ? "green" : "red";
}

export function formatearPrecio(precio) {
  const n = Number(precio);
  if (!Number.isFinite(n)) return "$0,00";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

export function etiquetaCreditos(cantidad) {
  const n = Number(cantidad);
  return `${Number.isFinite(n) ? n : 0} ${Math.abs(n) === 1 ? "crédito" : "créditos"}`;
}
```

- [ ] **Paso 2: Verificar el formato**

```bash
node --input-type=module -e "
import { formatearCantidad, colorCantidad, etiquetaCreditos, MOVIMIENTO_LABEL } from './src/utils/creditosFormato.js';
console.log(formatearCantidad(10), formatearCantidad(-3), colorCantidad(-3), '|', etiquetaCreditos(1), '|', etiquetaCreditos(5), '|', MOVIMIENTO_LABEL.compra_paquete);
"
```

Esperado: `+10 -3 red | 1 crédito | 5 créditos | Compra de créditos`.

- [ ] **Paso 3: Commit**

```bash
git add src/utils/creditosFormato.js
git commit -m "feat: add credits formatting helpers"
```

---

## Tarea 11: Hooks del usuario final

**Files:**
- Create: `src/hooks/useCreditos.js`

**Interfaces:**
- Consumes: `useQuery`, `useMutation`, `useQueryClient`; endpoints de las Tareas 5 y 8.
- Produces:
  - `creditosKeys: { todo, saldo, movimientos: (p) => string[], movimientosTodos, paquetes }`
  - `ApiError` (con `status` y `codigo`)
  - `useSaldoCreditos(token)`
  - `useMovimientosCreditos(token, { limit, offset })`
  - `usePaquetesCreditos(token)`
  - `useCotizarReserva(token)` — `mutateAsync({ items, DiaReserva, HorarioReserva, HorarioFin, TipoReserva })`
  - `useComprarCreditos(token)` — `mutateAsync({ paqueteId })`
  - `useInvalidarCreditos()` — `() => void`

- [ ] **Paso 1: Escribir el hook**

Crear `src/hooks/useCreditos.js`:

```javascript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Agrupadas bajo "creditos" para poder invalidar todo el árbol por prefijo. */
export const creditosKeys = {
  todo: ["creditos"],
  saldo: ["creditos", "saldo"],
  movimientos: (paginacion) => ["creditos", "movimientos", paginacion ?? {}],
  movimientosTodos: ["creditos", "movimientos"],
  paquetes: ["creditos", "paquetes"],
};

/** Conserva status y código para distinguir el 409 de saldo insuficiente. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data ?? {};
    this.codigo = data?.codigo;
  }
}

async function pedir(url, { token, ...init } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ApiError(data?.message || "Error al comunicarse con el servidor", res.status, data);
  }
  return data;
}

/** RF10 */
export function useSaldoCreditos(token) {
  return useQuery({
    queryKey: creditosKeys.saldo,
    queryFn: () => pedir(`${API_URL}/api/creditos/saldo`, { token }),
    enabled: Boolean(token),
  });
}

/** RF06 */
export function useMovimientosCreditos(token, { limit = 10, offset = 0 } = {}) {
  return useQuery({
    queryKey: creditosKeys.movimientos({ limit, offset }),
    queryFn: () =>
      pedir(`${API_URL}/api/creditos/movimientos?limit=${limit}&offset=${offset}`, { token }),
    enabled: Boolean(token),
    placeholderData: (previa) => previa,
  });
}

export function usePaquetesCreditos(token) {
  return useQuery({
    queryKey: creditosKeys.paquetes,
    queryFn: () => pedir(`${API_URL}/api/creditos/paquetes`, { token }),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
}

/** Costo en créditos de la selección actual, antes de reservar. */
export function useCotizarReserva(token) {
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/creditos/cotizar`, {
        token,
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** Devuelve la preferencia de Mercado Pago para redirigir al checkout. */
export function useComprarCreditos(token) {
  return useMutation({
    mutationFn: ({ paqueteId }) =>
      pedir(`${API_URL}/api/creditos/comprar`, {
        token,
        method: "POST",
        body: JSON.stringify({ paqueteId }),
      }),
  });
}

/** Lo usa cualquier acción ajena a este archivo que mueva el saldo. */
export function useInvalidarCreditos() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: creditosKeys.todo });
  }, [qc]);
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Paso 3: Commit**

```bash
git add src/hooks/useCreditos.js
git commit -m "feat: add end-user credits query hooks"
```

---

## Tarea 12: Pop-up de compra y widget de saldo (RF09, RF10)

**Files:**
- Create: `src/components/ComprarCreditosModal.jsx`
- Create: `src/components/SaldoCreditosWidget.jsx`
- Modify: `src/components/header.jsx`

**Interfaces:**
- Consumes: `useSaldoCreditos`, `usePaquetesCreditos`, `useComprarCreditos` (Tarea 11); `formatearPrecio`, `etiquetaCreditos` (Tarea 10); `useAuth` (expone `token`, `user`, `isAuthenticated`, `isStaff`).
- Produces:
  - `ComprarCreditosModal` — props `{ abierto: boolean, onCerrar: () => void, creditosFaltantes?: number }`
  - `SaldoCreditosWidget` — sin props.

- [ ] **Paso 1: Escribir el pop-up de compra**

Crear `src/components/ComprarCreditosModal.jsx`:

```jsx
import React, { useState } from "react";
import { Modal, Card, Button, Space, Typography, Empty, Alert, Spin, Tag } from "antd";
import { WalletOutlined, CreditCardOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";
import {
  useSaldoCreditos,
  usePaquetesCreditos,
  useComprarCreditos,
} from "../hooks/useCreditos.js";
import { formatearPrecio, etiquetaCreditos } from "../utils/creditosFormato.js";

const { Text, Paragraph } = Typography;

/**
 * Compra de créditos con Mercado Pago (RF09).
 *
 * `creditosFaltantes` llega cuando el pop-up se abre porque una reserva no
 * tenía saldo: sirve para resaltar el paquete más chico que alcanza.
 */
export default function ComprarCreditosModal({ abierto, onCerrar, creditosFaltantes = 0 }) {
  const auth = useAuth();
  const [seleccionado, setSeleccionado] = useState(null);

  const { data: saldoData } = useSaldoCreditos(abierto ? auth.token : null);
  const { data, isLoading, isError, error } = usePaquetesCreditos(abierto ? auth.token : null);
  const comprar = useComprarCreditos(auth.token);

  const paquetes = data?.paquetes ?? [];
  const sugerido = creditosFaltantes > 0
    ? paquetes.find((p) => p.creditos >= creditosFaltantes)
    : null;

  const onComprar = async (paquete) => {
    setSeleccionado(paquete.id);
    try {
      const resultado = await comprar.mutateAsync({ paqueteId: paquete.id });
      window.location.href = resultado.sandboxInitPoint || resultado.initPoint;
    } catch (e) {
      Modal.error({ title: "No pudimos iniciar el pago", content: e.message });
      setSeleccionado(null);
    }
  };

  return (
    <Modal
      open={abierto}
      onCancel={onCerrar}
      footer={<Button onClick={onCerrar}>Cerrar</Button>}
      title="Comprar créditos"
      width={720}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Text>
          <WalletOutlined /> Tu saldo: <strong>{etiquetaCreditos(saldoData?.saldo ?? 0)}</strong>
        </Text>

        {creditosFaltantes > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`Te faltan ${etiquetaCreditos(creditosFaltantes)} para confirmar esa reserva`}
            description="Elegí un paquete para completar tu saldo y volvé a intentar la reserva."
          />
        )}

        {isError && (
          <Alert type="error" showIcon message="No pudimos cargar los paquetes" description={error?.message} />
        )}

        {isLoading && <Spin />}

        {!isLoading && paquetes.length === 0 && (
          <Empty description="Todavía no hay paquetes disponibles. Consultá con el coworking." />
        )}

        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          {paquetes.map((paquete) => (
            <Card key={paquete.id} size="small">
              <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                <Space direction="vertical" size={0}>
                  <Space>
                    <Text strong>{paquete.nombre}</Text>
                    {sugerido?.id === paquete.id && <Tag color="green">Te alcanza</Tag>}
                  </Space>
                  <Text type="secondary">
                    {etiquetaCreditos(paquete.creditos)} · {formatearPrecio(paquete.precio)}
                  </Text>
                  {paquete.descripcion && (
                    <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                      {paquete.descripcion}
                    </Paragraph>
                  )}
                </Space>

                <Button
                  type="primary"
                  icon={<CreditCardOutlined />}
                  loading={comprar.isPending && seleccionado === paquete.id}
                  onClick={() => onComprar(paquete)}
                >
                  Pagar con Mercado Pago
                </Button>
              </Space>
            </Card>
          ))}
        </Space>
      </Space>
    </Modal>
  );
}
```

- [ ] **Paso 2: Escribir el widget del header**

Crear `src/components/SaldoCreditosWidget.jsx`:

```jsx
import React, { useState } from "react";
import { Tooltip, Skeleton } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";
import { useSaldoCreditos } from "../hooks/useCreditos.js";
import ComprarCreditosModal from "./ComprarCreditosModal.jsx";
import { etiquetaCreditos } from "../utils/creditosFormato.js";

/** Saldo siempre a la vista, junto al perfil (RF10). Abre la compra al clic. */
export default function SaldoCreditosWidget() {
  const auth = useAuth();
  const [comprando, setComprando] = useState(false);
  const habilitado = auth.isAuthenticated && !auth.isStaff;

  const { data, isLoading, isError } = useSaldoCreditos(habilitado ? auth.token : null);

  if (!habilitado) return null;
  if (isLoading) return <Skeleton.Button active size="small" style={{ width: 104 }} />;

  // Un fallo de red no debe romper el header.
  if (isError || !data) return null;

  return (
    <>
      <Tooltip title="Comprar créditos">
        <button
          type="button"
          className="header__user-btn"
          onClick={() => setComprando(true)}
          aria-label={`Tenés ${etiquetaCreditos(data.saldo)}. Comprar más.`}
        >
          <WalletOutlined />
          <span className="header__user-name">{etiquetaCreditos(data.saldo)}</span>
        </button>
      </Tooltip>

      <ComprarCreditosModal abierto={comprando} onCerrar={() => setComprando(false)} />
    </>
  );
}
```

- [ ] **Paso 3: Montar el widget en el header**

En `src/components/header.jsx`, agregar el import:

```jsx
import SaldoCreditosWidget from "./SaldoCreditosWidget.jsx";
```

Dentro de `<div className="header__auth">`, en la rama del usuario final autenticado, envolver el `Dropdown` para que el widget lo preceda:

```jsx
          ) : auth.isAuthenticated ? (
            <>
              <SaldoCreditosWidget />
              <Dropdown menu={menuUsuario} placement="bottomRight" trigger={["click"]}>
                <button type="button" className="header__user-btn">
                  <UserOutlined />
                  <span className="header__user-name">{auth.user?.nombre}</span>
                </button>
              </Dropdown>
            </>
          ) : (
```

- [ ] **Paso 4: Verificar en el navegador**

Levantar `cd backend && npm run dev` y `npm run dev`. Con la cuenta de usuario final:
1. El chip de créditos aparece a la izquierda del nombre, con el saldo real.
2. Al hacer clic se abre el pop-up con los paquetes cargados y el logo de pago.
3. Con una cuenta de staff, el chip no aparece.
4. Sin sesión iniciada, el chip no aparece.

- [ ] **Paso 5: Commit**

```bash
git add src/components/SaldoCreditosWidget.jsx src/components/ComprarCreditosModal.jsx src/components/header.jsx
git commit -m "feat: add credits balance widget and purchase modal"
```

---

## Tarea 13: Cotización en vivo y baja del pago de reserva

Al seleccionar espacios, el total en créditos se actualiza en cada cambio. Al
confirmar sin saldo, se abre la compra con el faltante ya calculado. Y el bloque
de "Cómo querés pagar" con MercadoPago desaparece.

**Files:**
- Modify: `src/pages/public/registrocliente.jsx`

**Interfaces:**
- Consumes: `useCotizarReserva`, `useSaldoCreditos`, `useInvalidarCreditos`, `ApiError` (Tarea 11); `ComprarCreditosModal` (Tarea 12); `etiquetaCreditos` (Tarea 10).
- Produces: nada nuevo.

- [ ] **Paso 1: Importar lo necesario**

En `src/pages/public/registrocliente.jsx`, agregar junto a los imports existentes:

```jsx
import ComprarCreditosModal from "../../components/ComprarCreditosModal.jsx";
import { useCotizarReserva, useSaldoCreditos, useInvalidarCreditos } from "../../hooks/useCreditos.js";
import { etiquetaCreditos } from "../../utils/creditosFormato.js";
```

- [ ] **Paso 2: Agregar el estado de cotización**

Dentro del componente, después del `useMemo` de `montoTotal` (alrededor de la línea 484), agregar:

```jsx
  const { token } = useAuth();
  const { data: saldoData } = useSaldoCreditos(token);
  const cotizar = useCotizarReserva(token);
  const invalidarCreditos = useInvalidarCreditos();

  const [cotizacion, setCotizacion] = useState(null);
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [creditosFaltantes, setCreditosFaltantes] = useState(0);

  // El total en créditos se recalcula en cada cambio de selección: el cliente
  // ve qué le va a costar antes de confirmar.
  useEffect(() => {
    const idsSeleccionados =
      activeTab === "turno"
        ? selectedRecursosTurno.map((r) => ({ idRecurso: r.idRecurso }))
        : activeTab === "pack" && selectedRecursoPack
          ? [{ idRecurso: selectedRecursoPack.idRecurso }]
          : [];

    if (!token || idsSeleccionados.length === 0 || !fecha) {
      setCotizacion(null);
      return;
    }

    let cancelado = false;
    cotizar
      .mutateAsync({
        items: idsSeleccionados,
        DiaReserva: fecha,
        HorarioReserva: activeTab === "turno" ? horaInicio : null,
        HorarioFin: activeTab === "turno" ? horaFin : null,
        TipoReserva: activeTab === "turno" ? "turno" : packTipo,
      })
      .then((r) => {
        if (!cancelado) setCotizacion(r);
      })
      .catch(() => {
        if (!cancelado) setCotizacion(null);
      });

    return () => {
      cancelado = true;
    };
  }, [token, activeTab, selectedRecursosTurno, selectedRecursoPack, packTipo, fecha, horaInicio, horaFin]);
```

Ajustar los nombres `fecha`, `horaInicio`, `horaFin` y `selectedRecursoPack.idRecurso` a las variables de estado que el archivo realmente usa: leerlas del `useMemo` de `montoTotal` y del cuerpo de `submitReserva`, que ya las referencian. Si el archivo llama a la fecha `fechaSeleccionada` o a las horas `turnoInicio`/`turnoFin`, usar esos nombres.

- [ ] **Paso 3: Mostrar el costo en créditos junto al monto**

Buscar dónde se muestra `montoTotal` en la interfaz:

```bash
grep -n "montoTotal" src/pages/public/registrocliente.jsx
```

Junto a ese importe, agregar el costo en créditos y el saldo:

```jsx
              {cotizacion && (
                <div className={styles.fieldHint}>
                  Costo: <strong>{etiquetaCreditos(cotizacion.creditosNecesarios)}</strong>
                  {" · "}
                  Tu saldo: {etiquetaCreditos(cotizacion.saldo)}
                  {!cotizacion.alcanza && (
                    <>
                      {" · "}
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0 }}
                        onClick={() => {
                          setCreditosFaltantes(cotizacion.creditosFaltantes);
                          setCompraAbierta(true);
                        }}
                      >
                        Te faltan {cotizacion.creditosFaltantes}: comprar créditos
                      </Button>
                    </>
                  )}
                </div>
              )}
```

- [ ] **Paso 4: Abrir la compra cuando la reserva falla por saldo**

En `submitReserva`, donde se maneja el error de la respuesta de creación, agregar el caso del `409`:

```jsx
      if (!res.ok) {
        if (res.status === 409 && data?.codigo === "SALDO_INSUFICIENTE") {
          setCreditosFaltantes(data.creditosFaltantes ?? 0);
          setCompraAbierta(true);
          message.warning(data.message);
          return false;
        }
        message.error(data.message || "No pudimos crear la reserva");
        return false;
      }
```

Y tras una creación exitosa, invalidar el saldo:

```jsx
      invalidarCreditos();
```

- [ ] **Paso 5: Dar de baja el bloque de pago de reserva**

Eliminar por completo la función `handlePagarMP` (alrededor de la línea 486) y el estado `mpLoading` que solo ella usa.

Reemplazar el bloque `<div className={styles.pagoSection}>` completo (alrededor de la línea 1532, desde `<div className={styles.pagoSection}>` hasta su `</div>` de cierre) por el resumen de lo ya pagado con créditos:

```jsx
          <div className={styles.pagoSection}>
            <div className={styles.pagoDivider} />
            <h4 className={styles.pagoTitle}>Pago</h4>
            <p className={styles.fieldHint}>
              {reservaCreada.creditos
                ? `Se descontaron ${etiquetaCreditos(reservaCreada.creditos.descontados)} de tu saldo. Te quedan ${etiquetaCreditos(reservaCreada.creditos.saldo)}.`
                : "Tu reserva quedó confirmada."}
            </p>
          </div>
```

Para que `reservaCreada.creditos` exista, en `submitReserva` guardar la clave que devuelve el backend al armar el objeto `reservaCreada`: agregar `creditos: data.creditos` junto a los campos que ya se guardan (`id`, `multiple`, `ids`, `idReservaGrupo`, `serie`, etc.).

- [ ] **Paso 6: Montar el pop-up de compra en la página**

Antes del cierre del JSX principal del componente, agregar:

```jsx
      <ComprarCreditosModal
        abierto={compraAbierta}
        creditosFaltantes={creditosFaltantes}
        onCerrar={() => setCompraAbierta(false)}
      />
```

- [ ] **Paso 7: Verificar que no quedaron referencias al checkout de reserva**

```bash
grep -n "crear-preferencia\|handlePagarMP\|mpLoading\|btnMercadoPago" src/pages/public/registrocliente.jsx
```

Esperado: sin resultados.

- [ ] **Paso 8: Verificar el flujo completo en el navegador**

Con backend y frontend levantados, como usuario final:
1. Seleccionar un espacio: aparece el costo en créditos y el saldo.
2. Seleccionar un segundo espacio: el costo sube.
3. Deseleccionar uno: el costo baja.
4. Con saldo suficiente, confirmar: la reserva se crea y el resumen dice cuántos
   créditos se descontaron y cuántos quedan. El chip del header baja solo.
5. Con saldo insuficiente (vaciarlo desde el panel admin), confirmar: aparece el
   aviso de saldo faltante y se abre el pop-up de compra con el faltante resaltado.

- [ ] **Paso 9: Verificar que compila**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Paso 10: Commit**

```bash
git add src/pages/public/registrocliente.jsx
git commit -m "feat: quote reservations in credits and retire reservation checkout"
```

---

## Tarea 14: Historial en el perfil y vuelta del checkout

**Files:**
- Create: `src/components/HistorialCreditos.jsx`
- Modify: `src/pages/public/perfil.jsx`
- Modify: `src/pages/public/pagoConfirmacion.jsx`

**Interfaces:**
- Consumes: `useSaldoCreditos`, `useMovimientosCreditos`, `useInvalidarCreditos` (Tarea 11); formato (Tarea 10).
- Produces: `HistorialCreditos` sin props.

- [ ] **Paso 1: Escribir el historial**

Crear `src/components/HistorialCreditos.jsx`:

```jsx
import React, { useState } from "react";
import dayjs from "dayjs";
import { Card, Table, Tag, Statistic, Empty, Typography, Alert, Button } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";
import { useSaldoCreditos, useMovimientosCreditos } from "../hooks/useCreditos.js";
import ComprarCreditosModal from "./ComprarCreditosModal.jsx";
import {
  MOVIMIENTO_LABEL,
  MOVIMIENTO_COLOR,
  formatearCantidad,
  colorCantidad,
} from "../utils/creditosFormato.js";

const { Text } = Typography;
const TAMANIO_PAGINA = 10;

/** Saldo y libro de movimientos del usuario (RF06, RF10). */
export default function HistorialCreditos() {
  const auth = useAuth();
  const [pagina, setPagina] = useState(1);
  const [comprando, setComprando] = useState(false);

  const { data: saldoData } = useSaldoCreditos(auth.token);
  const { data, isLoading, isError, error } = useMovimientosCreditos(auth.token, {
    limit: TAMANIO_PAGINA,
    offset: (pagina - 1) * TAMANIO_PAGINA,
  });

  const columnas = [
    {
      title: "Fecha",
      dataIndex: "created_at",
      key: "fecha",
      render: (valor) => dayjs(valor).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Concepto",
      dataIndex: "tipo",
      key: "tipo",
      render: (tipo) => (
        <Tag color={MOVIMIENTO_COLOR[tipo] ?? "default"}>{MOVIMIENTO_LABEL[tipo] ?? tipo}</Tag>
      ),
    },
    {
      title: "Detalle",
      dataIndex: "motivo",
      key: "motivo",
      render: (motivo) => motivo || <Text type="secondary">—</Text>,
    },
    {
      title: "Créditos",
      dataIndex: "cantidad",
      key: "cantidad",
      align: "right",
      render: (cantidad) => (
        <Text strong style={{ color: colorCantidad(cantidad) }}>
          {formatearCantidad(cantidad)}
        </Text>
      ),
    },
    { title: "Saldo", dataIndex: "saldo_posterior", key: "saldo", align: "right" },
  ];

  return (
    <Card
      id="creditos"
      title="Mis créditos"
      extra={<Button type="primary" onClick={() => setComprando(true)}>Comprar créditos</Button>}
    >
      <Statistic
        title="Saldo disponible"
        value={saldoData?.saldo ?? 0}
        prefix={<WalletOutlined />}
        suffix={saldoData?.saldo === 1 ? "crédito" : "créditos"}
        valueStyle={{ color: (saldoData?.saldo ?? 0) < 0 ? "#cf1322" : undefined }}
        style={{ marginBottom: 24 }}
      />

      {isError && (
        <Alert
          type="error"
          showIcon
          message="No pudimos cargar tus movimientos"
          description={error?.message}
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        rowKey="id"
        columns={columnas}
        dataSource={data?.movimientos ?? []}
        loading={isLoading}
        size="small"
        scroll={{ x: true }}
        locale={{ emptyText: <Empty description="Todavía no tenés movimientos de créditos" /> }}
        pagination={{
          current: pagina,
          pageSize: TAMANIO_PAGINA,
          total: data?.total ?? 0,
          onChange: setPagina,
          showSizeChanger: false,
        }}
      />

      <ComprarCreditosModal abierto={comprando} onCerrar={() => setComprando(false)} />
    </Card>
  );
}
```

- [ ] **Paso 2: Incluirlo en el perfil y dar de baja el pago de reserva**

En `src/pages/public/perfil.jsx`, agregar el import:

```jsx
import HistorialCreditos from "../../components/HistorialCreditos.jsx";
```

Insertar el componente inmediatamente antes del `Card` con `title="Mis Reservas"` (alrededor de la línea 659):

```jsx
          <HistorialCreditos />
```

Eliminar el manejador que llama a `crear-preferencia` (alrededor de la línea 294) y el botón o columna que lo dispara. Localizarlos con:

```bash
grep -n "crear-preferencia\|puedePagar\|pagoAccion\|initPoint" src/pages/public/perfil.jsx
```

La columna `pagoAccion` de la tabla de reservas deja de tener sentido: quitarla del array de columnas junto con el manejador y el estado de carga que solo ella usaba.

- [ ] **Paso 3: Adaptar la vuelta del checkout**

`src/pages/public/pagoConfirmacion.jsx` hoy espera `?idReserva=`. La compra de
créditos vuelve con `?compra=<id>`. Leer el archivo completo y reemplazar su
lógica de verificación por:

```jsx
  const [params] = useSearchParams();
  const compraId = params.get("compra");
  const paymentId = params.get("payment_id");
  const resultado = params.get("resultado");
  const invalidarCreditos = useInvalidarCreditos();

  useEffect(() => {
    if (!paymentId) return;

    // Se verifica sin esperar al webhook, que puede demorar unos segundos.
    authFetch(`${API_URL}/api/pagos/verificar/${paymentId}`)
      .then((res) => res.json())
      .then(() => invalidarCreditos())
      .catch(() => {
        /* el webhook acreditará igual: no hay nada que hacer acá */
      });
  }, [paymentId, invalidarCreditos]);
```

Y el texto que ve el usuario, según `resultado`:
- sin `resultado`: "Tu compra se acreditó. Ya podés reservar con tus créditos."
- `resultado=pendiente`: "Tu pago está en proceso. Vas a ver los créditos en tu cuenta cuando se acredite."
- `resultado=error`: "El pago no se completó. Podés intentarlo de nuevo desde tu cuenta."

Agregar los imports que haga falta (`useInvalidarCreditos` de `../../hooks/useCreditos.js`) y conservar el layout y las clases CSS que la página ya tiene.

- [ ] **Paso 4: Verificar en el navegador**

Con backend y frontend levantados, como usuario final en `/perfil`:
1. La tarjeta "Mis créditos" muestra el saldo y el botón de comprar.
2. La tabla lista el ajuste manual de la Tarea 6 y el descuento de la Tarea 7.
3. La tabla de reservas ya no tiene botón de pagar con MercadoPago.
4. Abrir a mano `/pago/confirmacion?compra=1&resultado=pendiente`: se ve el
   mensaje de pago en proceso sin errores en la consola.

- [ ] **Paso 5: Verificar que compila**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Paso 6: Commit**

```bash
git add src/components/HistorialCreditos.jsx src/pages/public/perfil.jsx src/pages/public/pagoConfirmacion.jsx
git commit -m "feat: add credits history and credit purchase return flow"
```

---

## Tarea 15: Hooks de administración

**Files:**
- Create: `src/hooks/useAdminCreditos.js`

**Interfaces:**
- Consumes: endpoints de la Tarea 6.
- Produces:
  - `adminCreditosKeys: { todo, paquetes, usuario: (id) => string[] }`
  - `ApiError`
  - `usePaquetesAdmin(token)`
  - `useCrearPaquete(token)` — `mutateAsync({ nombre, creditos, precio, descripcion })`
  - `useActualizarPaquete(token)` — `mutateAsync({ id, nombre, creditos, precio, descripcion, activo })`
  - `useEliminarPaquete(token)` — `mutateAsync(id)`
  - `useCreditosDeUsuario(token, id)`
  - `useAjustarCreditos(token)` — `mutateAsync({ id, cantidad, motivo, permitirNegativo })`

- [ ] **Paso 1: Escribir el hook**

Crear `src/hooks/useAdminCreditos.js`:

```javascript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const adminCreditosKeys = {
  todo: ["admin", "creditos"],
  paquetes: ["admin", "creditos", "paquetes"],
  usuario: (id) => ["admin", "creditos", "usuario", id],
};

/** Conserva status y código para distinguir el 409 de saldo negativo. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data ?? {};
    this.codigo = data?.codigo;
  }
}

async function pedir(url, { token, ...init } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ApiError(data?.message || "Error al comunicarse con el servidor", res.status, data);
  }
  return data;
}

export function usePaquetesAdmin(token) {
  return useQuery({
    queryKey: adminCreditosKeys.paquetes,
    queryFn: () => pedir(`${API_URL}/api/admin/creditos/paquetes`, { token }),
    enabled: Boolean(token),
  });
}

export function useCrearPaquete(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/admin/creditos/paquetes`, {
        token,
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCreditosKeys.paquetes }),
  });
}

export function useActualizarPaquete(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      pedir(`${API_URL}/api/admin/creditos/paquetes/${id}`, {
        token,
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCreditosKeys.paquetes }),
  });
}

export function useEliminarPaquete(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      pedir(`${API_URL}/api/admin/creditos/paquetes/${id}`, { token, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminCreditosKeys.paquetes }),
  });
}

export function useCreditosDeUsuario(token, id) {
  return useQuery({
    queryKey: adminCreditosKeys.usuario(id),
    queryFn: () => pedir(`${API_URL}/api/admin/creditos/usuarios/${id}`, { token }),
    enabled: Boolean(token && id),
    retry: false,
  });
}

export function useAjustarCreditos(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cantidad, motivo, permitirNegativo }) =>
      pedir(`${API_URL}/api/admin/creditos/usuarios/${id}/ajuste`, {
        token,
        method: "POST",
        body: JSON.stringify({ cantidad, motivo, permitirNegativo: Boolean(permitirNegativo) }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: adminCreditosKeys.usuario(variables.id) });
    },
  });
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Paso 3: Commit**

```bash
git add src/hooks/useAdminCreditos.js
git commit -m "feat: add admin credits query hooks"
```

---

## Tarea 16: Panel de administración de créditos (RF08, RF09)

**Files:**
- Create: `src/pages/admin/GestionCreditos.jsx`
- Modify: `src/App.jsx`
- Modify: `src/pages/admin/PanelAdmin.jsx`

**Interfaces:**
- Consumes: hooks de la Tarea 15; formato de la Tarea 10; `useUsuariosFinales` de `src/hooks/useAdminUsuarios.js` (devuelve `{ items, total }`); `AdminPageHeader` (acepta `eyebrow`, `icon`, `title`, `description`, `meta`, `actions`).
- Produces: `GestionCreditos`; ruta `/admin-creditos`.

- [ ] **Paso 1: Escribir la página**

Crear `src/pages/admin/GestionCreditos.jsx`:

```jsx
import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Switch,
  Space, Tag, Typography, message, Select, Statistic, Empty, Alert,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, WalletOutlined } from "@ant-design/icons";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useUsuariosFinales } from "../../hooks/useAdminUsuarios.js";
import {
  usePaquetesAdmin,
  useCrearPaquete,
  useActualizarPaquete,
  useEliminarPaquete,
  useCreditosDeUsuario,
  useAjustarCreditos,
} from "../../hooks/useAdminCreditos.js";
import {
  formatearPrecio,
  MOVIMIENTO_LABEL,
  MOVIMIENTO_COLOR,
  formatearCantidad,
  colorCantidad,
} from "../../utils/creditosFormato.js";

const { Text, Paragraph } = Typography;

/** `paquete` en null significa alta (RF09). */
function ModalPaquete({ abierto, paquete, token, onCerrar }) {
  const [form] = Form.useForm();
  const crear = useCrearPaquete(token);
  const actualizar = useActualizarPaquete(token);
  const esEdicion = Boolean(paquete);

  useEffect(() => {
    if (!abierto) return;
    form.setFieldsValue(
      paquete
        ? {
            nombre: paquete.nombre,
            creditos: paquete.creditos,
            precio: Number(paquete.precio),
            descripcion: paquete.descripcion ?? "",
            activo: paquete.activo,
          }
        : { nombre: "", creditos: 100, precio: 10000, descripcion: "", activo: true }
    );
  }, [abierto, paquete, form]);

  const onFinish = async (valores) => {
    try {
      if (esEdicion) {
        await actualizar.mutateAsync({ id: paquete.id, ...valores });
        message.success("Paquete actualizado");
      } else {
        await crear.mutateAsync(valores);
        message.success("Paquete creado");
      }
      onCerrar();
    } catch (e) {
      message.error(e.message);
    }
  };

  return (
    <Modal
      open={abierto}
      onCancel={onCerrar}
      onOk={() => form.submit()}
      okText={esEdicion ? "Guardar" : "Crear"}
      cancelText="Cancelar"
      title={esEdicion ? `Editar ${paquete.nombre}` : "Nuevo paquete de créditos"}
      confirmLoading={crear.isPending || actualizar.isPending}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="nombre"
          label="Nombre"
          rules={[{ required: true, message: "El nombre es obligatorio" }]}
        >
          <Input maxLength={120} placeholder="Pack 100 créditos" />
        </Form.Item>

        <Form.Item
          name="creditos"
          label="Créditos"
          rules={[{ required: true, message: "Indicá cuántos créditos incluye" }]}
        >
          <InputNumber min={1} step={1} precision={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          name="precio"
          label="Precio (ARS)"
          rules={[{ required: true, message: "Indicá el precio" }]}
        >
          <InputNumber min={0} step={100} precision={2} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item name="descripcion" label="Descripción">
          <Input.TextArea rows={3} maxLength={1000} />
        </Form.Item>

        {esEdicion && (
          <Form.Item name="activo" label="Activo" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function PanelPaquetes({ token }) {
  const { data, isLoading } = usePaquetesAdmin(token);
  const eliminar = useEliminarPaquete(token);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [enEdicion, setEnEdicion] = useState(null);

  const confirmarBaja = (paquete) => {
    Modal.confirm({
      title: `¿Dar de baja "${paquete.nombre}"?`,
      content:
        "Deja de ofrecerse a los usuarios pero se conserva en el historial de compras. Podés reactivarlo editándolo.",
      okText: "Dar de baja",
      cancelText: "Cancelar",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await eliminar.mutateAsync(paquete.id);
          message.success("Paquete dado de baja");
        } catch (e) {
          message.error(e.message);
        }
      },
    });
  };

  const columnas = [
    { title: "Nombre", dataIndex: "nombre", key: "nombre" },
    { title: "Créditos", dataIndex: "creditos", key: "creditos", align: "right" },
    {
      title: "Precio",
      dataIndex: "precio",
      key: "precio",
      align: "right",
      render: (precio) => formatearPrecio(precio),
    },
    {
      title: "Estado",
      dataIndex: "activo",
      key: "activo",
      render: (activo) => (
        <Tag color={activo ? "green" : "default"}>{activo ? "Activo" : "Dado de baja"}</Tag>
      ),
    },
    {
      title: "Acciones",
      key: "acciones",
      render: (_valor, paquete) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEnEdicion(paquete);
              setModalAbierto(true);
            }}
          >
            Editar
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!paquete.activo}
            onClick={() => confirmarBaja(paquete)}
          >
            Dar de baja
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          setEnEdicion(null);
          setModalAbierto(true);
        }}
      >
        Nuevo paquete
      </Button>

      <Table
        rowKey="id"
        columns={columnas}
        dataSource={data?.paquetes ?? []}
        loading={isLoading}
        size="small"
        scroll={{ x: true }}
        locale={{ emptyText: <Empty description="Todavía no hay paquetes cargados" /> }}
      />

      <ModalPaquete
        abierto={modalAbierto}
        paquete={enEdicion}
        token={token}
        onCerrar={() => setModalAbierto(false)}
      />
    </Space>
  );
}

/** Buscador de usuario, saldo, movimientos y ajuste manual (RF08). */
function PanelAjustes({ token }) {
  const [busqueda, setBusqueda] = useState("");
  const [usuarioId, setUsuarioId] = useState(null);
  const [form] = Form.useForm();

  const { data: listado, isFetching } = useUsuariosFinales(token, { q: busqueda, limit: 20 });
  const { data, isLoading, isError, error } = useCreditosDeUsuario(token, usuarioId);
  const ajustar = useAjustarCreditos(token);

  const opciones = (listado?.items ?? []).map((u) => ({
    value: u.id,
    label: `${u.nombre} ${u.apellido} — ${u.email}`,
  }));

  const onFinish = async (valores) => {
    try {
      const resultado = await ajustar.mutateAsync({ id: usuarioId, ...valores });
      message.success(`Saldo actualizado: ${resultado.saldo} créditos`);
      form.resetFields();
    } catch (e) {
      if (e.codigo === "SALDO_NEGATIVO_NO_AUTORIZADO") {
        message.warning(e.message);
      } else {
        message.error(e.message);
      }
    }
  };

  const columnas = [
    {
      title: "Fecha",
      dataIndex: "created_at",
      key: "fecha",
      render: (valor) => dayjs(valor).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Concepto",
      dataIndex: "tipo",
      key: "tipo",
      render: (tipo) => (
        <Tag color={MOVIMIENTO_COLOR[tipo] ?? "default"}>{MOVIMIENTO_LABEL[tipo] ?? tipo}</Tag>
      ),
    },
    {
      title: "Motivo",
      dataIndex: "motivo",
      key: "motivo",
      render: (motivo) => motivo || <Text type="secondary">—</Text>,
    },
    {
      title: "Créditos",
      dataIndex: "cantidad",
      key: "cantidad",
      align: "right",
      render: (cantidad) => (
        <Text strong style={{ color: colorCantidad(cantidad) }}>
          {formatearCantidad(cantidad)}
        </Text>
      ),
    },
    { title: "Saldo", dataIndex: "saldo_posterior", key: "saldo", align: "right" },
  ];

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Select
        showSearch
        allowClear
        style={{ width: "100%", maxWidth: 520 }}
        placeholder="Buscá por nombre, apellido o email"
        filterOption={false}
        loading={isFetching}
        onSearch={setBusqueda}
        onChange={setUsuarioId}
        options={opciones}
        notFoundContent={isFetching ? "Buscando…" : "Sin resultados"}
      />

      {!usuarioId && (
        <Paragraph type="secondary">Elegí un usuario para ver su saldo y ajustarlo.</Paragraph>
      )}

      {isError && (
        <Alert type="error" showIcon message="No pudimos cargar el saldo" description={error?.message} />
      )}

      {usuarioId && data && (
        <>
          <Statistic
            title={`Saldo de ${data.usuario.nombre} ${data.usuario.apellido}`}
            value={data.saldo}
            prefix={<WalletOutlined />}
            suffix={data.saldo === 1 ? "crédito" : "créditos"}
            valueStyle={{ color: data.saldo < 0 ? "#cf1322" : undefined }}
          />

          <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 520 }}>
            <Form.Item
              name="cantidad"
              label="Créditos a sumar o restar"
              extra="Positivo acredita, negativo descuenta. Cero no es un ajuste válido."
              rules={[{ required: true, message: "Indicá la cantidad" }]}
            >
              <InputNumber step={1} precision={0} style={{ width: "100%" }} placeholder="10 o -5" />
            </Form.Item>

            <Form.Item
              name="motivo"
              label="Motivo"
              rules={[{ required: true, min: 3, message: "El motivo es obligatorio (mínimo 3 caracteres)" }]}
            >
              <Input.TextArea rows={2} maxLength={500} placeholder="Compra presencial, corrección de carga…" />
            </Form.Item>

            <Form.Item
              name="permitirNegativo"
              label="Permitir que el saldo quede negativo"
              valuePropName="checked"
              extra="Solo si el ajuste debe dejar al usuario en deuda."
            >
              <Switch />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={ajustar.isPending}>
              Aplicar ajuste
            </Button>
          </Form>

          <Table
            rowKey="id"
            columns={columnas}
            dataSource={data.movimientos ?? []}
            loading={isLoading}
            size="small"
            scroll={{ x: true }}
            locale={{ emptyText: <Empty description="Sin movimientos registrados" /> }}
            pagination={false}
          />
        </>
      )}
    </Space>
  );
}

export default function GestionCreditos() {
  const auth = useAuth();

  return (
    <>
      <AdminPageHeader
        eyebrow="Administración"
        icon={<WalletOutlined />}
        title="Gestión de créditos"
        description="Configurá los paquetes de créditos y ajustá el saldo de un usuario puntual."
      />
      <div style={{ padding: 24 }}>
        <Tabs
          items={[
            { key: "paquetes", label: "Paquetes", children: <PanelPaquetes token={auth.token} /> },
            { key: "ajustes", label: "Ajustes de saldo", children: <PanelAjustes token={auth.token} /> },
          ]}
        />
      </div>
    </>
  );
}
```

- [ ] **Paso 2: Registrar la ruta protegida**

En `src/App.jsx`, agregar el import:

```jsx
import GestionCreditos from "./pages/admin/GestionCreditos.jsx";
```

Y la ruta después de la de `/admin-estructura`:

```jsx
            <Route path="/admin-creditos" element={
              <ProtectedRoute permisoRequerido="gestionar_creditos"><GestionCreditos /></ProtectedRoute>
            } />
```

- [ ] **Paso 3: Agregar el acceso desde el panel**

En `src/pages/admin/PanelAdmin.jsx`, agregar `WalletOutlined` a los iconos importados de `@ant-design/icons`, y esta entrada al array `modulos`, después de la de `usuarios`:

```jsx
      {
        key: "creditos",
        titulo: "Gestión de Créditos",
        desc: "Paquetes de créditos y ajustes de saldo.",
        icon: <WalletOutlined />,
        ruta: "/admin-creditos",
        visible: hasPermission("gestionar_creditos"),
        accent: "#ca8a04",
        accentSoft: "rgba(202, 138, 4, 0.10)",
      },
```

- [ ] **Paso 4: Verificar el panel en el navegador**

Como admin, abrir `/admin-creditos`:
1. Pestaña **Paquetes**: aparecen los paquetes cargados. Crear uno, editarlo y
   darlo de baja; la tabla se actualiza sola tras cada operación.
2. Pestaña **Ajustes de saldo**: buscar el usuario de prueba, ver su saldo,
   aplicar `+10` con motivo. Saldo y movimientos se actualizan solos.
3. Un ajuste que deje el saldo negativo sin el interruptor: aparece el aviso.
4. Con el interruptor activado, el mismo ajuste se aplica y el saldo queda en rojo.
5. Con una cuenta de staff sin `gestionar_creditos`, `/admin-creditos` queda bloqueada.

- [ ] **Paso 5: Verificar que compila**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Paso 6: Commit**

```bash
git add src/pages/admin/GestionCreditos.jsx src/App.jsx src/pages/admin/PanelAdmin.jsx
git commit -m "feat: add admin credits management panel"
```

---

## Tarea 17: Verificación de concurrencia y cierre

La razón de ser del `FOR UPDATE`: dos reservas simultáneas no pueden sobregirar
el saldo.

**Files:**
- Ninguno. Verificación del comportamiento ya implementado.

**Interfaces:**
- Consumes: `POST /api/reservas` (Tarea 7); ajuste manual (Tarea 6).
- Produces: nada.

- [ ] **Paso 1: Dejar el saldo en el costo exacto de una reserva**

Cotizar primero para saber cuánto cuesta:

```bash
TOKEN=TU_TOKEN_CLIENTE

curl -s -X POST http://localhost:3001/api/creditos/cotizar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"idRecurso":1}],"DiaReserva":"2026-12-22","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}'
```

Ajustar el saldo con el endpoint de admin hasta que sea **exactamente**
`creditosNecesarios` de esa respuesta:

```bash
TOKEN_ADMIN=TU_TOKEN_ADMIN

curl -s -X POST http://localhost:3001/api/admin/creditos/usuarios/1/ajuste \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"cantidad":DIFERENCIA,"motivo":"Preparar prueba de concurrencia","permitirNegativo":true}'
```

- [ ] **Paso 2: Lanzar dos reservas simultáneas sobre recursos distintos**

Recursos distintos para que el conflicto sea de saldo, no de disponibilidad:

```bash
TOKEN=TU_TOKEN_CLIENTE

curl -s -X POST http://localhost:3001/api/reservas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"idRecurso":1,"DiaReserva":"2026-12-22","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}' &

curl -s -X POST http://localhost:3001/api/reservas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"idRecurso":2,"DiaReserva":"2026-12-22","HorarioReserva":"10:00","HorarioFin":"12:00","TipoReserva":"turno"}' &

wait
```

Esperado: **una** respuesta es la reserva creada, la **otra** trae
`"codigo":"SALDO_INSUFICIENTE"`. Nunca las dos exitosas.

- [ ] **Paso 3: Verificar que el saldo y el libro quedaron consistentes**

```bash
psql -h localhost -U postgres -d boweworking -c "
SELECT s.saldo AS saldo_tabla,
       COALESCE(SUM(m.cantidad), 0) AS suma_movimientos
FROM creditos_saldo s
LEFT JOIN creditos_movimiento m ON m.cliente_usuario_id = s.cliente_usuario_id
WHERE s.cliente_usuario_id = 1
GROUP BY s.saldo;"
```

Esperado: `saldo_tabla` es `0` y coincide con `suma_movimientos`. Si difieren, el
caché de saldo se desincronizó del libro: revisar que todas las escrituras pasen
por `aplicarMovimiento`, que es lo único que actualiza las dos tablas juntas.

- [ ] **Paso 4: Verificar que solo se creó una reserva**

```bash
psql -h localhost -U postgres -d boweworking \
  -c "SELECT COUNT(*) FROM \"Reservas\" WHERE \"DiaReserva\" = '2026-12-22';"
```

Esperado: `1`.

- [ ] **Paso 5: Verificar que no quedaron referencias al pago de reserva**

```bash
grep -rn "crear-preferencia" src --include=*.jsx
grep -rn "handlePagarMP\|btnMercadoPago" src --include=*.jsx
```

Esperado: sin resultados en ambos casos.

- [ ] **Paso 6: Correr la batería completa**

```bash
cd backend && npm test
```

Esperado: todos los tests pasan.

```bash
npm run build
```

Esperado: build del frontend exitoso.

- [ ] **Paso 7: Commit de correcciones**

No hay cambios de código previstos. Si los pasos anteriores obligaron a corregir algo:

```bash
git add -A
git commit -m "fix: keep credits balance consistent under concurrent bookings"
```

Si no hubo cambios, la tarea queda cerrada con la verificación registrada.

---

## Cobertura de requisitos

| RF | Tareas que lo implementan |
|----|---------------------------|
| RF06 — saldo de créditos por usuario | 1 (tablas), 2 (reglas), 3 (repositorio), 5 (endpoints), 14 (historial) |
| RF07 — descuento automático transaccional | 2 (`evaluarDescuentoReserva`), 3 (`bloquearSaldo`), 7 (simple y múltiple), 17 (concurrencia) |
| RF08 — ajuste manual del administrador | 2 (`evaluarAjusteManual`), 4 (Zod), 6 (endpoint), 15 (hooks), 16 (panel) |
| RF09 — paquetes y compra | 1 (tablas), 2 (`normalizarPaquete`), 6 (CRUD), 8 (compra), 9 (webhook), 12 (pop-up), 16 (panel) |
| RF10 — consulta del saldo propio | 5 (endpoint), 11 (hook), 12 (widget), 14 (perfil) |
| Créditos como único medio de pago | 7 (descuento incondicional), 9 (baja del checkout), 13 (baja en la interfaz), 14 (baja en el perfil) |
| Cotización en vivo al seleccionar | 2 (`creditosParaMontos`), 8 (endpoint), 13 (interfaz) |
| Reintegro preparado sin implementar | 1 (`CHECK`, `id_reserva`), 2 (`TIPOS_MOVIMIENTO`), 10 (etiqueta) |
