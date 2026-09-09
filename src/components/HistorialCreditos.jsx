import React, { useState } from "react";
import dayjs from "dayjs";
import { Card, Table, Tag, Statistic, Empty, Typography, Alert, Button } from "antd";
import { useAuth } from "../context/AuthContext.jsx";
import { useSaldoCreditos, useMovimientosCreditos } from "../hooks/useCreditos.js";
import ComprarCreditosModal from "./ComprarCreditosModal.jsx";
import CoinIcon from "./CoinIcon.jsx";
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
        prefix={<CoinIcon color="var(--color-warning-text)" />}
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
