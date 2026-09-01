-- Migración: sistema de créditos (RF06 - RF10).
-- Aditiva: no modifica ni borra datos existentes. Ejecutar una sola vez.

BEGIN;

CREATE TABLE IF NOT EXISTS creditos_config (
  id                INTEGER       PRIMARY KEY CHECK (id = 1),
  pesos_por_credito NUMERIC(10,2) NOT NULL DEFAULT 1.00
                    CHECK (pesos_por_credito > 0)
);

-- Tasa 1:1 — los campos de precio de Recursos (PrecioHora/Semanal/Mensual)
-- se cargan directamente en créditos, no en pesos.
INSERT INTO creditos_config (id, pesos_por_credito)
VALUES (1, 1.00)
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
