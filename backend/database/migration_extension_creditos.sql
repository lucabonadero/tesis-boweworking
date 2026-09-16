-- ───────────────────────────────────────────────────────────────────────────
-- Extensión de reservas: cobro en CRÉDITOS
--
-- La extensión dejaba un cargo PENDIENTE en pesos (una fila en "Transaccion").
-- Pasa a cobrarse con los créditos del titular, igual que una reserva normal:
-- se descuenta del saldo en el momento y queda asentada en creditos_movimiento.
-- En pesos queda solo la compra de paquetes de créditos.
--
-- "Monto"/"PrecioFraccion" se conservan: siguen siendo la base de cálculo en
-- pesos desde la que se derivan los créditos (ceil(monto / pesos_por_credito)),
-- y sirven de registro histórico de lo facturado.
--
-- Migración aditiva: no recrea la tabla ni descarta extensiones existentes.
-- ───────────────────────────────────────────────────────────────────────────

-- Créditos ya descontados por esta extensión. Al re-extender, el cobro es
-- incremental: se descuenta la diferencia contra lo ya cobrado, no el total.
ALTER TABLE "ReservaExtension"
  ADD COLUMN IF NOT EXISTS "CreditosDescontados" INTEGER NOT NULL DEFAULT 0
    CHECK ("CreditosDescontados" >= 0);

-- Las extensiones viejas (cobradas en pesos vía Transaccion) quedan en 0:
-- nunca descontaron créditos, y su cargo pendiente se resuelve por el
-- circuito anterior.

-- El libro de créditos permite asentar el movimiento de una extensión.
-- 'descuento_reserva' ya cubre el caso (la extensión pertenece a la reserva),
-- así que no se agrega un tipo nuevo: el motivo del movimiento lo distingue.
