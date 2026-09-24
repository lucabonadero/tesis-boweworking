# Deploy en Render

Todo el proyecto en un solo proveedor: frontend, backend y base de datos.
`render.yaml` los declara juntos y conecta las URLs entre servicios solo.

## Por qué Render y no Vercel

Vercel corre funciones serverless: nacen por request y mueren. El backend es un
Express con un pool de conexiones `pg` que vive mientras vive el proceso, y usa
transacciones para evitar reservas duplicadas. En serverless eso habria que
rediseñarlo.

Render corre un proceso Node persistente, como un VPS pero sin administrar el
servidor. El codigo funciona sin modificaciones.

El frontend tambien va a Render: sus sitios estaticos son gratis y **sin la
restriccion de uso comercial** del plan Hobby de Vercel. Un panel en lugar de
dos, y ~US$ 20/mes menos.

---

## 0. Antes de empezar: rotar los secretos

`backend/.env.bak` estuvo commiteado en un repositorio publico. Lo que contiene
se considera comprometido:

1. **Gmail** — https://myaccount.google.com/apppasswords → revocar el password
   actual y generar uno nuevo. Va en `SMTP_PASS`.
2. **JWT_SECRET** — generar uno nuevo:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
3. **Mercado Pago** — al pasar a credenciales de produccion, no reuses la de prueba.

Los archivos ya salieron del control de versiones, pero **siguen en el historial
de git**: en un repo publico cualquiera puede leerlos. Rotar es lo que corta el
acceso.

---

## 1. Crear los tres servicios

1. https://dashboard.render.com → **New** → **Blueprint**.
2. Elegir este repositorio. Render lee `render.yaml` y muestra:
   - `bowe-db` — PostgreSQL
   - `bowe-backend` — el Express
   - `bowe-frontend` — el sitio estatico
3. Pide solo los secretos (lo marcado `sync: false`):

   | Variable | Servicio | Valor |
   |---|---|---|
   | `JWT_SECRET` | backend | el que generaste recien |
   | `SMTP_USER` | backend | tu casilla de Gmail |
   | `SMTP_PASS` | backend | el App Password **nuevo** |
   | `MP_ACCESS_TOKEN` | backend | token de Mercado Pago (**produccion**, no `TEST-`) |
   | `MP_WEBHOOK_SECRET` | backend | secreto del webhook, del panel de MP |
   | `GOOGLE_CLIENT_ID` | backend | `289294103067-d99vv79q5fb1i1qcqvit3rpp97ih11kl.apps.googleusercontent.com` |
   | `MAIL_FROM` | backend | remitente, ej. `Bo WeWorking <reservas@tudominio.com>` |
   | `VITE_GOOGLE_CLIENT_ID` | frontend | el mismo Client ID de arriba |

4. **Apply**.

`DATABASE_URL`, `CORS_ORIGINS`, `FRONTEND_URL`, `BACKEND_URL` y `PUBLIC_APP_URL`
**no hay que cargarlas**: Render las resuelve entre servicios. Eso elimina el
paso mas facil de equivocar (poner mal el dominio y que CORS bloquee todo).

Al terminar vas a tener dos URLs:

```
https://bowe-frontend.onrender.com    la app
https://bowe-backend.onrender.com     la API
```

> El primer deploy del frontend puede fallar si el backend todavia no existe
> (necesita su host para el build). Si pasa, redeployalo desde el panel una vez
> que el backend este arriba.

---

## 2. Cargar la base

Con la **External Database URL** del panel de `bowe-db` (la *External*, no la
*Internal* — esa solo funciona dentro de Render):

```bash
cd backend/database
export DB="<External Database URL>"

psql "$DB" -v ON_ERROR_STOP=1 -f init/01_schema.sql
psql "$DB" -v ON_ERROR_STOP=1 -f migration_permisos_staff_v2.sql
psql "$DB" -v ON_ERROR_STOP=1 -f migration_indice_password_reset.sql
```

Las otras migraciones **no hacen falta**: `01_schema.sql` es un dump que ya las
incluye. El detalle esta en `backend/database/SETUP_PRODUCCION.md`.

Verificar:

```bash
psql "$DB" -c "SELECT COUNT(*) FROM permisos;"   # 17
```

Crear el primer administrador (sin esto no podes entrar al panel):

```bash
cd backend
DATABASE_URL="$DB" node crear-admin.mjs tu@email.com "UnaClaveLargaYSegura"
```

---

## 3. Google OAuth

https://console.cloud.google.com/apis/credentials → tu Client ID → agregar en
**Orígenes de JavaScript autorizados**:

```
https://bowe-frontend.onrender.com
```

Y si más adelante usás un dominio propio, agregalo también.

Sin esto el login con Google falla con `origin_mismatch`.

---

## 4. Mercado Pago

### Credenciales de producción

Las del `.env` actual son de prueba (`TEST-`): mueven dinero ficticio. Para
cobrar de verdad hay que generar las de producción en
https://www.mercadopago.com.ar/developers/panel → tu aplicación →
**Credenciales de producción**, y ponerlas en `MP_ACCESS_TOKEN`.

Mercado Pago pide completar datos de la cuenta antes de habilitarlas. No lo
dejes para el día anterior a abrir.

### Webhook y su secreto

El backend **valida la firma HMAC** de cada notificación
(`mercadopago.controller.js`) y con `NODE_ENV=production` rechaza todo si
`MP_WEBHOOK_SECRET` no está definido. Sin ese secreto ningún pago se acredita.

En el panel de Mercado Pago → **Webhooks**:

- URL: `https://bowe-backend.onrender.com/api/pagos/webhook`
- Copiar la **clave secreta** que genera y cargarla en `MP_WEBHOOK_SECRET`.

Verificá la ruta exacta del webhook en `backend/src/routes/pagos.routes.js`
antes de darla de alta.

Como `BACKEND_URL` ya apunta a Render, no hace falta ngrok.

### Probar antes de abrir al público

Hacé una compra de créditos real por el monto mínimo y confirmá que el saldo se
acredite. Es la única forma de saber que la cadena completa —preferencia,
webhook, firma, acreditación— funciona en producción.

---

## 5. Comprobar

La API y su conexión con la base:

```bash
curl https://bowe-backend.onrender.com/api/health
# {"status":"ok","message":"Bo WeWorking API funcionando","db":"ok"}
```

Si responde `503` con `"db":"unreachable"`, el proceso está vivo pero no llega a
la base: revisá que `DATABASE_URL` esté conectada en el panel.

Después, en el navegador (`https://bowe-frontend.onrender.com`):

- Entrá con el admin que creaste.
- Estando en `/admin/...`, **recargá la página**: si carga bien, el rewrite de
  SPA funciona.
- Abrí la consola del navegador y confirmá que no haya errores de CORS. Si los
  hay, el frontend está llamando a la URL equivocada — redeployalo para que
  tome el host del backend en el build.

---

## Costos

| Servicio | Plan | Costo | Por que no free |
|---|---|---|---|
| `bowe-db` | `basic-256mb` | ~US$ 6/mes | La base free **se borra a los 30 dias** |
| `bowe-backend` | `starter` | ~US$ 7/mes | El free duerme a los 15 min: el primer cliente del dia espera ~50 s |
| `bowe-frontend` | estatico | **US$ 0** | Los sitios estaticos de Render son gratis, sin limite de uso comercial |

**Total: ~US$ 13/mes.**

El frontend es la parte gratis: son archivos servidos por CDN, sin proceso
corriendo. Ahi esta la diferencia con Vercel, cuyo plan gratuito prohibe el uso
comercial (~US$ 20/mes de Pro para un coworking que cobra).

Sobre la base: Render Postgres es PostgreSQL estandar, mismo motor y mismo
driver que usas en local. No hay nada que adaptar, y `pg_dump` te deja llevarla
a cualquier otro lado.

### Otros costos, fuera del hosting

- **Dominio propio** (`bo-weworking.com.ar`) — ~US$ 15-25/año. Opcional, pero un
  `.onrender.com` no transmite confianza a clientes que pagan. Se conecta desde
  el panel del servicio, en Settings → Custom Domains.
- **Mercado Pago** — sin mensualidad, cobra comision por transaccion. El
  porcentaje vigente esta en tu panel.
- **Mails** — Gmail gratis hasta ~500/dia. Si el coworking supera eso, un
  servicio transaccional ronda US$ 15/mes.

---

## Antes de abrir al público

Lo que sigue no hace falta para una demo, pero sí cuando entran usuarios reales
con datos y pagos.

### Backups

`basic-256mb` incluye backups diarios de Render, pero **verificá que estén
activos** en el panel de la base y probá una restauración una vez. Un backup que
nunca se restauró no es un backup.

Además, una copia propia periódica:

```bash
pg_dump "$DB" > backup-$(date +%F).sql
```

### Monitoreo

Render tiene logs y métricas en el panel, pero no avisa solo. Configurá al menos
las **notificaciones por email** de deploy fallido y de servicio caído, en
Settings → Notifications.

Para saber si la app se cayó de madrugada, un chequeo externo gratuito
(UptimeRobot o similar) contra `/api/health` cada 5 minutos. Esa ruta ahora
consulta la base, así que también detecta el caso de "el proceso vive pero la
base no responde".

### Límite del pool

`DB_POOL_MAX` está en 10 por defecto, contra las ~20 conexiones de
`basic-256mb`. Si en horas pico ves errores de conexión en los logs, el próximo
paso es subir el plan de la base, no el número del pool: más conexiones contra
el mismo límite empeora el problema.
