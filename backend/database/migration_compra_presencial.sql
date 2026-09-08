-- ============================================================
-- Migración: compras de paquetes cobradas presencialmente
--
-- Hasta acá toda fila de creditos_compra venía de Mercado Pago. El coworking
-- también vende paquetes en mostrador (efectivo, QR, transferencia), y esa
-- plata es ingreso real igual que la online: necesita quedar en la misma tabla
-- para que el panel financiero tenga una sola fuente.
-- ============================================================

ALTER TABLE creditos_compra
  ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'mercadopago',
  ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(30),
  ADD COLUMN IF NOT EXISTS registrada_por_usuario_id INTEGER
    REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS anulada_por_usuario_id INTEGER
    REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE creditos_compra DROP CONSTRAINT IF EXISTS creditos_compra_origen_check;
ALTER TABLE creditos_compra
  ADD CONSTRAINT creditos_compra_origen_check
  CHECK (origen IN ('mercadopago', 'presencial'));

-- 'anulada' cubre la reversión de un cobro presencial mal cargado.
ALTER TABLE creditos_compra DROP CONSTRAINT IF EXISTS creditos_compra_estado_check;
ALTER TABLE creditos_compra
  ADD CONSTRAINT creditos_compra_estado_check
  CHECK (estado IN ('pendiente', 'acreditada', 'rechazada', 'anulada'));

CREATE INDEX IF NOT EXISTS idx_creditos_compra_origen ON creditos_compra (origen);
CREATE INDEX IF NOT EXISTS idx_creditos_compra_acreditada_at ON creditos_compra (acreditada_at);
