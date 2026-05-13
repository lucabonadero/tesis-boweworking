import React, { useState, useEffect, useCallback } from "react";
import {
  Table, Button, Modal, Form, Input, Select, Switch, Tag, Space,
  Divider, message, Popconfirm, Tooltip, Badge, Typography, Card, Row, Col,
} from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined,
  UserOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext.jsx";
import Header from "../../components/header.jsx";

const { Title, Text } = Typography;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const MODULO_LABELS = {
  reservas: "Reservas",
  clientes: "Clientes",
  espacios: "Espacios",
  financiero: "Gestión Financiera",
  calendario: "Calendario",
  altas: "Altas / Asistencia",
  usuarios: "Gestión de Usuarios",
};

const MODULO_COLORS = {
  reservas: "blue",
  clientes: "green",
  espacios: "purple",
  financiero: "red",
  calendario: "cyan",
  altas: "orange",
  usuarios: "magenta",
};

const ROL_COLORS = { admin: "red", empleado: "blue", staff: "green" };
const ROL_LABELS = { admin: "Administrador", empleado: "Empleado", staff: "Staff" };

// Permisos predeterminados al seleccionar un rol en el formulario de creación
const PERMISOS_DEFECTO_ROL = {
  admin: {},
  staff: {
    ver_reservas: true, crear_reservas: true, modificar_reservas: true, eliminar_reservas: true,
    ver_clientes: true, gestionar_clientes: true,
    ver_espacios: true, gestionar_espacios: true,
    ver_calendario: true, altas_clientes: true,
  },
  empleado: {
    ver_reservas: true, crear_reservas: true, modificar_reservas: true, eliminar_reservas: true,
    ver_clientes: true, gestionar_clientes: true,
    ver_espacios: true, gestionar_espacios: true,
    ver_calendario: true, altas_clientes: true,
  },
};

export default function GestionUsuarios() {
  const { token, user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [permisosCatalogo, setPermisosCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalPermisos, setModalPermisos] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [permisosTemp, setPermisosTemp] = useState({});
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [formCrear] = Form.useForm();

  const authHeaders = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [resUsuarios, resPermisos] = await Promise.all([
        fetch(`${API_URL}/api/admin/usuarios`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/admin/permisos`, { headers: authHeaders() }),
      ]);
      if (!resUsuarios.ok || !resPermisos.ok) throw new Error("Error al cargar datos");
      const [dataUsuarios, dataPermisos] = await Promise.all([
        resUsuarios.json(),
        resPermisos.json(),
      ]);
      setUsuarios(dataUsuarios);
      setPermisosCatalogo(dataPermisos);
    } catch {
      message.error("No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // Permisos agrupados por módulo
  const permisosPorModulo = permisosCatalogo.reduce((acc, p) => {
    if (!acc[p.modulo]) acc[p.modulo] = [];
    acc[p.modulo].push(p);
    return acc;
  }, {});

  // ── Crear usuario ──────────────────────────────────────────
  const handleCrear = async (values) => {
    setCreandoUsuario(true);
    try {
      const permisosSeleccionados = Object.entries(permisosTemp)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await fetch(`${API_URL}/api/admin/usuarios`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...values, permisos: permisosSeleccionados }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al crear usuario");

      message.success("Usuario creado correctamente");
      setModalCrear(false);
      formCrear.resetFields();
      setPermisosTemp({});
      cargarDatos();
    } catch (err) {
      message.error(err.message);
    } finally {
      setCreandoUsuario(false);
    }
  };

  // Precargar permisos predeterminados al elegir rol
  const handleRolChange = (rol) => {
    setPermisosTemp({ ...(PERMISOS_DEFECTO_ROL[rol] || {}) });
  };

  // ── Editar permisos ────────────────────────────────────────
  const abrirModalPermisos = (usuario) => {
    setUsuarioSeleccionado(usuario);
    const mapa = {};
    (usuario.permisos || []).forEach((clave) => { mapa[clave] = true; });
    setPermisosTemp(mapa);
    setModalPermisos(true);
  };

  const handleGuardarPermisos = async () => {
    if (!usuarioSeleccionado) return;
    setGuardandoPermisos(true);
    try {
      const permisos = Object.entries(permisosTemp)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await fetch(
        `${API_URL}/api/admin/usuarios/${usuarioSeleccionado.id}/permisos`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ permisos }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar permisos");

      message.success("Permisos actualizados correctamente");
      setModalPermisos(false);
      setUsuarioSeleccionado(null);
      cargarDatos();
    } catch (err) {
      message.error(err.message);
    } finally {
      setGuardandoPermisos(false);
    }
  };

  // ── Eliminar usuario ───────────────────────────────────────
  const handleEliminar = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/usuarios/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al eliminar");
      message.success("Usuario eliminado");
      cargarDatos();
    } catch (err) {
      message.error(err.message);
    }
  };

  // ── Columnas de la tabla ───────────────────────────────────
  const columns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (email) => (
        <Space>
          <MailOutlined style={{ color: "#888" }} />
          <Text>{email}</Text>
        </Space>
      ),
    },
    {
      title: "Rol",
      dataIndex: "rol",
      key: "rol",
      width: 160,
      render: (rol) => (
        <Tag color={ROL_COLORS[rol] || "default"}>
          {ROL_LABELS[rol] || rol}
        </Tag>
      ),
    },
    {
      title: "Permisos activos",
      dataIndex: "permisos",
      key: "permisos",
      render: (permisos, record) => {
        if (record.rol === "admin") {
          return <Badge status="success" text="Todos los permisos" />;
        }
        const count = (permisos || []).length;
        return (
          <Text type={count === 0 ? "danger" : "secondary"}>
            {count} permiso{count !== 1 ? "s" : ""}
          </Text>
        );
      },
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 200,
      render: (_, record) => {
        const esSelf = record.id === currentUser?.id;
        const esAdmin = record.rol === "admin";
        return (
          <Space>
            {!esAdmin && (
              <Tooltip title="Editar permisos">
                <Button
                  size="small"
                  icon={<KeyOutlined />}
                  onClick={() => abrirModalPermisos(record)}
                >
                  Permisos
                </Button>
              </Tooltip>
            )}
            {!esAdmin && !esSelf && (
              <Popconfirm
                title="¿Eliminar este usuario?"
                description="Esta acción no se puede deshacer."
                onConfirm={() => handleEliminar(record.id)}
                okText="Eliminar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Eliminar usuario">
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  // ── Panel de switches por módulo ───────────────────────────
  const renderPermisosPanel = (rolActual) => {
    const esAdmin = rolActual === "admin";
    return Object.entries(permisosPorModulo).map(([modulo, perms]) => (
      <div key={modulo} style={{ marginBottom: 20 }}>
        <Tag
          color={MODULO_COLORS[modulo] || "default"}
          style={{ marginBottom: 10, fontSize: 13, padding: "3px 10px" }}
        >
          {MODULO_LABELS[modulo] || modulo}
        </Tag>
        <Row gutter={[8, 8]}>
          {perms.map((p) => {
            const activo = esAdmin || !!permisosTemp[p.clave];
            return (
              <Col xs={24} sm={12} key={p.clave}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: activo ? "#f6ffed" : "#fafafa",
                    border: `1px solid ${activo ? "#b7eb8f" : "#e8e8e8"}`,
                    transition: "all 0.2s",
                    opacity: esAdmin ? 0.75 : 1,
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{p.descripcion}</Text>
                  <Switch
                    size="small"
                    checked={activo}
                    disabled={esAdmin}
                    onChange={(checked) =>
                      setPermisosTemp((prev) => ({ ...prev, [p.clave]: checked }))
                    }
                  />
                </div>
              </Col>
            );
          })}
        </Row>
      </div>
    ));
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 1100, margin: "32px auto", padding: "0 16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              <TeamOutlined style={{ marginRight: 8 }} />
              Gestión de Usuarios
            </Title>
            <Text type="secondary">Creá y administrá usuarios del panel de administración</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              formCrear.resetFields();
              setPermisosTemp({});
              setModalCrear(true);
            }}
          >
            Nuevo usuario
          </Button>
        </div>

        <Card bordered={false} style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <Table
            dataSource={usuarios}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: "No hay usuarios staff registrados" }}
          />
        </Card>

        {/* ── Modal: Crear usuario ── */}
        <Modal
          title={
            <Space>
              <PlusOutlined />
              Nuevo usuario staff
            </Space>
          }
          open={modalCrear}
          onCancel={() => {
            setModalCrear(false);
            setPermisosTemp({});
            formCrear.resetFields();
          }}
          onOk={() => formCrear.submit()}
          okText="Crear usuario"
          cancelText="Cancelar"
          confirmLoading={creandoUsuario}
          width={720}
          destroyOnClose
        >
          <Form
            form={formCrear}
            layout="vertical"
            onFinish={handleCrear}
            style={{ marginTop: 16 }}
          >
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="email"
                  label="Email"
                  rules={[
                    { required: true, message: "El email es obligatorio" },
                    { type: "email", message: "Ingresá un email válido" },
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="usuario@ejemplo.com" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="password"
                  label="Contraseña"
                  rules={[
                    { required: true, message: "La contraseña es obligatoria" },
                    { min: 6, message: "Mínimo 6 caracteres" },
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="Mínimo 6 caracteres" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="rol"
              label="Rol"
              rules={[{ required: true, message: "Seleccioná un rol" }]}
            >
              <Select
                placeholder="Seleccioná el rol del usuario"
                onChange={handleRolChange}
                options={[
                  { value: "staff", label: "Staff — sin acceso a módulo financiero" },
                  { value: "empleado", label: "Empleado — sin acceso a módulo financiero" },
                  { value: "admin", label: "Administrador — acceso completo al sistema" },
                ]}
              />
            </Form.Item>

            <Divider orientation="left" style={{ marginTop: 8 }}>
              <SafetyCertificateOutlined /> Permisos personalizados
            </Divider>

            <Form.Item
              shouldUpdate={(prev, curr) => prev.rol !== curr.rol}
              noStyle
            >
              {({ getFieldValue }) => {
                const rol = getFieldValue("rol");
                if (!rol) {
                  return (
                    <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                      Seleccioná un rol para configurar los permisos.
                    </Text>
                  );
                }
                if (rol === "admin") {
                  return (
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "#fff7e6",
                        borderRadius: 8,
                        border: "1px solid #ffd591",
                        marginBottom: 16,
                      }}
                    >
                      <Text>
                        El administrador tiene acceso a <strong>todos los módulos</strong> sin restricciones.
                        No se pueden limitar sus permisos.
                      </Text>
                    </div>
                  );
                }
                return <div style={{ maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>{renderPermisosPanel(rol)}</div>;
              }}
            </Form.Item>
          </Form>
        </Modal>

        {/* ── Modal: Editar permisos ── */}
        <Modal
          title={
            <Space>
              <KeyOutlined />
              Permisos — {usuarioSeleccionado?.email}
            </Space>
          }
          open={modalPermisos}
          onCancel={() => {
            setModalPermisos(false);
            setUsuarioSeleccionado(null);
          }}
          onOk={handleGuardarPermisos}
          okText="Guardar permisos"
          cancelText="Cancelar"
          confirmLoading={guardandoPermisos}
          width={720}
          destroyOnClose
        >
          {usuarioSeleccionado && (
            <div style={{ marginTop: 8 }}>
              <Space style={{ marginBottom: 16 }}>
                <Tag color={ROL_COLORS[usuarioSeleccionado.rol]}>
                  {ROL_LABELS[usuarioSeleccionado.rol] || usuarioSeleccionado.rol}
                </Tag>
                <Text type="secondary">{usuarioSeleccionado.email}</Text>
              </Space>
              <Divider style={{ marginTop: 4, marginBottom: 16 }} />
              <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
                {renderPermisosPanel(usuarioSeleccionado.rol)}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
