import { Modal, Alert, Descriptions, Skeleton, Tag, Typography } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Text, Paragraph } = Typography;

function colorPorcentaje(p) {
  if (p >= 100) return "green";
  if (p > 0) return "orange";
  return "red";
}

/**
 * Confirmación de cancelación con el reintegro a la vista (RF11 - RF13).
 *
 * El monto que muestra es informativo: el backend lo recalcula al confirmar.
 */
export default function CancelarReservaModal({
  abierto,
  reserva,
  preview,
  cargandoPreview,
  onConfirmar,
  onCerrar,
  confirmando,
  error,
}) {
  const puede = preview?.puedeCancelar === true;
  const porcentaje = preview?.porcentajeReintegro ?? 0;
  const aReintegrar = preview?.creditosAReintegrar ?? 0;
  const usados = preview?.creditosUsados ?? 0;

  return (
    <Modal
      open={abierto}
      title={
        <span>
          <ExclamationCircleOutlined style={{ color: "#faad14", marginRight: 8 }} />
          Cancelar reserva
        </span>
      }
      onOk={onConfirmar}
      onCancel={onCerrar}
      okText={aReintegrar > 0 ? `Cancelar y recuperar ${aReintegrar} créditos` : "Cancelar reserva"}
      cancelText="Volver"
      okButtonProps={{ danger: true, disabled: !puede || cargandoPreview, loading: confirmando }}
      destroyOnClose
    >
      {cargandoPreview ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <>
          {!puede && (
            <Alert
              type="warning"
              showIcon
              message="Esta reserva no se puede cancelar"
              description={preview?.mensaje || "El turno ya no admite cancelación."}
              style={{ marginBottom: 16 }}
            />
          )}

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Fecha">
              {reserva?.DiaReserva ? dayjs(reserva.DiaReserva).format("DD/MM/YYYY") : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Horario">
              {reserva?.HorarioReserva
                ? `${reserva.HorarioReserva} - ${reserva.HorarioFin || ""}`
                : reserva?.TipoReserva || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Recurso">{reserva?.recurso_nombre || "-"}</Descriptions.Item>
            <Descriptions.Item label="Créditos usados">{usados}</Descriptions.Item>
            <Descriptions.Item label="Reintegro">
              <Tag color={colorPorcentaje(porcentaje)}>{porcentaje}%</Tag>
              <Text strong>{aReintegrar} créditos</Text>
            </Descriptions.Item>
          </Descriptions>

          {preview?.reservasAfectadas > 1 && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={`Se cancelan ${preview.reservasAfectadas} reservas del mismo paquete.`}
            />
          )}

          {puede && porcentaje === 50 && (
            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Faltan menos de 24 horas para el turno, por eso el reintegro es del 50%.
            </Paragraph>
          )}

          {puede && (
            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Esta acción no se puede deshacer.
            </Paragraph>
          )}

          {error && (
            <Alert type="error" showIcon style={{ marginTop: 12 }} message={error.message} />
          )}
        </>
      )}
    </Modal>
  );
}
