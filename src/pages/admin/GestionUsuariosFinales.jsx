import React, { useState } from "react";
import {
  Table, Button, Tag, Space, Typography, Input, Select, Modal,
  Form, message, Tooltip, Badge, Empty, Descriptions, Image,
} from "antd";
import {
  LockOutlined, UnlockOutlined, CheckOutlined, CloseOutlined,
  SearchOutlined, FileTextOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  useUsuariosFinales,
  useSolicitudesEstudiante,
  useCambiarEstadoCuenta,
  useResolverEstudiante,
  useComprobanteEstudiante,
} from "../../hooks/useAdminUsuarios.js";

const { Text, Paragraph } = Typography;

const ROL_CLIENTE_LABELS = { usuario: "Usuario", estudiante: "Estudiante" };
const ROL_CLIENTE_COLORS = { usuario: "blue", estudiante: "purple" };

const VERIFICACION_LABELS = {
  no_solicitado: "Sin solicitar",
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};
const VERIFICACION_COLORS = {
  no_solicitado: "default",
  pendiente: "gold",
  aprobado: "green",
  rechazado: "red",
};

/** Modal de solo lectura con el comprobante que adjunto el usuario. */
function ModalComprobante({ token, usuario, onClose }) {
  const { data, isLoading, isError, error } = useComprobanteEstudiante(token, usuario?.id);
  const esImagen = typeof data?.comprobante === "string" && data.comprobante.startsWith("data:image");

  return (
    <Modal
      open={Boolean(usuario)}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Cerrar</Button>}
      title={`Comprobante — ${usuario?.nombre ?? ""} ${usuario?.apellido ?? ""}`}
      width={900}
      style={{ top: 24 }}
      destroyOnClose
    >
      {isLoading && <Text type="secondary">Cargando comprobante…</Text>}
      {isError && <Text type="danger">{error?.message}</Text>}
      {data && (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Institución">
              {data.institucion || "No informada"}
            </Descriptions.Item>
          </Descriptions>
          {esImagen ? (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Clic en la imagen para ampliar, rotar o hacer zoom.
              </Text>
              <Image
                src={data.comprobante}
                alt="Comprobante de estudiante"
                style={{ borderRadius: 8, border: "1px solid #eee" }}
                preview={{ mask: "Ampliar" }}
              />
            </>
          ) : (
            <Paragraph copyable style={{ wordBreak: "break-all" }}>
              {data.comprobante}
            </Paragraph>
          )}
        </Space>
      )}
    </Modal>
  );
}

export default function GestionUsuariosFinales() {
  const { token } = useAuth();

  const [filtroRol, setFiltroRol] = useState();
  const [filtroEstado, setFiltroEstado] = useState();
  const [busqueda, setBusqueda] = useState("");
  const [comprobanteDe, setComprobanteDe] = useState(null);

  const filtros = {
    ...(filtroRol ? { rol: filtroRol } : {}),
    ...(filtroEstado ? { estado_cuenta: filtroEstado } : {}),
    ...(busqueda ? { q: busqueda } : {}),
    limit: 100,
  };

  const listado = useUsuariosFinales(token, filtros);
  const cambiarEstado = useCambiarEstadoCuenta(token);

  const usuarios = listado.data?.items ?? [];

  // RF01: bloquear pide motivo; habilitar es directo.
  const confirmarBloqueo = (registro) => {
    let motivo = "";
    Modal.confirm({
      title: `Bloquear la cuenta de ${registro.email}`,
      icon: <LockOutlined style={{ color: "#cf1322" }} />,
      content: (
        <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
          <Text type="secondary">
            La persona no va a poder iniciar sesión hasta que la habilites de nuevo.
          </Text>
          <Input.TextArea
            rows={3}
            placeholder="Motivo del bloqueo (obligatorio)"
            onChange={(e) => { motivo = e.target.value; }}
          />
        </Space>
      ),
      okText: "Bloquear cuenta",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        if (!motivo.trim()) {
          message.error("Indicá el motivo del bloqueo");
          return Promise.reject(new Error("motivo requerido"));
        }
        await cambiarEstado.mutateAsync({ id: registro.id, accion: "bloquear", motivo });
        message.success("Cuenta bloqueada");
      },
    });
  };

  const habilitar = async (registro) => {
    try {
      await cambiarEstado.mutateAsync({ id: registro.id, accion: "habilitar" });
      message.success("Cuenta habilitada");
    } catch (err) {
      message.error(err.message);
    }
  };

  const columnas = [
    {
      title: "Usuario",
      key: "usuario",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{[r.nombre, r.apellido].filter(Boolean).join(" ") || "Sin nombre"}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
        </Space>
      ),
    },
    { title: "DNI", dataIndex: "dni", key: "dni", width: 120, render: (v) => v || "—" },
    {
      title: "Rol",
      dataIndex: "rol",
      key: "rol",
      width: 130,
      // RF02: el filtro por rol se controla desde el Select superior (contra el servidor).
      render: (rol) => (
        <Tag color={ROL_CLIENTE_COLORS[rol] || "default"}>
          {ROL_CLIENTE_LABELS[rol] || rol}
        </Tag>
      ),
    },
    {
      title: "Verificación",
      dataIndex: "estado_verificacion_estudiante",
      key: "verificacion",
      width: 140,
      render: (estado) => (
        <Tag color={VERIFICACION_COLORS[estado] || "default"}>
          {VERIFICACION_LABELS[estado] || estado}
        </Tag>
      ),
    },
    {
      title: "Estado",
      dataIndex: "estado_cuenta",
      key: "estado_cuenta",
      width: 130,
      render: (estado, r) =>
        estado === "bloqueado" ? (
          <Tooltip title={r.motivo_bloqueo || "Sin motivo registrado"}>
            <Badge status="error" text="Bloqueada" />
          </Tooltip>
        ) : (
          <Badge status="success" text="Activa" />
        ),
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 170,
      render: (_, r) =>
        r.estado_cuenta === "bloqueado" ? (
          <Button
            size="small"
            icon={<UnlockOutlined />}
            loading={cambiarEstado.isPending}
            onClick={() => habilitar(r)}
          >
            Habilitar
          </Button>
        ) : (
          <Button
            size="small"
            danger
            icon={<LockOutlined />}
            loading={cambiarEstado.isPending}
            onClick={() => confirmarBloqueo(r)}
          >
            Bloquear
          </Button>
        ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Space wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Buscar por nombre, email o DNI"
          style={{ width: 280 }}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Select
          allowClear
          placeholder="Filtrar por rol"
          style={{ width: 180 }}
          value={filtroRol}
          onChange={setFiltroRol}
          options={[
            { value: "usuario", label: "Usuario" },
            { value: "estudiante", label: "Estudiante" },
          ]}
        />
        <Select
          allowClear
          placeholder="Filtrar por estado"
          style={{ width: 180 }}
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: "activo", label: "Activa" },
            { value: "bloqueado", label: "Bloqueada" },
          ]}
        />
        <Text type="secondary">
          {listado.data?.total ?? 0} usuario{(listado.data?.total ?? 0) !== 1 ? "s" : ""}
        </Text>
      </Space>

      {listado.isError && <Text type="danger">{listado.error?.message}</Text>}

      <Table
        dataSource={usuarios}
        columns={columnas}
        rowKey="id"
        loading={listado.isLoading || listado.isFetching}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: <Empty description="No hay usuarios que coincidan con el filtro" /> }}
      />

      <ModalComprobante
        token={token}
        usuario={comprobanteDe}
        onClose={() => setComprobanteDe(null)}
      />
    </Space>
  );
}

/**
 * RF04: bandeja de solicitudes pendientes de verificacion de estudiante.
 * Se exporta aparte para usarla como pestana dentro de Gestion de Usuarios.
 */
export function SolicitudesEstudiante() {
  const { token } = useAuth();
  const solicitudes = useSolicitudesEstudiante(token);
  const resolver = useResolverEstudiante(token);
  const [comprobanteDe, setComprobanteDe] = useState(null);
  const [formRechazo] = Form.useForm();

  const aprobar = (registro) => {
    Modal.confirm({
      title: `Aprobar a ${registro.nombre} ${registro.apellido} como Estudiante`,
      icon: <CheckOutlined style={{ color: "#389e0d" }} />,
      content: (
        <Text type="secondary">
          La cuenta pasa al rol Estudiante y accede a los beneficios diferenciados.
        </Text>
      ),
      okText: "Aprobar",
      cancelText: "Cancelar",
      onOk: async () => {
        await resolver.mutateAsync({ id: registro.id, decision: "aprobar" });
        message.success("Solicitud aprobada");
      },
    });
  };

  const rechazar = (registro) => {
    formRechazo.resetFields();
    Modal.confirm({
      title: `Rechazar la solicitud de ${registro.nombre} ${registro.apellido}`,
      icon: <CloseOutlined style={{ color: "#cf1322" }} />,
      content: (
        <Form form={formRechazo} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="motivo"
            label="Motivo del rechazo"
            rules={[{ required: true, message: "Indicá el motivo" }]}
          >
            <Input.TextArea rows={3} placeholder="Ej: el comprobante no es legible" />
          </Form.Item>
        </Form>
      ),
      okText: "Rechazar",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        const { motivo } = await formRechazo.validateFields();
        await resolver.mutateAsync({ id: registro.id, decision: "rechazar", motivo });
        message.success("Solicitud rechazada");
      },
    });
  };

  const columnas = [
    {
      title: "Solicitante",
      key: "solicitante",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{[r.nombre, r.apellido].filter(Boolean).join(" ")}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
        </Space>
      ),
    },
    {
      title: "Institución",
      dataIndex: "institucion_estudiante",
      key: "institucion",
      render: (v) => v || <Text type="secondary">No informada</Text>,
    },
    {
      title: "Solicitado",
      dataIndex: "solicitud_estudiante_at",
      key: "solicitud_at",
      width: 160,
      render: (v) => (v ? new Date(v).toLocaleDateString("es-AR") : "—"),
    },
    {
      title: "Comprobante",
      key: "comprobante",
      width: 140,
      render: (_, r) =>
        r.tiene_comprobante ? (
          <Button size="small" icon={<FileTextOutlined />} onClick={() => setComprobanteDe(r)}>
            Ver
          </Button>
        ) : (
          <Text type="secondary">Sin adjunto</Text>
        ),
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 200,
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={resolver.isPending}
            onClick={() => aprobar(r)}
          >
            Aprobar
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            loading={resolver.isPending}
            onClick={() => rechazar(r)}
          >
            Rechazar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      {solicitudes.isError && <Text type="danger">{solicitudes.error?.message}</Text>}
      <Table
        dataSource={solicitudes.data?.items ?? []}
        columns={columnas}
        rowKey="id"
        loading={solicitudes.isLoading}
        pagination={false}
        locale={{ emptyText: <Empty description="No hay solicitudes pendientes" /> }}
      />
      <ModalComprobante
        token={token}
        usuario={comprobanteDe}
        onClose={() => setComprobanteDe(null)}
      />
    </>
  );
}
