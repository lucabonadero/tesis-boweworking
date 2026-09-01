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
