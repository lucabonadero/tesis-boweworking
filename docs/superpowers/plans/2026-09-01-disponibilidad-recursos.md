# Disponibilidad y Bloqueos de Recursos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el admin bloquee recursos temporalmente y configure su disponibilidad semanal, e impedir que se creen reservas que violen esas reglas.

**Architecture:** Dos tablas nuevas (`DisponibilidadRecurso`, `BloqueosRecurso`) con un repositorio de acceso a datos, un servicio de validación cuya lógica pura es testeable sin base de datos, y un enganche en los cuatro puntos del controller de reservas que crean o mueven reservas. El frontend agrega un panel admin y apaga horarios no disponibles antes de que el usuario intente reservar.

**Tech Stack:** Node 20+ (ESM, `node --test`), Express 4, PostgreSQL (`pg`), Zod 4, React + Vite, Ant Design, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-01-disponibilidad-recursos-design.md`

## Global Constraints

- **ESM en todo el backend.** `backend/package.json` tiene `"type": "module"`. Usar `import`/`export`, nunca `require`.
- **Tests con `node --test`,** sin librería de mocks. Todo test debe correr sin base de datos: por eso la lógica pura vive separada de las queries.
- **Cada archivo de test nuevo debe agregarse al script `test`** en `backend/package.json` — ese script lista los archivos uno por uno, no usa glob.
- **Tabla de usuarios: `usuarios` en minúscula, PK `id`.** Verificado en `backend/src/controllers/auth.controller.js:11`. No es `"Usuarios"."idUsuario"`.
- **Las tablas de dominio usan identificadores con comillas y PascalCase** (`"Recursos"."idRecurso"`); las tablas del módulo de créditos usan snake_case sin comillas. Este módulo sigue el estilo PascalCase con comillas, porque referencia `"Recursos"`.
- **`DiaSemana`: 0 = domingo … 6 = sábado.** Mismo criterio que `Date.prototype.getUTCDay()`.
- **Horas como string `"HH:MM"`** en toda la lógica pura. La conversión a/desde `TIME` de Postgres ocurre solo en el repositorio.
- **Idioma:** identificadores y mensajes de usuario en español, siguiendo el código existente.
- **Zona horaria:** usar `COWORKING_TIMEZONE` de `coworkingHours.service.js`. Nunca `new Date()` sin zona para decisiones de calendario.

---

## Estructura de archivos

**Backend — crear:**
- `backend/database/migration_disponibilidad_recursos.sql` — las dos tablas nuevas.
- `backend/src/services/disponibilidadRecurso.rules.js` — **lógica pura**, sin `pg`. Solapamiento de rangos, contención en franjas, expansión de días para reservas semanales/mensuales, armado de mensajes de error. Todo lo testeable.
- `backend/src/services/disponibilidadRecurso.rules.test.js` — tests de lo anterior.
- `backend/src/repositories/disponibilidadRecurso.repository.js` — todas las queries. Cada función recibe `db` (pool o client de transacción), igual que `creditos.repository.js`.
- `backend/src/services/disponibilidadRecurso.service.js` — orquesta repositorio + reglas. Expone `validarDisponibilidadRecurso`.
- `backend/src/controllers/disponibilidad.controller.js` — handlers HTTP.
- `backend/src/routes/disponibilidad.routes.js` — rutas.

**Backend — modificar:**
- `backend/src/schemas/validation.schemas.js` — schemas Zod nuevos.
- `backend/src/server.js` — montar el router.
- `backend/src/controllers/reservas.controller.js` — cuatro puntos de enganche.
- `backend/package.json` — agregar el archivo de test al script.

**Frontend — crear:**
- `src/hooks/useDisponibilidad.js` — hooks de TanStack Query.
- `src/pages/admin/GestionDisponibilidad.jsx` — panel admin.
- `src/components/GrillaDisponibilidad.jsx` — grilla semanal click-drag.
- `src/styles/admin/gestionDisponibilidad.module.css`

**Frontend — modificar:**
- `src/pages/admin/PanelAdmin.jsx` — entrada al panel nuevo.

La separación `rules` / `repository` / `service` es lo que hace testeable el núcleo: `rules.js` no importa `pg`, así que sus tests corren en CI sin base de datos.

---

### Task 1: Migración SQL

**Files:**
- Create: `backend/database/migration_disponibilidad_recursos.sql`

**Interfaces:**
- Consumes: tablas existentes `"Recursos"("idRecurso")` y `usuarios(id)`.
- Produces: tablas `"DisponibilidadRecurso"` y `"BloqueosRecurso"` usadas por todas las tareas siguientes.

- [ ] **Step 1: Escribir la migración**

Crear `backend/database/migration_disponibilidad_recursos.sql`:

```sql
-- ============================================================
-- Migración: Disponibilidad y bloqueos temporales de Recursos
-- RF16 / RF17 — Bo WeWorking (septiembre 2026)
-- Ejecutar después de migration_estructura_dinamica_v2.sql
-- ============================================================

BEGIN;

-- Franjas de disponibilidad semanal por recurso.
-- Un recurso SIN filas acá usa la ventana global del coworking (09:00-21:00).
CREATE TABLE IF NOT EXISTS "DisponibilidadRecurso" (
  "idDisponibilidad" SERIAL PRIMARY KEY,
  "idRecurso"   INTEGER NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "DiaSemana"   SMALLINT NOT NULL CHECK ("DiaSemana" BETWEEN 0 AND 6),
  "HoraInicio"  TIME NOT NULL,
  "HoraFin"     TIME NOT NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT disponibilidad_rango_valido CHECK ("HoraInicio" < "HoraFin")
);

COMMENT ON COLUMN "DisponibilidadRecurso"."DiaSemana"
  IS '0=domingo, 1=lunes, ... 6=sábado (igual que Date.getUTCDay)';

CREATE INDEX IF NOT EXISTS idx_disp_recurso
  ON "DisponibilidadRecurso"("idRecurso", "DiaSemana");

-- Bloqueos temporales (RF16). TIMESTAMP, no DATE: permite bloqueos parciales.
CREATE TABLE IF NOT EXISTS "BloqueosRecurso" (
  "idBloqueo"   SERIAL PRIMARY KEY,
  "idRecurso"   INTEGER NOT NULL REFERENCES "Recursos"("idRecurso") ON DELETE CASCADE,
  "FechaInicio" TIMESTAMP NOT NULL,
  "FechaFin"    TIMESTAMP NOT NULL,
  "Motivo"      VARCHAR(300),
  "creadoPor"   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT bloqueo_rango_valido CHECK ("FechaInicio" < "FechaFin")
);

CREATE INDEX IF NOT EXISTS idx_bloq_recurso_rango
  ON "BloqueosRecurso"("idRecurso", "FechaInicio", "FechaFin");

COMMIT;
```

- [ ] **Step 2: Verificar sintaxis**

Si hay acceso a la base de datos de desarrollo:

Run: `psql "$DATABASE_URL" -f backend/database/migration_disponibilidad_recursos.sql`
Expected: `COMMIT`, sin errores.

Si no hay base disponible, revisar a ojo: cada `CREATE TABLE` tiene su `IF NOT EXISTS`, los dos `CHECK` tienen nombre de constraint, y el `BEGIN`/`COMMIT` envuelve todo. La migración es idempotente.

- [ ] **Step 3: Commit**

```bash
git add backend/database/migration_disponibilidad_recursos.sql
git commit -m "feat: add availability and resource block tables migration"
```

---

### Task 2: Lógica pura de disponibilidad (`rules`)

Esta tarea es el núcleo del feature. Todo lo demás la usa.

**Files:**
- Create: `backend/src/services/disponibilidadRecurso.rules.js`
- Test: `backend/src/services/disponibilidadRecurso.rules.test.js`
- Modify: `backend/package.json` (script `test`)

**Interfaces:**
- Consumes: `minutosDesdeMedianoche`, `COWORKING_APERTURA`, `COWORKING_CIERRE` de `./coworkingHours.service.js`.
- Produces:
  - `rangosSeSolapan(inicioA, finA, inicioB, finB) → boolean` (Date o ISO string)
  - `diaSemanaDeYmd(ymd) → number` (0-6)
  - `sumarDiasYmd(ymd, dias) → string`
  - `diasAbarcados(diaReserva, tipoReserva) → string[]` (YMD; 1 para turno, 7 semanal, 30 mensual)
  - `turnoEntraEnFranjas(horaInicio, horaFin, franjas) → boolean` — `franjas` es `[{ HoraInicio, HoraFin }]`
  - `formatearFechaHoraCorta(fecha) → string` — `"12/03 a las 18:00"`
  - `mensajeRecursoBloqueado(nombreRecurso, bloqueo) → { codigo, message, detalle }`
  - `mensajeFueraDeDisponibilidad(nombreRecurso, ymd, franjas) → { codigo, message, detalle }`
  - `mensajeDiaNoDisponible(nombreRecurso, ymd) → { codigo, message, detalle }`
  - `CODIGOS` — objeto con `RECURSO_BLOQUEADO`, `FUERA_DE_DISPONIBILIDAD`, `DIA_NO_DISPONIBLE`, `RECURSO_INACTIVO`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/services/disponibilidadRecurso.rules.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  rangosSeSolapan,
  diaSemanaDeYmd,
  sumarDiasYmd,
  diasAbarcados,
  turnoEntraEnFranjas,
  formatearFechaHoraCorta,
  mensajeRecursoBloqueado,
  mensajeFueraDeDisponibilidad,
  mensajeDiaNoDisponible,
  CODIGOS,
} from "./disponibilidadRecurso.rules.js";

test("rangosSeSolapan: solape parcial por el inicio", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T10:00:00", "2026-03-10T14:00:00", "2026-03-10T12:00:00", "2026-03-10T16:00:00"),
    true
  );
});

test("rangosSeSolapan: solape parcial por el fin", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T12:00:00", "2026-03-10T16:00:00", "2026-03-10T10:00:00", "2026-03-10T14:00:00"),
    true
  );
});

test("rangosSeSolapan: B contiene a A", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T12:00:00", "2026-03-10T13:00:00", "2026-03-10T09:00:00", "2026-03-10T18:00:00"),
    true
  );
});

test("rangosSeSolapan: adyacentes no solapan (fin == inicio)", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T09:00:00", "2026-03-10T12:00:00", "2026-03-10T12:00:00", "2026-03-10T15:00:00"),
    false
  );
});

test("rangosSeSolapan: disjuntos", () => {
  assert.equal(
    rangosSeSolapan("2026-03-10T09:00:00", "2026-03-10T10:00:00", "2026-03-11T09:00:00", "2026-03-11T10:00:00"),
    false
  );
});

test("diaSemanaDeYmd: domingo es 0", () => {
  assert.equal(diaSemanaDeYmd("2026-03-08"), 0);
});

test("diaSemanaDeYmd: lunes es 1", () => {
  assert.equal(diaSemanaDeYmd("2026-03-09"), 1);
});

test("sumarDiasYmd cruza fin de mes", () => {
  assert.equal(sumarDiasYmd("2026-03-30", 3), "2026-04-02");
});

test("diasAbarcados: turno devuelve un solo día", () => {
  assert.deepEqual(diasAbarcados("2026-03-10", "turno"), ["2026-03-10"]);
});

test("diasAbarcados: semanal devuelve 7 días", () => {
  const dias = diasAbarcados("2026-03-10", "semanal");
  assert.equal(dias.length, 7);
  assert.equal(dias[0], "2026-03-10");
  assert.equal(dias[6], "2026-03-16");
});

test("diasAbarcados: mensual devuelve 30 días", () => {
  const dias = diasAbarcados("2026-03-10", "mensual");
  assert.equal(dias.length, 30);
  assert.equal(dias[29], "2026-04-08");
});

test("turnoEntraEnFranjas: turno contenido en una franja", () => {
  const franjas = [{ HoraInicio: "10:00", HoraFin: "18:00" }];
  assert.equal(turnoEntraEnFranjas("12:00", "14:00", franjas), true);
});

test("turnoEntraEnFranjas: turno que se pasa del fin de la franja", () => {
  const franjas = [{ HoraInicio: "10:00", HoraFin: "18:00" }];
  assert.equal(turnoEntraEnFranjas("17:00", "19:00", franjas), false);
});

test("turnoEntraEnFranjas: turno que empieza antes de la franja", () => {
  const franjas = [{ HoraInicio: "10:00", HoraFin: "18:00" }];
  assert.equal(turnoEntraEnFranjas("09:00", "11:00", franjas), false);
});

test("turnoEntraEnFranjas: turno a caballo del corte de mediodía no entra", () => {
  const franjas = [
    { HoraInicio: "09:00", HoraFin: "13:00" },
    { HoraInicio: "15:00", HoraFin: "19:00" },
  ];
  assert.equal(turnoEntraEnFranjas("12:00", "16:00", franjas), false);
});

test("turnoEntraEnFranjas: turno dentro de la segunda franja", () => {
  const franjas = [
    { HoraInicio: "09:00", HoraFin: "13:00" },
    { HoraInicio: "15:00", HoraFin: "19:00" },
  ];
  assert.equal(turnoEntraEnFranjas("16:00", "18:00", franjas), true);
});

test("turnoEntraEnFranjas: sin franjas usa la ventana global 09:00-21:00", () => {
  assert.equal(turnoEntraEnFranjas("10:00", "12:00", []), true);
  assert.equal(turnoEntraEnFranjas("08:00", "10:00", []), false);
  assert.equal(turnoEntraEnFranjas("20:00", "22:00", []), false);
});

test("turnoEntraEnFranjas: acepta TIME de Postgres con segundos", () => {
  const franjas = [{ HoraInicio: "10:00:00", HoraFin: "18:00:00" }];
  assert.equal(turnoEntraEnFranjas("12:00", "14:00", franjas), true);
});

test("formatearFechaHoraCorta arma DD/MM a las HH:MM", () => {
  assert.equal(formatearFechaHoraCorta("2026-03-12T18:00:00"), "12/03 a las 18:00");
});

test("mensajeRecursoBloqueado incluye nombre, fecha y motivo", () => {
  const err = mensajeRecursoBloqueado("Sala Norte", {
    idBloqueo: 7,
    FechaFin: "2026-03-12T18:00:00",
    Motivo: "Mantenimiento",
  });
  assert.equal(err.codigo, CODIGOS.RECURSO_BLOQUEADO);
  assert.match(err.message, /Sala Norte/);
  assert.match(err.message, /12\/03 a las 18:00/);
  assert.match(err.message, /Mantenimiento/);
  assert.equal(err.detalle.idBloqueo, 7);
});

test("mensajeRecursoBloqueado sin motivo no rompe", () => {
  const err = mensajeRecursoBloqueado("Sala Norte", {
    idBloqueo: 8,
    FechaFin: "2026-03-12T18:00:00",
    Motivo: null,
  });
  assert.match(err.message, /Sala Norte/);
  assert.doesNotMatch(err.message, /null/);
});

test("mensajeFueraDeDisponibilidad nombra el día y las franjas", () => {
  const err = mensajeFueraDeDisponibilidad("Sala Norte", "2026-03-10", [
    { HoraInicio: "10:00", HoraFin: "18:00" },
  ]);
  assert.equal(err.codigo, CODIGOS.FUERA_DE_DISPONIBILIDAD);
  assert.match(err.message, /martes/i);
  assert.match(err.message, /10:00 a 18:00/);
});

test("mensajeDiaNoDisponible nombra el día en plural", () => {
  const err = mensajeDiaNoDisponible("Sala Norte", "2026-03-08");
  assert.equal(err.codigo, CODIGOS.DIA_NO_DISPONIBLE);
  assert.match(err.message, /domingos/i);
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && node --test src/services/disponibilidadRecurso.rules.test.js`
Expected: FAIL — `Cannot find module './disponibilidadRecurso.rules.js'`

- [ ] **Step 3: Escribir la implementación**

Crear `backend/src/services/disponibilidadRecurso.rules.js`:

```js
/**
 * Reglas puras de disponibilidad de recursos (RF16/RF17).
 *
 * Sin acceso a base de datos: todo lo que decide "se puede o no reservar"
 * vive acá para poder testearlo sin infraestructura. Las queries están en
 * disponibilidadRecurso.repository.js.
 */
import {
  minutosDesdeMedianoche,
  COWORKING_APERTURA,
  COWORKING_CIERRE,
} from "./coworkingHours.service.js";

export const CODIGOS = {
  RECURSO_BLOQUEADO: "RECURSO_BLOQUEADO",
  FUERA_DE_DISPONIBILIDAD: "FUERA_DE_DISPONIBILIDAD",
  DIA_NO_DISPONIBLE: "DIA_NO_DISPONIBLE",
  RECURSO_INACTIVO: "RECURSO_INACTIVO",
};

const DIAS_SINGULAR = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

const DIAS_POR_TIPO = { turno: 1, semanal: 7, mensual: 30 };

function aMillis(valor) {
  return valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
}

/** Dos rangos [inicio, fin) se solapan. Adyacentes (finA === inicioB) no solapan. */
export function rangosSeSolapan(inicioA, finA, inicioB, finB) {
  return aMillis(inicioA) < aMillis(finB) && aMillis(finA) > aMillis(inicioB);
}

/** 0=domingo … 6=sábado. Se parsea como UTC para que no lo corra la zona local. */
export function diaSemanaDeYmd(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDiasYmd(ymd, dias) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Días de calendario que ocupa una reserva: 1 turno, 7 semanal, 30 mensual. */
export function diasAbarcados(diaReserva, tipoReserva) {
  const total = DIAS_POR_TIPO[tipoReserva] ?? 1;
  return Array.from({ length: total }, (_, i) => sumarDiasYmd(diaReserva, i));
}

/** El turno debe entrar completo en UNA franja. Sin franjas, vale la ventana global. */
export function turnoEntraEnFranjas(horaInicio, horaFin, franjas) {
  const hi = minutosDesdeMedianoche(String(horaInicio).slice(0, 5));
  const hf = minutosDesdeMedianoche(String(horaFin).slice(0, 5));
  if (Number.isNaN(hi) || Number.isNaN(hf) || hi >= hf) return false;

  const efectivas =
    Array.isArray(franjas) && franjas.length > 0
      ? franjas
      : [{ HoraInicio: COWORKING_APERTURA, HoraFin: COWORKING_CIERRE }];

  return efectivas.some((f) => {
    const fi = minutosDesdeMedianoche(String(f.HoraInicio).slice(0, 5));
    const ff = minutosDesdeMedianoche(String(f.HoraFin).slice(0, 5));
    return !Number.isNaN(fi) && !Number.isNaN(ff) && hi >= fi && hf <= ff;
  });
}

/** "12/03 a las 18:00" */
export function formatearFechaHoraCorta(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} a las ${hh}:${mi}`;
}

function listarFranjas(franjas) {
  return franjas
    .map((f) => `${String(f.HoraInicio).slice(0, 5)} a ${String(f.HoraFin).slice(0, 5)}`)
    .join(", ");
}

export function mensajeRecursoBloqueado(nombreRecurso, bloqueo) {
  const hasta = formatearFechaHoraCorta(bloqueo.FechaFin);
  const motivo = bloqueo.Motivo ? ` Motivo: ${bloqueo.Motivo}.` : "";
  return {
    codigo: CODIGOS.RECURSO_BLOQUEADO,
    message: `${nombreRecurso} está bloqueado hasta el ${hasta}.${motivo}`,
    detalle: {
      idBloqueo: bloqueo.idBloqueo,
      fechaInicio: bloqueo.FechaInicio,
      fechaFin: bloqueo.FechaFin,
      motivo: bloqueo.Motivo ?? null,
    },
  };
}

export function mensajeFueraDeDisponibilidad(nombreRecurso, ymd, franjas) {
  const dia = DIAS_PLURAL[diaSemanaDeYmd(ymd)];
  return {
    codigo: CODIGOS.FUERA_DE_DISPONIBILIDAD,
    message: `${nombreRecurso} no está disponible en ese horario. Los ${dia} se puede reservar de ${listarFranjas(franjas)}.`,
    detalle: { fecha: ymd, franjas },
  };
}

export function mensajeDiaNoDisponible(nombreRecurso, ymd) {
  const dia = DIAS_PLURAL[diaSemanaDeYmd(ymd)];
  return {
    codigo: CODIGOS.DIA_NO_DISPONIBLE,
    message: `${nombreRecurso} no está disponible los ${dia}.`,
    detalle: { fecha: ymd, diaSemana: diaSemanaDeYmd(ymd), nombreDia: DIAS_SINGULAR[diaSemanaDeYmd(ymd)] },
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd backend && node --test src/services/disponibilidadRecurso.rules.test.js`
Expected: PASS — 22 tests, 0 fallos.

- [ ] **Step 5: Registrar el test en el script de package.json**

En `backend/package.json`, agregar el archivo al final de la lista del script `test` (la lista es explícita, sin glob):

```json
"test": "node --test src/services/reservaConcurrency.service.test.js src/services/reservaMutability.service.test.js src/services/extensionReserva.service.test.js src/services/rolUsuario.service.test.js src/services/rolClienteUsuario.service.test.js src/services/creditos.service.test.js src/services/disponibilidadRecurso.rules.test.js"
```

- [ ] **Step 6: Correr la suite completa**

Run: `cd backend && npm test`
Expected: PASS — todos los tests preexistentes siguen verdes más los nuevos.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/disponibilidadRecurso.rules.js backend/src/services/disponibilidadRecurso.rules.test.js backend/package.json
git commit -m "feat: add pure availability rules with tests"
```

---

### Task 3: Repositorio de disponibilidad

**Files:**
- Create: `backend/src/repositories/disponibilidadRecurso.repository.js`

**Interfaces:**
- Consumes: las tablas de la Task 1.
- Produces (todas reciben `db` como primer parámetro — pool o client de transacción):
  - `obtenerCadenaRecursos(db, idRecurso) → Promise<Array<{ idRecurso, Nombre, Activo }>>` — el recurso y sus ancestros.
  - `obtenerBloqueosSolapados(db, idsRecurso, inicio, fin) → Promise<Array<Bloqueo>>`
  - `obtenerFranjas(db, idRecurso) → Promise<Array<{ idDisponibilidad, DiaSemana, HoraInicio, HoraFin }>>`
  - `reemplazarFranjas(db, idRecurso, franjas) → Promise<void>`
  - `listarBloqueos(db, { idRecurso, desde, hasta }) → Promise<Array<Bloqueo>>`
  - `crearBloqueo(db, { idRecurso, fechaInicio, fechaFin, motivo, creadoPor }) → Promise<Bloqueo>`
  - `actualizarBloqueo(db, idBloqueo, { fechaInicio, fechaFin, motivo }) → Promise<Bloqueo | null>`
  - `eliminarBloqueo(db, idBloqueo) → Promise<boolean>`
  - `obtenerReservasEnRango(db, idsRecurso, inicio, fin) → Promise<Array<Reserva>>`

- [ ] **Step 1: Escribir el repositorio**

Crear `backend/src/repositories/disponibilidadRecurso.repository.js`:

```js
/**
 * Acceso a datos de disponibilidad y bloqueos de recursos.
 *
 * Cada función recibe `db`: el pool para lecturas, o un client de transacción
 * para que la validación corra dentro de la misma transacción que la reserva.
 */

const COLUMNAS_BLOQUEO = `
  b."idBloqueo", b."idRecurso", b."FechaInicio", b."FechaFin",
  b."Motivo", b."creadoPor", b."createdAt"
`;

/** El recurso y todos sus ancestros: un bloqueo sobre el padre alcanza al hijo. */
export async function obtenerCadenaRecursos(db, idRecurso) {
  const { rows } = await db.query(
    `WITH RECURSIVE cadena AS (
       SELECT r."idRecurso", r."Nombre", r."Activo", r."idRecursoPadre"
       FROM "Recursos" r WHERE r."idRecurso" = $1
       UNION ALL
       SELECT p."idRecurso", p."Nombre", p."Activo", p."idRecursoPadre"
       FROM "Recursos" p JOIN cadena c ON p."idRecurso" = c."idRecursoPadre"
     )
     SELECT "idRecurso", "Nombre", "Activo" FROM cadena`,
    [idRecurso]
  );
  return rows;
}

export async function obtenerBloqueosSolapados(db, idsRecurso, inicio, fin) {
  if (!idsRecurso.length) return [];
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_BLOQUEO}
     FROM "BloqueosRecurso" b
     WHERE b."idRecurso" = ANY($1::int[])
       AND b."FechaInicio" < $3::timestamp
       AND b."FechaFin"    > $2::timestamp
     ORDER BY b."FechaInicio"`,
    [idsRecurso, inicio, fin]
  );
  return rows;
}

export async function obtenerFranjas(db, idRecurso) {
  const { rows } = await db.query(
    `SELECT "idDisponibilidad", "DiaSemana", "HoraInicio", "HoraFin"
     FROM "DisponibilidadRecurso"
     WHERE "idRecurso" = $1
     ORDER BY "DiaSemana", "HoraInicio"`,
    [idRecurso]
  );
  return rows;
}

/** Reemplaza el set completo de franjas. El caller abre la transacción. */
export async function reemplazarFranjas(db, idRecurso, franjas) {
  await db.query(`DELETE FROM "DisponibilidadRecurso" WHERE "idRecurso" = $1`, [idRecurso]);
  for (const f of franjas) {
    await db.query(
      `INSERT INTO "DisponibilidadRecurso" ("idRecurso","DiaSemana","HoraInicio","HoraFin")
       VALUES ($1,$2,$3,$4)`,
      [idRecurso, f.diaSemana, f.horaInicio, f.horaFin]
    );
  }
}

export async function listarBloqueos(db, { idRecurso, desde, hasta }) {
  const condiciones = [];
  const params = [];
  if (idRecurso) {
    params.push(idRecurso);
    condiciones.push(`b."idRecurso" = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    condiciones.push(`b."FechaFin" >= $${params.length}::timestamp`);
  }
  if (hasta) {
    params.push(hasta);
    condiciones.push(`b."FechaInicio" <= $${params.length}::timestamp`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_BLOQUEO}, r."Nombre" AS "nombreRecurso"
     FROM "BloqueosRecurso" b
     JOIN "Recursos" r ON r."idRecurso" = b."idRecurso"
     ${where}
     ORDER BY b."FechaInicio" DESC`,
    params
  );
  return rows;
}

export async function crearBloqueo(db, { idRecurso, fechaInicio, fechaFin, motivo, creadoPor }) {
  const { rows } = await db.query(
    `INSERT INTO "BloqueosRecurso" ("idRecurso","FechaInicio","FechaFin","Motivo","creadoPor")
     VALUES ($1,$2::timestamp,$3::timestamp,$4,$5)
     RETURNING "idBloqueo","idRecurso","FechaInicio","FechaFin","Motivo","creadoPor","createdAt"`,
    [idRecurso, fechaInicio, fechaFin, motivo ?? null, creadoPor ?? null]
  );
  return rows[0];
}

export async function actualizarBloqueo(db, idBloqueo, { fechaInicio, fechaFin, motivo }) {
  const { rows } = await db.query(
    `UPDATE "BloqueosRecurso"
     SET "FechaInicio" = $2::timestamp, "FechaFin" = $3::timestamp, "Motivo" = $4
     WHERE "idBloqueo" = $1
     RETURNING "idBloqueo","idRecurso","FechaInicio","FechaFin","Motivo","creadoPor","createdAt"`,
    [idBloqueo, fechaInicio, fechaFin, motivo ?? null]
  );
  return rows[0] ?? null;
}

export async function eliminarBloqueo(db, idBloqueo) {
  const { rowCount } = await db.query(`DELETE FROM "BloqueosRecurso" WHERE "idBloqueo" = $1`, [idBloqueo]);
  return rowCount > 0;
}

/** Reservas activas dentro del rango: se avisan al admin, no se cancelan. */
export async function obtenerReservasEnRango(db, idsRecurso, inicio, fin) {
  if (!idsRecurso.length) return [];
  const { rows } = await db.query(
    `SELECT res."idReserva", res."idRecurso", res."Nombre", res."DiaReserva",
            res."HorarioReserva", res."HorarioFin", res."Estado"
     FROM "Reservas" res
     WHERE res."idRecurso" = ANY($1::int[])
       AND res."Estado" IN ('activa','en_curso')
       AND res."DiaReserva" BETWEEN $2::date AND $3::date
     ORDER BY res."DiaReserva", res."HorarioReserva"`,
    [idsRecurso, inicio, fin]
  );
  return rows;
}
```

- [ ] **Step 2: Verificar que el módulo carga**

Run: `cd backend && node --input-type=module -e "import('./src/repositories/disponibilidadRecurso.repository.js').then(m => console.log(Object.keys(m).join(',')))"`
Expected: imprime `obtenerCadenaRecursos,obtenerBloqueosSolapados,obtenerFranjas,reemplazarFranjas,listarBloqueos,crearBloqueo,actualizarBloqueo,eliminarBloqueo,obtenerReservasEnRango`

- [ ] **Step 3: Verificar el nombre de la PK de Reservas**

La query `obtenerReservasEnRango` asume que la PK se llama `"idReserva"`. Confirmarlo:

Run: `grep -n 'idReserva\|"Reservas" res' backend/src/controllers/reservas.controller.js | head -5`
Expected: aparece `"idReserva"`. Si el nombre real es otro, corregirlo en la query antes de commitear.

- [ ] **Step 4: Commit**

```bash
git add backend/src/repositories/disponibilidadRecurso.repository.js
git commit -m "feat: add availability and blocks repository"
```

---

### Task 4: Servicio de validación

**Files:**
- Create: `backend/src/services/disponibilidadRecurso.service.js`

**Interfaces:**
- Consumes: todo lo de Task 2 y Task 3.
- Produces:
  - `validarDisponibilidadRecurso(db, { idRecurso, diaReserva, horaInicio, horaFin, tipoReserva }) → Promise<null | { codigo, message, detalle }>`
  - `calcularSlotsDelDia(db, idRecurso, ymd) → Promise<Array<{ hora, disponible, motivo }>>`

- [ ] **Step 1: Escribir el servicio**

Crear `backend/src/services/disponibilidadRecurso.service.js`:

```js
/**
 * Validación de disponibilidad de recursos (RF17) y bloqueos (RF16).
 *
 * `validarDisponibilidadRecurso` se llama SIEMPRE antes de crear o mover una
 * reserva, dentro de la transacción, para que un bloqueo creado en paralelo no
 * se cuele entre la validación y el INSERT.
 */
import {
  obtenerCadenaRecursos,
  obtenerBloqueosSolapados,
  obtenerFranjas,
} from "../repositories/disponibilidadRecurso.repository.js";
import {
  CODIGOS,
  diaSemanaDeYmd,
  diasAbarcados,
  sumarDiasYmd,
  turnoEntraEnFranjas,
  mensajeRecursoBloqueado,
  mensajeFueraDeDisponibilidad,
  mensajeDiaNoDisponible,
} from "./disponibilidadRecurso.rules.js";
import { COWORKING_APERTURA, COWORKING_CIERRE } from "./coworkingHours.service.js";

function tsDe(ymd, hhmm) {
  return `${String(ymd).slice(0, 10)}T${String(hhmm).slice(0, 5)}:00`;
}

export async function validarDisponibilidadRecurso(
  db,
  { idRecurso, diaReserva, horaInicio, horaFin, tipoReserva = "turno" }
) {
  const cadena = await obtenerCadenaRecursos(db, idRecurso);
  if (cadena.length === 0) {
    return { codigo: CODIGOS.RECURSO_INACTIVO, message: "El recurso no existe.", detalle: { idRecurso } };
  }

  const inactivo = cadena.find((r) => r.Activo === false);
  if (inactivo) {
    return {
      codigo: CODIGOS.RECURSO_INACTIVO,
      message: `${inactivo.Nombre} no está disponible para reservar.`,
      detalle: { idRecurso: inactivo.idRecurso },
    };
  }

  const propio = cadena.find((r) => r.idRecurso === Number(idRecurso)) ?? cadena[0];
  const dias = diasAbarcados(diaReserva, tipoReserva);
  const esTurno = tipoReserva === "turno";
  const hi = esTurno ? horaInicio : COWORKING_APERTURA;
  const hf = esTurno ? horaFin : COWORKING_CIERRE;

  // 1. Bloqueos: contra el recurso y todos sus ancestros.
  const ids = cadena.map((r) => r.idRecurso);
  const inicioRango = tsDe(dias[0], hi);
  const finRango = tsDe(dias[dias.length - 1], hf);
  const bloqueos = await obtenerBloqueosSolapados(db, ids, inicioRango, finRango);
  if (bloqueos.length > 0) {
    const bloqueo = bloqueos[0];
    const nombre = cadena.find((r) => r.idRecurso === bloqueo.idRecurso)?.Nombre ?? propio.Nombre;
    return mensajeRecursoBloqueado(nombre, bloqueo);
  }

  // 2. Disponibilidad configurada. Sin franjas, vale la ventana global.
  const franjas = await obtenerFranjas(db, idRecurso);
  if (franjas.length === 0) return null;

  for (const ymd of dias) {
    const delDia = franjas.filter((f) => f.DiaSemana === diaSemanaDeYmd(ymd));
    if (delDia.length === 0) return mensajeDiaNoDisponible(propio.Nombre, ymd);
    if (!turnoEntraEnFranjas(hi, hf, delDia)) {
      return mensajeFueraDeDisponibilidad(propio.Nombre, ymd, delDia);
    }
  }

  return null;
}

/** Turnos de una hora del día pedido, con el motivo por el que cada uno no se puede usar. */
export async function calcularSlotsDelDia(db, idRecurso, ymd) {
  const cadena = await obtenerCadenaRecursos(db, idRecurso);
  if (cadena.length === 0) return [];

  const ids = cadena.map((r) => r.idRecurso);
  const bloqueos = await obtenerBloqueosSolapados(db, ids, tsDe(ymd, "00:00"), tsDe(sumarDiasYmd(ymd, 1), "00:00"));
  const franjas = (await obtenerFranjas(db, idRecurso)).filter((f) => f.DiaSemana === diaSemanaDeYmd(ymd));

  const desde = Number(COWORKING_APERTURA.slice(0, 2));
  const hasta = Number(COWORKING_CIERRE.slice(0, 2));
  const slots = [];

  for (let h = desde; h < hasta; h++) {
    const hora = `${String(h).padStart(2, "0")}:00`;
    const horaFin = `${String(h + 1).padStart(2, "0")}:00`;
    const inicioSlot = new Date(tsDe(ymd, hora)).getTime();
    const finSlot = new Date(tsDe(ymd, horaFin)).getTime();

    const bloqueo = bloqueos.find(
      (b) => new Date(b.FechaInicio).getTime() < finSlot && new Date(b.FechaFin).getTime() > inicioSlot
    );
    if (bloqueo) {
      slots.push({ hora, disponible: false, motivo: bloqueo.Motivo ? `Bloqueado: ${bloqueo.Motivo}` : "Bloqueado" });
      continue;
    }
    if (!turnoEntraEnFranjas(hora, horaFin, franjas)) {
      slots.push({ hora, disponible: false, motivo: "Fuera del horario disponible" });
      continue;
    }
    slots.push({ hora, disponible: true, motivo: null });
  }

  return slots;
}
```

Nota sobre `calcularSlotsDelDia`: cuando el recurso no tiene franjas para ese día, `turnoEntraEnFranjas` recibe un array vacío y cae a la ventana global — que es exactamente el comportamiento deseado (recurso sin configurar = abierto en horario del coworking).

- [ ] **Step 2: Verificar que el módulo carga**

Run: `cd backend && node --input-type=module -e "import('./src/services/disponibilidadRecurso.service.js').then(m => console.log(Object.keys(m).join(',')))"`
Expected: `validarDisponibilidadRecurso,calcularSlotsDelDia`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/disponibilidadRecurso.service.js
git commit -m "feat: add resource availability validation service"
```

---

### Task 5: Enganchar la validación en las reservas (RF17)

Esta es la tarea que hace cumplir RF17. Si se saltea alguno de los cuatro puntos, queda un agujero.

**Files:**
- Modify: `backend/src/controllers/reservas.controller.js`

**Interfaces:**
- Consumes: `validarDisponibilidadRecurso` de Task 4.

- [ ] **Step 1: Agregar el import**

En `backend/src/controllers/reservas.controller.js`, junto a los demás imports de servicios:

```js
import { validarDisponibilidadRecurso } from "../services/disponibilidadRecurso.service.js";
```

- [ ] **Step 2: Enganchar en `crearReserva`**

Buscar en `crearReserva` la línea `await bloquearEspaciosDeRecursos(client, [idRecurso]);` (cerca de la 900). Insertar inmediatamente **después** de esa línea y **antes** de `const conflicto = await verificarConflictos(...)`:

```js
      const errDisp = await validarDisponibilidadRecurso(client, {
        idRecurso,
        diaReserva: DiaReserva,
        horaInicio: hi,
        horaFin: hf,
        tipoReserva: tipo,
      });
      if (errDisp) {
        await client.query("ROLLBACK");
        return res.status(400).json(errDisp);
      }
```

Va después del lock de fila para que el chequeo corra bajo el mismo lock que la verificación de conflictos.

- [ ] **Step 3: Enganchar en `crearReservasMultiples`**

Buscar `await bloquearEspaciosDeRecursos(client, ids);` (cerca de la 1019). Insertar inmediatamente después:

```js
    for (const idRec of ids) {
      const errDisp = await validarDisponibilidadRecurso(client, {
        idRecurso: idRec,
        diaReserva: DiaReserva,
        horaInicio: nh.horaIni,
        horaFin: nh.horaFin,
        tipoReserva: "turno",
      });
      if (errDisp) {
        await client.query("ROLLBACK");
        return res.status(400).json(errDisp);
      }
    }
```

Si cualquier recurso del lote falla, la operación entera se cancela: una reserva múltiple es todo o nada.

- [ ] **Step 4: Enganchar en `crearSerieMensual`**

Localizar dónde la función abre su transacción y bloquea recursos:

Run: `grep -n "bloquearEspaciosDeRecursos\|BEGIN" backend/src/controllers/reservas.controller.js | sed -n '1,12p'`

Dentro de `crearSerieMensual` (empieza en la línea 454), después del `bloquearEspaciosDeRecursos` correspondiente, insertar una validación por cada fecha de la serie. `fechas` es el array de días ya calculado en esa función:

```js
    for (const fechaSerie of fechas) {
      const errDisp = await validarDisponibilidadRecurso(client, {
        idRecurso,
        diaReserva: fechaSerie,
        horaInicio: nh.horaIni,
        horaFin: nh.horaFin,
        tipoReserva: "turno",
      });
      if (errDisp) {
        await client.query("ROLLBACK");
        return res.status(400).json(errDisp);
      }
    }
```

Cada fecha se valida como turno individual, no como bloque de 30 días: la serie son turnos sueltos en fechas concretas. Verificar el nombre real de la variable del client de transacción en esa función y usarlo.

- [ ] **Step 5: Enganchar en `actualizarReserva`**

En `actualizarReserva` (cerca de la 1175), donde ya se llama a `validarVentanaOperativaTurno` y `validarInicioTurnoNoEnElPasado`, agregar después del lock de recursos:

```js
      const errDisp = await validarDisponibilidadRecurso(client, {
        idRecurso,
        diaReserva: DiaReserva,
        horaInicio: horaIniStore,
        horaFin: horaFinStore,
        tipoReserva: tipo,
      });
      if (errDisp) {
        await client.query("ROLLBACK");
        return res.status(400).json(errDisp);
      }
```

Ajustar los nombres de variables a los que existan en el scope de esa función (pueden diferir de `crearReserva`).

- [ ] **Step 6: Verificar que los cuatro puntos quedaron enganchados**

Run: `grep -c "validarDisponibilidadRecurso" backend/src/controllers/reservas.controller.js`
Expected: `5` (1 import + 4 llamadas).

- [ ] **Step 7: Verificar que el servidor arranca**

Run: `cd backend && node --check src/controllers/reservas.controller.js`
Expected: sin salida (sintaxis válida).

- [ ] **Step 8: Correr la suite**

Run: `cd backend && npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/reservas.controller.js
git commit -m "feat: enforce resource availability on all reservation paths"
```

---

### Task 6: Schemas Zod

**Files:**
- Modify: `backend/src/schemas/validation.schemas.js`

**Interfaces:**
- Produces: `crearBloqueoSchema`, `actualizarBloqueoSchema`, `guardarDisponibilidadSchema`, `slotsQuerySchema`, `bloqueosQuerySchema`.

- [ ] **Step 1: Agregar los schemas**

Al final de `backend/src/schemas/validation.schemas.js`:

```js
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_YMD = /^\d{4}-\d{2}-\d{2}$/;

export const crearBloqueoSchema = z
  .object({
    idRecurso: z.coerce.number().int().positive(),
    fechaInicio: z.string().min(10),
    fechaFin: z.string().min(10),
    motivo: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => new Date(v.fechaInicio) < new Date(v.fechaFin), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["fechaFin"],
  });

export const actualizarBloqueoSchema = z
  .object({
    fechaInicio: z.string().min(10),
    fechaFin: z.string().min(10),
    motivo: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => new Date(v.fechaInicio) < new Date(v.fechaFin), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["fechaFin"],
  });

export const guardarDisponibilidadSchema = z.object({
  franjas: z
    .array(
      z
        .object({
          diaSemana: z.coerce.number().int().min(0).max(6),
          horaInicio: z.string().regex(HORA_HHMM, "Formato de hora inválido (HH:MM)."),
          horaFin: z.string().regex(HORA_HHMM, "Formato de hora inválido (HH:MM)."),
        })
        .refine((f) => f.horaInicio < f.horaFin, {
          message: "La hora de fin debe ser posterior a la de inicio.",
          path: ["horaFin"],
        })
    )
    .max(70),
});

export const slotsQuerySchema = z.object({
  idRecurso: z.coerce.number().int().positive(),
  fecha: z.string().regex(FECHA_YMD, "La fecha debe tener formato YYYY-MM-DD."),
});

export const bloqueosQuerySchema = z.object({
  idRecurso: z.coerce.number().int().positive().optional(),
  desde: z.string().regex(FECHA_YMD).optional(),
  hasta: z.string().regex(FECHA_YMD).optional(),
});
```

La comparación `horaInicio < horaFin` funciona como comparación de strings porque el formato `HH:MM` de ancho fijo ordena lexicográficamente igual que cronológicamente. El tope de 70 franjas es 10 por día de semana: suficiente margen, y frena un payload abusivo.

- [ ] **Step 2: Verificar que el módulo carga**

Run: `cd backend && node --input-type=module -e "import('./src/schemas/validation.schemas.js').then(m => console.log(m.crearBloqueoSchema ? 'ok' : 'falta'))"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/schemas/validation.schemas.js
git commit -m "feat: add availability and block validation schemas"
```

---

### Task 7: Controller y rutas (RF16)

**Files:**
- Create: `backend/src/controllers/disponibilidad.controller.js`
- Create: `backend/src/routes/disponibilidad.routes.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: Task 3 (repositorio), Task 4 (servicio), Task 6 (schemas).
- Produces: los endpoints bajo `/api/disponibilidad`.

- [ ] **Step 1: Escribir el controller**

Crear `backend/src/controllers/disponibilidad.controller.js`:

```js
import pool from "../config/db.js";
import {
  obtenerFranjas,
  reemplazarFranjas,
  listarBloqueos,
  crearBloqueo,
  actualizarBloqueo,
  eliminarBloqueo,
  obtenerCadenaRecursos,
  obtenerReservasEnRango,
} from "../repositories/disponibilidadRecurso.repository.js";
import { calcularSlotsDelDia } from "../services/disponibilidadRecurso.service.js";

export const obtenerBloqueos = async (req, res) => {
  try {
    const { idRecurso, desde, hasta } = req.query;
    const filas = await listarBloqueos(pool, {
      idRecurso: idRecurso ? Number(idRecurso) : null,
      desde: desde || null,
      hasta: hasta || null,
    });
    res.json(filas);
  } catch (error) {
    console.error("obtenerBloqueos:", error);
    res.status(500).json({ message: "No se pudieron obtener los bloqueos." });
  }
};

export const postBloqueo = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { idRecurso, fechaInicio, fechaFin, motivo } = req.body;

    const cadena = await obtenerCadenaRecursos(client, idRecurso);
    if (cadena.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "El recurso no existe." });
    }

    const bloqueo = await crearBloqueo(client, {
      idRecurso,
      fechaInicio,
      fechaFin,
      motivo,
      creadoPor: req.usuario?.id ?? null,
    });

    // Se informan, no se cancelan: cancelar dispara devolución de créditos.
    const afectadas = await obtenerReservasEnRango(
      client,
      [idRecurso],
      String(fechaInicio).slice(0, 10),
      String(fechaFin).slice(0, 10)
    );

    await client.query("COMMIT");
    res.status(201).json({ bloqueo, reservasAfectadas: afectadas });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("postBloqueo:", error);
    res.status(500).json({ message: "No se pudo crear el bloqueo." });
  } finally {
    client.release();
  }
};

export const putBloqueo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actualizado = await actualizarBloqueo(pool, id, req.body);
    if (!actualizado) return res.status(404).json({ message: "El bloqueo no existe." });
    res.json(actualizado);
  } catch (error) {
    console.error("putBloqueo:", error);
    res.status(500).json({ message: "No se pudo actualizar el bloqueo." });
  }
};

export const deleteBloqueo = async (req, res) => {
  try {
    const ok = await eliminarBloqueo(pool, Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "El bloqueo no existe." });
    res.json({ message: "Bloqueo eliminado." });
  } catch (error) {
    console.error("deleteBloqueo:", error);
    res.status(500).json({ message: "No se pudo eliminar el bloqueo." });
  }
};

export const getDisponibilidadRecurso = async (req, res) => {
  try {
    const franjas = await obtenerFranjas(pool, Number(req.params.idRecurso));
    res.json(franjas);
  } catch (error) {
    console.error("getDisponibilidadRecurso:", error);
    res.status(500).json({ message: "No se pudo obtener la disponibilidad." });
  }
};

export const putDisponibilidadRecurso = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const idRecurso = Number(req.params.idRecurso);
    await reemplazarFranjas(client, idRecurso, req.body.franjas);
    const franjas = await obtenerFranjas(client, idRecurso);
    await client.query("COMMIT");
    res.json(franjas);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("putDisponibilidadRecurso:", error);
    res.status(500).json({ message: "No se pudo guardar la disponibilidad." });
  } finally {
    client.release();
  }
};

export const getSlots = async (req, res) => {
  try {
    const slots = await calcularSlotsDelDia(pool, Number(req.query.idRecurso), req.query.fecha);
    res.json(slots);
  } catch (error) {
    console.error("getSlots:", error);
    res.status(500).json({ message: "No se pudo obtener la disponibilidad del día." });
  }
};
```

- [ ] **Step 2: Verificar cómo se llama el id del usuario en el token**

`postBloqueo` usa `req.usuario?.id` para `creadoPor`. Confirmar el nombre real del campo:

Run: `grep -n "req.usuario" backend/src/middleware/auth.middleware.js | head -5`

Si el middleware pone otro nombre (por ejemplo `idUsuario`), corregirlo en el controller antes de seguir.

- [ ] **Step 3: Escribir las rutas**

Crear `backend/src/routes/disponibilidad.routes.js`:

```js
import { Router } from "express";
import {
  obtenerBloqueos,
  postBloqueo,
  putBloqueo,
  deleteBloqueo,
  getDisponibilidadRecurso,
  putDisponibilidadRecurso,
  getSlots,
} from "../controllers/disponibilidad.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";
import { validateBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  crearBloqueoSchema,
  actualizarBloqueoSchema,
  guardarDisponibilidadSchema,
  slotsQuerySchema,
  bloqueosQuerySchema,
} from "../schemas/validation.schemas.js";

const router = Router();

router.get("/bloqueos", validateQuery(bloqueosQuerySchema), obtenerBloqueos);
router.post("/bloqueos", verificarToken, verificarStaff, validateBody(crearBloqueoSchema), postBloqueo);
router.put("/bloqueos/:id", verificarToken, verificarStaff, validateBody(actualizarBloqueoSchema), putBloqueo);
router.delete("/bloqueos/:id", verificarToken, verificarStaff, deleteBloqueo);

router.get("/slots", validateQuery(slotsQuerySchema), getSlots);
router.get("/recurso/:idRecurso", getDisponibilidadRecurso);
router.put(
  "/recurso/:idRecurso",
  verificarToken,
  verificarStaff,
  validateBody(guardarDisponibilidadSchema),
  putDisponibilidadRecurso
);

export default router;
```

`/slots` va antes de `/recurso/:idRecurso` para que Express no lo capture como parámetro.

- [ ] **Step 4: Montar el router en el servidor**

En `backend/src/server.js`, junto al resto de imports de rutas (después de la línea 26):

```js
import disponibilidadRoutes from "./routes/disponibilidad.routes.js";
```

Y junto a los `app.use`, después de `app.use("/api/recursos", recursosRoutes);`:

```js
app.use("/api/disponibilidad", disponibilidadRoutes);
```

- [ ] **Step 5: Verificar que el servidor arranca**

Run: `cd backend && node --check src/server.js && node --check src/routes/disponibilidad.routes.js && node --check src/controllers/disponibilidad.controller.js`
Expected: sin salida.

Con base de datos disponible, levantar el servidor y probar:

Run: `cd backend && npm run dev`
Luego, en otra terminal: `curl "http://localhost:3001/api/disponibilidad/bloqueos"`
Expected: `[]` (o la lista de bloqueos), status 200.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/disponibilidad.controller.js backend/src/routes/disponibilidad.routes.js backend/src/server.js
git commit -m "feat: add availability and blocks admin endpoints"
```

---

### Task 8: Hooks de TanStack Query

**Files:**
- Create: `src/hooks/useDisponibilidad.js`

**Interfaces:**
- Produces: `disponibilidadKeys`, `useBloqueos`, `useCrearBloqueo`, `useActualizarBloqueo`, `useEliminarBloqueo`, `useDisponibilidadRecurso`, `useGuardarDisponibilidad`, `useSlots`, `ApiError`.

- [ ] **Step 1: Escribir el hook**

Crear `src/hooks/useDisponibilidad.js`, siguiendo el patrón exacto de `src/hooks/useAdminCreditos.js`:

```js
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const disponibilidadKeys = {
  all: ["disponibilidad"],
  recurso: (id) => ["disponibilidad", "recurso", id],
  bloqueos: (id) => ["disponibilidad", "bloqueos", id ?? "todos"],
  slots: (id, fecha) => ["disponibilidad", "slots", id, fecha],
};

/** Conserva el código del backend para distinguir bloqueo de fuera-de-horario. */
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
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ApiError(data?.message || "Error al comunicarse con el servidor", res.status, data);
  }
  return data;
}

export function useBloqueos(idRecurso, token) {
  return useQuery({
    queryKey: disponibilidadKeys.bloqueos(idRecurso),
    queryFn: () =>
      pedir(`${API_URL}/api/disponibilidad/bloqueos${idRecurso ? `?idRecurso=${idRecurso}` : ""}`, { token }),
  });
}

export function useCrearBloqueo(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      pedir(`${API_URL}/api/disponibilidad/bloqueos`, { token, method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

export function useActualizarBloqueo(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      pedir(`${API_URL}/api/disponibilidad/bloqueos/${id}`, { token, method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

export function useEliminarBloqueo(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => pedir(`${API_URL}/api/disponibilidad/bloqueos/${id}`, { token, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

export function useDisponibilidadRecurso(idRecurso, token) {
  return useQuery({
    queryKey: disponibilidadKeys.recurso(idRecurso),
    queryFn: () => pedir(`${API_URL}/api/disponibilidad/recurso/${idRecurso}`, { token }),
    enabled: Boolean(idRecurso),
  });
}

export function useGuardarDisponibilidad(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idRecurso, franjas }) =>
      pedir(`${API_URL}/api/disponibilidad/recurso/${idRecurso}`, {
        token,
        method: "PUT",
        body: JSON.stringify({ franjas }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: disponibilidadKeys.all }),
  });
}

/** Lo consume el flujo de reserva del usuario para apagar horarios no disponibles. */
export function useSlots(idRecurso, fecha) {
  return useQuery({
    queryKey: disponibilidadKeys.slots(idRecurso, fecha),
    queryFn: () => pedir(`${API_URL}/api/disponibilidad/slots?idRecurso=${idRecurso}&fecha=${fecha}`),
    enabled: Boolean(idRecurso && fecha),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

Todas las mutations invalidan `disponibilidadKeys.all`. Como `slots` cuelga del mismo prefijo, el flujo del usuario se refresca solo cuando el admin cambia algo.

- [ ] **Step 2: Verificar que compila**

Run: `npx vite build 2>&1 | tail -20`
Expected: build exitoso, sin errores de import.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDisponibilidad.js
git commit -m "feat: add availability query hooks"
```

---

### Task 9: Grilla semanal de disponibilidad

**Files:**
- Create: `src/components/GrillaDisponibilidad.jsx`
- Create: `src/styles/admin/gestionDisponibilidad.module.css`

**Interfaces:**
- Produces: `<GrillaDisponibilidad value={franjas} onChange={fn} bloqueos={[]} />`
  - `value`: `[{ diaSemana, horaInicio, horaFin }]`
  - `onChange(franjasNuevas)`: se llama en cada cambio del pintado.
  - `bloqueos`: `[{ FechaInicio, FechaFin, Motivo }]`, se pintan en rojo sobre la grilla.

- [ ] **Step 1: Escribir el componente**

Crear `src/components/GrillaDisponibilidad.jsx`:

```jsx
import { useState, useMemo, useCallback } from "react";
import styles from "../styles/admin/gestionDisponibilidad.module.css";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HORA_DESDE = 9;
const HORA_HASTA = 21;
const HORAS = Array.from({ length: HORA_HASTA - HORA_DESDE }, (_, i) => HORA_DESDE + i);

const hhmm = (h) => `${String(h).padStart(2, "0")}:00`;

/** Franjas -> Set de celdas "dia-hora" para pintar rápido. */
function franjasACeldas(franjas) {
  const celdas = new Set();
  for (const f of franjas) {
    const desde = Number(String(f.horaInicio).slice(0, 2));
    const hasta = Number(String(f.horaFin).slice(0, 2));
    for (let h = desde; h < hasta; h++) celdas.add(`${f.diaSemana}-${h}`);
  }
  return celdas;
}

/** Celdas -> franjas, fusionando horas contiguas del mismo día. */
function celdasAFranjas(celdas) {
  const franjas = [];
  for (let dia = 0; dia <= 6; dia++) {
    let inicio = null;
    for (let h = HORA_DESDE; h <= HORA_HASTA; h++) {
      const activa = h < HORA_HASTA && celdas.has(`${dia}-${h}`);
      if (activa && inicio === null) inicio = h;
      if (!activa && inicio !== null) {
        franjas.push({ diaSemana: dia, horaInicio: hhmm(inicio), horaFin: hhmm(h) });
        inicio = null;
      }
    }
  }
  return franjas;
}

export default function GrillaDisponibilidad({ value = [], onChange, bloqueos = [] }) {
  const celdas = useMemo(() => franjasACeldas(value), [value]);
  const [pintando, setPintando] = useState(null); // "activar" | "desactivar" | null

  const bloqueadas = useMemo(() => {
    const set = new Set();
    for (const b of bloqueos) {
      const ini = new Date(b.FechaInicio);
      const fin = new Date(b.FechaFin);
      for (let d = new Date(ini); d < fin; d.setHours(d.getHours() + 1)) {
        set.add(`${d.getDay()}-${d.getHours()}`);
      }
    }
    return set;
  }, [bloqueos]);

  const aplicar = useCallback(
    (dia, hora, modo) => {
      const clave = `${dia}-${hora}`;
      const siguiente = new Set(celdas);
      if (modo === "activar") siguiente.add(clave);
      else siguiente.delete(clave);
      onChange(celdasAFranjas(siguiente));
    },
    [celdas, onChange]
  );

  const alPresionar = (dia, hora) => {
    const modo = celdas.has(`${dia}-${hora}`) ? "desactivar" : "activar";
    setPintando(modo);
    aplicar(dia, hora, modo);
  };

  const alEntrar = (dia, hora) => {
    if (pintando) aplicar(dia, hora, pintando);
  };

  const copiarLunesATodos = () => {
    const delLunes = value.filter((f) => f.diaSemana === 1);
    const nuevas = [];
    for (let dia = 0; dia <= 6; dia++) {
      for (const f of delLunes) nuevas.push({ ...f, diaSemana: dia });
    }
    onChange(nuevas);
  };

  return (
    <div onMouseUp={() => setPintando(null)} onMouseLeave={() => setPintando(null)}>
      <div className={styles.grillaAcciones}>
        <button type="button" onClick={copiarLunesATodos}>Copiar lunes a toda la semana</button>
        <button type="button" onClick={() => onChange([])}>Limpiar</button>
      </div>

      <div className={styles.grilla}>
        <div className={styles.celdaHeader} />
        {DIAS.map((d) => (
          <div key={d} className={styles.celdaHeader}>{d}</div>
        ))}

        {HORAS.map((h) => (
          <>
            <div key={`h-${h}`} className={styles.celdaHora}>{hhmm(h)}</div>
            {DIAS.map((_, dia) => {
              const clave = `${dia}-${h}`;
              const bloqueada = bloqueadas.has(clave);
              const activa = celdas.has(clave);
              return (
                <div
                  key={clave}
                  role="gridcell"
                  aria-label={`${DIAS[dia]} ${hhmm(h)}`}
                  aria-selected={activa}
                  className={[
                    styles.celda,
                    activa ? styles.celdaActiva : "",
                    bloqueada ? styles.celdaBloqueada : "",
                  ].join(" ")}
                  onMouseDown={() => alPresionar(dia, h)}
                  onMouseEnter={() => alEntrar(dia, h)}
                />
              );
            })}
          </>
        ))}
      </div>

      <p className={styles.leyenda}>
        Verde: disponible. Rojo: bloqueado. Arrastrá para pintar varias horas.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Escribir los estilos**

Crear `src/styles/admin/gestionDisponibilidad.module.css`:

```css
.grilla {
  display: grid;
  grid-template-columns: 60px repeat(7, 1fr);
  gap: 2px;
  user-select: none;
}

.celdaHeader {
  font-weight: 600;
  text-align: center;
  padding: 6px 0;
  font-size: 0.85rem;
}

.celdaHora {
  font-size: 0.75rem;
  color: #666;
  text-align: right;
  padding-right: 8px;
  line-height: 28px;
}

.celda {
  height: 28px;
  background: #f0f0f0;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.12s;
}

.celda:hover {
  outline: 1px solid #999;
}

.celdaActiva {
  background: #52c41a;
}

.celdaBloqueada {
  background: #ff4d4f;
  cursor: not-allowed;
}

.grillaAcciones {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.leyenda {
  margin-top: 10px;
  font-size: 0.8rem;
  color: #666;
}

.panelDisponibilidad {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
}

.tarjetasRecurso {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.tarjetaRecurso {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tarjetaRecurso:hover {
  border-color: #1677ff;
}

.tarjetaActiva {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}

@media (max-width: 900px) {
  .panelDisponibilidad {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Corregir la key del fragmento**

El `map` de horas devuelve un fragmento sin `key`, lo que genera un warning de React. Reemplazar `<>` por `<Fragment key={h}>` importando `Fragment` de `react`, y sacar el `key={`h-${h}`}` del div interno:

```jsx
import { useState, useMemo, useCallback, Fragment } from "react";
```

```jsx
        {HORAS.map((h) => (
          <Fragment key={h}>
            <div className={styles.celdaHora}>{hhmm(h)}</div>
```

- [ ] **Step 4: Verificar que compila sin warnings**

Run: `npx vite build 2>&1 | tail -20`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add src/components/GrillaDisponibilidad.jsx src/styles/admin/gestionDisponibilidad.module.css
git commit -m "feat: add weekly availability grid component"
```

---

### Task 10: Panel admin de disponibilidad

**Files:**
- Create: `src/pages/admin/GestionDisponibilidad.jsx`
- Modify: `src/pages/admin/PanelAdmin.jsx`

**Interfaces:**
- Consumes: Task 8 (hooks), Task 9 (`GrillaDisponibilidad`).

- [ ] **Step 1: Revisar cómo PanelAdmin registra secciones**

Run: `sed -n 1,80p src/pages/admin/PanelAdmin.jsx`

Anotar el patrón exacto (array de secciones, rutas, o tabs) para seguirlo en el Step 3 en vez de inventar uno.

- [ ] **Step 2: Escribir la página**

Crear `src/pages/admin/GestionDisponibilidad.jsx`:

```jsx
import { useState, useMemo } from "react";
import { Cascader, Tabs, DatePicker, Input, Button, List, Popconfirm, message, Empty, Badge } from "antd";
import { useQuery } from "@tanstack/react-query";
import GrillaDisponibilidad from "../../components/GrillaDisponibilidad.jsx";
import {
  useBloqueos,
  useCrearBloqueo,
  useEliminarBloqueo,
  useDisponibilidadRecurso,
  useGuardarDisponibilidad,
} from "../../hooks/useDisponibilidad.js";
import styles from "../../styles/admin/gestionDisponibilidad.module.css";

const { RangePicker } = DatePicker;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function GestionDisponibilidad() {
  const token = localStorage.getItem("token");
  const [rutaEspacio, setRutaEspacio] = useState([]);
  const [idRecurso, setIdRecurso] = useState(null);
  const [franjas, setFranjas] = useState([]);
  const [rango, setRango] = useState(null);
  const [motivo, setMotivo] = useState("");

  const { data: estructura = [] } = useQuery({
    queryKey: ["admin", "estructura", "arbol"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/estructura/arbol`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("No se pudo cargar la estructura.");
      return res.json();
    },
  });

  const opcionesCascader = useMemo(
    () =>
      (estructura || []).map((piso) => ({
        value: `piso-${piso.idPiso}`,
        label: piso.Nombre,
        children: (piso.espacios || []).map((esp) => ({
          value: `espacio-${esp.Espacio}`,
          label: esp.Nombre,
          recursos: esp.recursos || [],
        })),
      })),
    [estructura]
  );

  const recursosDelEspacio = useMemo(() => {
    if (rutaEspacio.length < 2) return [];
    const piso = opcionesCascader.find((p) => p.value === rutaEspacio[0]);
    const espacio = piso?.children?.find((e) => e.value === rutaEspacio[1]);
    return espacio?.recursos ?? [];
  }, [rutaEspacio, opcionesCascader]);

  const { data: franjasGuardadas } = useDisponibilidadRecurso(idRecurso, token);
  const { data: bloqueos = [] } = useBloqueos(idRecurso, token);
  const guardar = useGuardarDisponibilidad(token);
  const crear = useCrearBloqueo(token);
  const eliminar = useEliminarBloqueo(token);

  const elegirRecurso = (rec) => {
    setIdRecurso(rec.idRecurso);
    setFranjas([]);
  };

  // Al llegar del servidor, se normaliza al shape de la grilla.
  const franjasVigentes = franjas.length
    ? franjas
    : (franjasGuardadas || []).map((f) => ({
        diaSemana: f.DiaSemana,
        horaInicio: String(f.HoraInicio).slice(0, 5),
        horaFin: String(f.HoraFin).slice(0, 5),
      }));

  const onGuardar = () => {
    guardar.mutate(
      { idRecurso, franjas: franjasVigentes },
      {
        onSuccess: () => {
          message.success("Disponibilidad guardada.");
          setFranjas([]);
        },
        onError: (e) => message.error(e.message),
      }
    );
  };

  const onCrearBloqueo = () => {
    if (!rango || !idRecurso) return message.warning("Elegí un recurso y un rango de fechas.");
    crear.mutate(
      {
        idRecurso,
        fechaInicio: rango[0].format("YYYY-MM-DDTHH:mm:00"),
        fechaFin: rango[1].format("YYYY-MM-DDTHH:mm:00"),
        motivo: motivo || null,
      },
      {
        onSuccess: (data) => {
          const n = data.reservasAfectadas?.length ?? 0;
          message.success(
            n > 0 ? `Bloqueo creado. Atención: ${n} reserva(s) ya existente(s) caen en ese rango.` : "Bloqueo creado."
          );
          setRango(null);
          setMotivo("");
        },
        onError: (e) => message.error(e.message),
      }
    );
  };

  return (
    <div className={styles.panelDisponibilidad}>
      <aside>
        <h3>Recurso</h3>
        <Cascader
          options={opcionesCascader}
          value={rutaEspacio}
          onChange={(v) => {
            setRutaEspacio(v || []);
            setIdRecurso(null);
          }}
          placeholder="Piso / Espacio"
          style={{ width: "100%" }}
        />

        <div className={styles.tarjetasRecurso}>
          {recursosDelEspacio.map((rec) => (
            <div
              key={rec.idRecurso}
              className={[styles.tarjetaRecurso, idRecurso === rec.idRecurso ? styles.tarjetaActiva : ""].join(" ")}
              onClick={() => elegirRecurso(rec)}
            >
              <div style={{ fontSize: "1.6rem" }}>{rec.Tipo === "sala" ? "🚪" : "🪑"}</div>
              <div>{rec.Nombre}</div>
            </div>
          ))}
        </div>
      </aside>

      <section>
        {!idRecurso ? (
          <Empty description="Elegí un espacio y después un recurso para configurar su disponibilidad." />
        ) : (
          <Tabs
            items={[
              {
                key: "horarios",
                label: "Horarios",
                children: (
                  <>
                    <GrillaDisponibilidad value={franjasVigentes} onChange={setFranjas} bloqueos={bloqueos} />
                    <Button type="primary" loading={guardar.isPending} onClick={onGuardar} style={{ marginTop: 16 }}>
                      Guardar horarios
                    </Button>
                  </>
                ),
              },
              {
                key: "bloqueos",
                label: <Badge count={bloqueos.length} offset={[10, 0]}>Bloqueos</Badge>,
                children: (
                  <>
                    <RangePicker showTime format="DD/MM/YYYY HH:mm" value={rango} onChange={setRango} />
                    <Input
                      placeholder="Motivo (opcional)"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      maxLength={300}
                      style={{ margin: "12px 0" }}
                    />
                    <Button type="primary" loading={crear.isPending} onClick={onCrearBloqueo}>
                      Crear bloqueo
                    </Button>

                    <List
                      style={{ marginTop: 20 }}
                      dataSource={bloqueos}
                      locale={{ emptyText: "Sin bloqueos para este recurso." }}
                      renderItem={(b) => (
                        <List.Item
                          actions={[
                            <Popconfirm
                              key="del"
                              title="¿Eliminar este bloqueo?"
                              onConfirm={() => eliminar.mutate(b.idBloqueo)}
                            >
                              <Button danger size="small">Eliminar</Button>
                            </Popconfirm>,
                          ]}
                        >
                          <List.Item.Meta
                            title={`${new Date(b.FechaInicio).toLocaleString("es-AR")} → ${new Date(b.FechaFin).toLocaleString("es-AR")}`}
                            description={b.Motivo || "Sin motivo"}
                          />
                        </List.Item>
                      )}
                    />
                  </>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2b: Ajustar el endpoint y el shape de la estructura**

La query usa `/api/admin/estructura/arbol` y asume `piso.espacios[].recursos[]`. Verificar el endpoint y la forma real:

Run: `grep -n "router.get" backend/src/routes/estructura.routes.js`

Si la ruta o el shape difieren, ajustar `opcionesCascader` y `recursosDelEspacio` a la estructura real antes de seguir. Este es el punto más probable de fricción de toda la tarea.

- [ ] **Step 3: Registrar la sección en PanelAdmin**

En `src/pages/admin/PanelAdmin.jsx`, agregar la entrada "Disponibilidad" siguiendo el patrón anotado en el Step 1 (import del componente + entrada en el array/objeto de secciones, con el mismo estilo de icono y permisos que usan las demás).

- [ ] **Step 4: Verificar que compila**

Run: `npx vite build 2>&1 | tail -20`
Expected: build exitoso.

- [ ] **Step 5: Probar en el navegador**

Run: `npm run dev` (y `cd backend && npm run dev` en otra terminal)

Verificar manualmente:
1. El panel admin muestra la sección "Disponibilidad".
2. El Cascader lista pisos y espacios; al elegir un espacio aparecen las tarjetas de recursos.
3. Pintar horas con drag y guardar → recargar la página muestra lo guardado.
4. Crear un bloqueo → aparece en la lista y se pinta en rojo en la tab Horarios.
5. Eliminar el bloqueo → desaparece de ambos lugares sin recargar (invalidación de TanStack Query).

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/GestionDisponibilidad.jsx src/pages/admin/PanelAdmin.jsx
git commit -m "feat: add admin availability management panel"
```

---

### Task 11: Apagar horarios no disponibles en el flujo de reserva

**Files:**
- Modify: la pantalla de selección de horario del usuario (identificarla en el Step 1)

**Interfaces:**
- Consumes: `useSlots` de Task 8.

- [ ] **Step 1: Localizar el selector de horario del usuario**

Run: `grep -rln "HorarioReserva\|horaInicio" src/pages/public src/components | head -10`

Identificar el componente donde el usuario elige hora después de elegir recurso y fecha. Ese es el archivo a modificar.

- [ ] **Step 2: Consumir los slots**

En ese componente, agregar:

```jsx
import { useSlots } from "../../hooks/useDisponibilidad.js";
```

```jsx
const { data: slots = [] } = useSlots(idRecursoSeleccionado, fechaSeleccionada);
const slotPorHora = useMemo(() => new Map(slots.map((s) => [s.hora, s])), [slots]);
```

- [ ] **Step 3: Deshabilitar las opciones no disponibles**

Donde se renderiza cada opción de horario, envolverla con el estado del slot. Si son opciones de un `Select` de Ant Design:

```jsx
<Select.Option
  key={hora}
  value={hora}
  disabled={slotPorHora.get(hora)?.disponible === false}
  title={slotPorHora.get(hora)?.motivo || undefined}
>
  {hora}
  {slotPorHora.get(hora)?.disponible === false ? ` — ${slotPorHora.get(hora).motivo}` : ""}
</Select.Option>
```

Si son botones o tarjetas, aplicar `disabled` y envolver en `<Tooltip title={motivo}>` de Ant Design. Adaptar al patrón que ya use ese componente en vez de introducir uno nuevo.

- [ ] **Step 4: Mostrar el error del backend si igual se intenta**

Donde se maneja el error de crear la reserva, usar el `message` del backend, que ya viene armado para mostrar:

```jsx
onError: (e) => message.error(e.message)
```

La UI previene; el backend garantiza. Ambos caminos deben mostrar texto claro.

- [ ] **Step 5: Verificar que compila**

Run: `npx vite build 2>&1 | tail -20`
Expected: build exitoso.

- [ ] **Step 6: Probar el flujo completo**

Con backend y frontend corriendo:
1. Como admin, bloquear un recurso mañana de 14:00 a 18:00.
2. Como usuario, elegir ese recurso y esa fecha: los horarios 14, 15, 16 y 17 aparecen deshabilitados con el motivo.
3. Intentar forzar la reserva vía API:

Run:
```bash
curl -X POST http://localhost:3001/api/reservas \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{"idRecurso":<ID>,"DiaReserva":"<MAÑANA>","HorarioReserva":"15:00","HorarioFin":"16:00","TipoReserva":"turno"}'
```
Expected: HTTP 400 con `{"codigo":"RECURSO_BLOQUEADO","message":"... está bloqueado hasta el ..."}`

Este paso es la verificación de RF17 de punta a punta.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: disable unavailable time slots in reservation flow"
```

---

### Task 12: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa del backend**

Run: `cd backend && npm test`
Expected: PASS, todos los archivos, sin regresiones.

- [ ] **Step 2: Build del frontend**

Run: `npx vite build`
Expected: build exitoso sin errores.

- [ ] **Step 3: Verificar la cobertura de RF17**

Run: `grep -c "validarDisponibilidadRecurso" backend/src/controllers/reservas.controller.js`
Expected: `5` — el import más las cuatro llamadas. Cualquier número menor significa que un camino de creación quedó sin validar.

- [ ] **Step 4: Repasar los casos manuales**

Con ambos servidores corriendo, confirmar:
1. Recurso sin disponibilidad configurada: se puede reservar de 09:00 a 21:00 como antes (sin regresión).
2. Recurso con franja de martes 10:00–18:00: reservar el martes 12:00–14:00 funciona; 09:00–11:00 devuelve `FUERA_DE_DISPONIBILIDAD`.
3. Recurso con bloqueo activo: cualquier reserva en el rango devuelve `RECURSO_BLOQUEADO` con la fecha y el motivo.
4. Bloqueo sobre un recurso padre: reservar un hijo devuelve `RECURSO_BLOQUEADO`.
5. Admin elimina el bloqueo: el usuario ve los horarios habilitados sin recargar la página.

- [ ] **Step 5: Commit final si quedó algún ajuste**

```bash
git add -A
git commit -m "test: verify availability rules end to end"
```

---

## Notas de verificación durante la ejecución

Tres supuestos de este plan se confirman contra el código en el paso donde se usan. Si alguno falla, corregirlo ahí mismo antes de seguir:

1. **PK de `"Reservas"`** — se asume `"idReserva"` (Task 3, Step 3).
2. **Campo del id de usuario en el token** — se asume `req.usuario.id` (Task 7, Step 2).
3. **Endpoint y shape del árbol de estructura** — se asume `/api/admin/estructura/arbol` con `piso.espacios[].recursos[]` (Task 10, Step 2b).

El resto del plan está verificado contra el código: los nombres de tabla, el patrón de repositorio, el estilo de los hooks, el montaje de rutas y las líneas exactas de enganche en el controller.
