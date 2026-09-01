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
