import React, { useState, useMemo } from "react";
import {
  Table, Button, Modal, Form, Input, Select, Switch, Tag, Space,
  Divider, message, Popconfirm, Tooltip, Badge, Typography, Card, Row, Col,
  Tabs, Alert,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, KeyOutlined,
  LockOutlined, MailOutlined, SafetyCertificateOutlined,
  TeamOutlined, SwapOutlined, ReloadOutlined, SolutionOutlined,
  UserSwitchOutlined, WarningOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext.jsx";
import Header from "../../components/header.jsx";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import adminLayout from "../../styles/admin/adminLayout.module.css";
import permisosStyles from "../../styles/admin/permisosModal.module.css";
import GestionUsuariosFinales, {
  SolicitudesEstudiante,
} from "./GestionUsuariosFinales.jsx";
import {
  useUsuariosStaff,
  usePermisosCatalogo,
  useCrearUsuarioStaff,
  useCambiarRolStaff,
  useActualizarPermisosStaff,
  useRestaurarPermisosStaff,
  useEliminarUsuarioStaff,
  useSolicitudesEstudiante,
} from "../../hooks/useAdminUsuarios.js";

const { Text } = Typography;

const MODULO_LABELS = {
  reservas: "Reservas",
  clientes: "Clientes",
  espacios: "Espacios",
  estructura: "Estructura",
  creditos: "Créditos",
  financiero: "Gestión Financiera",
  calendario: "Calendario",
  altas: "Altas y Asistencia",
  usuarios: "Gestión de Usuarios",
};

const MODULO_COLORS = {
  reservas: "blue",
  clientes: "green",
  espacios: "purple",
  estructura: "geekblue",
  creditos: "gold",
  financiero: "red",
  calendario: "cyan",
  altas: "orange",
  usuarios: "magenta",
};

/** Orden de los módulos en el panel de permisos: operación primero, administración al final. */
const MODULO_ORDEN = [
  "reservas", "calendario", "clientes", "altas",
  "espacios", "estructura", "creditos", "financiero", "usuarios",
];

/** Permisos sensibles: quedan reservados al admin salvo decisión explícita. */
const PERMISOS_SENSIBLES = new Set(["gestionar_usuarios", "gestionar_pagos"]);

const ROL_COLORS = { admin: "red", staff: "green", empleado: "default" };
const ROL_LABELS = { admin: "Administrador", staff: "Staff", empleado: "Empleado (legacy)" };

// Permisos predeterminados al seleccionar un rol en el formulario de creación
const PERMISOS_DEFECTO_ROL = {
  admin: {},
  // Refleja PERMISOS_POR_ROL.staff del backend (rolUsuario.service.js).
  // ver_financiero entra por defecto: el backend le oculta los montos totales
  // a quien no es admin, así que el staff solo ve conteos y transacciones.
  staff: {
    ver_reservas: true, crear_reservas: true, modificar_reservas: true, eliminar_reservas: true,
    ver_clientes: true, gestionar_clientes: true,
    ver_espacios: true, gestionar_espacios: true,
    ver_calendario: true, altas_clientes: true,
    ver_financiero: true, registrar_pagos: true,
  },
};

/** Pestaña de staff del panel: la gestión que ya existía, sobre TanStack Query. */
function PanelStaff() {
  const { token, user: currentUser } = useAuth();

  const [modalCrear, setModalCrear] = useState(false);
  const [modalPermisos, setModalPermisos] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [permisosTemp, setPermisosTemp] = useState({});
  const [filtroRol, setFiltroRol] = useState();
  const [formCrear] = Form.useForm();

  const usuariosQuery = useUsuariosStaff(token);
  const permisosQuery = usePermisosCatalogo(token);

  const crearUsuario = useCrearUsuarioStaff(token);
  const cambiarRol = useCambiarRolStaff(token);
  const actualizarPermisos = useActualizarPermisosStaff(token);
  const restaurarPermisos = useRestaurarPermisosStaff(token);
  const eliminarUsuario = useEliminarUsuarioStaff(token);

  const usuarios = usuariosQuery.data ?? [];
  const permisosCatalogo = useMemo(() => permisosQuery.data ?? [], [permisosQuery.data]);

  // RF02: filtro por rol aplicado sobre el listado.
  const usuariosVisibles = filtroRol
    ? usuarios.filter((u) => u.rol === filtroRol)
    : usuarios;

  // Agrupado por módulo y ordenado: operación primero, administración al final.
  // Los módulos que no figuran en MODULO_ORDEN van al fondo, alfabéticos.
  const permisosPorModulo = useMemo(() => {
    const agrupado = permisosCatalogo.reduce((acc, p) => {
      (acc[p.modulo] ||= []).push(p);
      return acc;
    }, {});
    const peso = (modulo) => {
      const i = MODULO_ORDEN.indexOf(modulo);
      return i === -1 ? MODULO_ORDEN.length : i;
    };
    return Object.entries(agrupado).sort(
      ([a], [b]) => peso(a) - peso(b) || a.localeCompare(b)
    );
  }, [permisosCatalogo]);

  const permisosSeleccionados = () =>
    Object.entries(permisosTemp).filter(([, v]) => v).map(([k]) => k);

  /**
   * Cambia el rol de una cuenta ya existente.
   * El backend recalcula los permisos en la misma transacción, así que la
   * cuenta nunca queda con permisos que no correspondan a su nuevo rol.
   */
  const confirmarCambioRol = ({ id, email, rolActual, rolNuevo, trasAltaDuplicada }) => {
    Modal.confirm({
      title: trasAltaDuplicada ? "Esta cuenta ya existe" : "Cambiar el rol de la cuenta",
      icon: <UserSwitchOutlined style={{ color: "#d46b08" }} />,
      width: 520,
      content: (
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 8 }}>
          {trasAltaDuplicada && (
            <Alert
              type="warning"
              showIcon
              message="No se creó ninguna cuenta nueva"
              description={`Ya existe una cuenta registrada con ${email}. No se aplicó ningún cambio todavía.`}
            />
          )}
          <Text>
            {trasAltaDuplicada ? "¿Querés cambiarle el rol a esta cuenta?" : "Vas a modificar el rol de esta cuenta."}
          </Text>
          <Space>
            <Tag color={ROL_COLORS[rolActual]}>{ROL_LABELS[rolActual] || rolActual}</Tag>
            <SwapOutlined />
            <Tag color={ROL_COLORS[rolNuevo]}>{ROL_LABELS[rolNuevo] || rolNuevo}</Tag>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {rolNuevo === "admin"
              ? "Como administrador va a tener acceso a todos los módulos y se le quitan los permisos individuales."
              : "Se le asignan los permisos predeterminados del rol. Podés ajustarlos después desde “Permisos”."}
          </Text>
        </Space>
      ),
      okText: trasAltaDuplicada ? "Sí, cambiar el rol" : "Cambiar rol",
      cancelText: "Cancelar",
      onOk: async () => {
        try {
          await cambiarRol.mutateAsync({ id, rol: rolNuevo });
          message.success(`Rol actualizado a ${ROL_LABELS[rolNuevo] || rolNuevo}`);
          setModalCrear(false);
          formCrear.resetFields();
          setPermisosTemp({});
        } catch (err) {
          message.error(err.message);
          return Promise.reject(err);
        }
      },
    });
  };

  /**
   * Alta de usuario. El backend nunca hace un alta silenciosa sobre una
   * cuenta existente: si el email ya está tomado responde 409 sin escribir,
   * e informa qué rol tiene hoy para poder ofrecer el cambio explícito.
   */
  const handleCrear = async (values) => {
    try {
      await crearUsuario.mutateAsync({
        ...values,
        permisos: permisosSeleccionados(),
      });
      message.success("Usuario creado correctamente");
      setModalCrear(false);
      formCrear.resetFields();
      setPermisosTemp({});
    } catch (err) {
      if (err.status === 409 && err.codigo === "EMAIL_EN_USO") {
        const { usuarioId, rolActual, rolSolicitado, puedeCambiarRol } = err.data;

        // Marca el campo para que quede claro que no se creó nada.
        formCrear.setFields([
          {
            name: "email",
            errors: [`Ya existe una cuenta con este email (${ROL_LABELS[rolActual] || rolActual})`],
          },
        ]);

        if (puedeCambiarRol) {
          confirmarCambioRol({
            id: usuarioId,
            email: values.email,
            rolActual,
            rolNuevo: rolSolicitado,
            trasAltaDuplicada: true,
          });
        } else {
          Modal.warning({
            title: "Esta cuenta ya existe",
            content: `Ya existe una cuenta con ${values.email} y ya tiene el rol ${ROL_LABELS[rolActual] || rolActual}. No se aplicó ningún cambio.`,
            okText: "Entendido",
          });
        }
        return;
      }
      message.error(err.message);
    }
  };

  const handleRolChange = (rol) => {
    setPermisosTemp({ ...(PERMISOS_DEFECTO_ROL[rol] || {}) });
  };

  const abrirModalPermisos = (usuario) => {
    setUsuarioSeleccionado(usuario);
    const mapa = {};
    (usuario.permisos || []).forEach((clave) => { mapa[clave] = true; });
    setPermisosTemp(mapa);
    setModalPermisos(true);
  };

  const handleGuardarPermisos = async () => {
    if (!usuarioSeleccionado) return;
    try {
      await actualizarPermisos.mutateAsync({
        id: usuarioSeleccionado.id,
        permisos: permisosSeleccionados(),
      });
      message.success("Permisos actualizados correctamente");
      setModalPermisos(false);
      setUsuarioSeleccionado(null);
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleEliminar = async (id) => {
    try {
      await eliminarUsuario.mutateAsync(id);
      message.success("Usuario eliminado");
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleRestaurar = async (registro) => {
    try {
      await restaurarPermisos.mutateAsync({ id: registro.id });
      message.success("Permisos restaurados según el rol");
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (email) => (
        <Space>
          <MailOutlined style={{ color: "var(--color-text-tertiary)" }} />
          <Text>{email}</Text>
        </Space>
      ),
    },
    {
      title: "Rol",
      dataIndex: "rol",
      key: "rol",
      width: 170,
      render: (rol) => (
        <Tag color={ROL_COLORS[rol] || "default"}>{ROL_LABELS[rol] || rol}</Tag>
      ),
    },
    {
      title: "Permisos activos",
      dataIndex: "permisos",
      key: "permisos",
      render: (permisos, record) => {
        if (record.rol === "admin") {
          // Un admin con permisos propios quedó inconsistente por el bug anterior.
          const huerfanos = (permisos || []).length;
          return huerfanos > 0 ? (
            <Tooltip title="Quedaron permisos individuales de un rol anterior. Usá “Restaurar” para limpiarlos.">
              <Badge status="warning" text={`Todos + ${huerfanos} sin efecto`} />
            </Tooltip>
          ) : (
            <Badge status="success" text="Todos los permisos" />
          );
        }
        const count = (permisos || []).length;
        return (
          <Text type={count === 0 ? "danger" : "secondary"}>
            {count === 0 ? "Sin permisos" : `${count} permiso${count !== 1 ? "s" : ""}`}
          </Text>
        );
      },
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 330,
      render: (_, record) => {
        const esSelf = record.id === currentUser?.id;
        const esAdmin = record.rol === "admin";
        const rolDestino = esAdmin ? "staff" : "admin";
        const permisosHuerfanos = esAdmin && (record.permisos || []).length > 0;
        const sinPermisos = !esAdmin && (record.permisos || []).length === 0;

        return (
          <Space wrap>
            {!esAdmin && (
              <Tooltip title="Editar permisos">
                <Button size="small" icon={<KeyOutlined />} onClick={() => abrirModalPermisos(record)}>
                  Permisos
                </Button>
              </Tooltip>
            )}

            {!esSelf && (
              <Tooltip title={`Cambiar a ${ROL_LABELS[rolDestino]}`}>
                <Button
                  size="small"
                  icon={<SwapOutlined />}
                  loading={cambiarRol.isPending}
                  onClick={() =>
                    confirmarCambioRol({
                      id: record.id,
                      email: record.email,
                      rolActual: record.rol,
                      rolNuevo: rolDestino,
                    })
                  }
                >
                  Cambiar rol
                </Button>
              </Tooltip>
            )}

            {(permisosHuerfanos || sinPermisos) && (
              <Tooltip title="Reasignar los permisos que corresponden al rol">
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={restaurarPermisos.isPending}
                  onClick={() => handleRestaurar(record)}
                >
                  Restaurar
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

  /** Marca o desmarca de una todos los permisos de un módulo. */
  const setModulo = (perms, valor) =>
    setPermisosTemp((prev) => {
      const next = { ...prev };
      perms.forEach((p) => { next[p.clave] = valor; });
      return next;
    });

  const renderPermisosPanel = (rolActual) => {
    const esAdmin = rolActual === "admin";

    return (
      <div className={permisosStyles.grupos}>
        {permisosPorModulo.map(([modulo, perms]) => {
          const activos = perms.filter((p) => esAdmin || !!permisosTemp[p.clave]).length;
          const todos = activos === perms.length;

          return (
            <section key={modulo} className={permisosStyles.grupo}>
              <header className={permisosStyles.grupoHeader}>
                <Space size={8} align="center">
                  <Tag color={MODULO_COLORS[modulo] || "default"} className={permisosStyles.moduloTag}>
                    {MODULO_LABELS[modulo] || modulo}
                  </Tag>
                  <Text type="secondary" className={permisosStyles.contador}>
                    {activos} de {perms.length}
                  </Text>
                </Space>
                {!esAdmin && (
                  <Button
                    type="link"
                    size="small"
                    className={permisosStyles.accionGrupo}
                    onClick={() => setModulo(perms, !todos)}
                  >
                    {todos ? "Quitar todos" : "Activar todos"}
                  </Button>
                )}
              </header>

              <div className={permisosStyles.lista}>
                {perms.map((p) => {
                  const activo = esAdmin || !!permisosTemp[p.clave];
                  const sensible = PERMISOS_SENSIBLES.has(p.clave);
                  return (
                    <label
                      key={p.clave}
                      className={[
                        permisosStyles.item,
                        activo ? permisosStyles.itemActivo : "",
                        esAdmin ? permisosStyles.itemBloqueado : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <span className={permisosStyles.itemTexto}>
                        <span className={permisosStyles.itemTitulo}>{p.descripcion}</span>
                        <span className={permisosStyles.itemClave}>{p.clave}</span>
                      </span>
                      <Space size={6} align="center">
                        {sensible && (
                          <Tooltip title="Permiso sensible: otorgalo solo a cuentas de confianza.">
                            <WarningOutlined className={permisosStyles.iconoSensible} />
                          </Tooltip>
                        )}
                        <Switch
                          size="small"
                          checked={activo}
                          disabled={esAdmin}
                          onChange={(checked) =>
                            setPermisosTemp((prev) => ({ ...prev, [p.clave]: checked }))
                          }
                        />
                      </Space>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
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
        <Select
          allowClear
          placeholder="Filtrar por rol"
          style={{ width: 200 }}
          value={filtroRol}
          onChange={setFiltroRol}
          options={[
            { value: "admin", label: "Administrador" },
            { value: "staff", label: "Staff" },
            { value: "empleado", label: "Empleado (legacy)" },
          ]}
        />
        <Text type="secondary">
          {usuariosVisibles.length} usuario{usuariosVisibles.length !== 1 ? "s" : ""}
        </Text>
      </Space>

      {usuariosQuery.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="No se pudieron cargar los usuarios"
          description={usuariosQuery.error?.message}
        />
      )}

      <Table
        dataSource={usuariosVisibles}
        columns={columns}
        rowKey="id"
        loading={usuariosQuery.isLoading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: "No hay usuarios staff registrados" }}
      />

      {/* ── Modal: Crear usuario ── */}
      <Modal
        title={<Space><PlusOutlined /> Nuevo usuario staff</Space>}
        open={modalCrear}
        onCancel={() => {
          setModalCrear(false);
          setPermisosTemp({});
          formCrear.resetFields();
        }}
        onOk={() => formCrear.submit()}
        okText="Crear usuario"
        cancelText="Cancelar"
        confirmLoading={crearUsuario.isPending}
        width={720}
        destroyOnClose
      >
        <Form form={formCrear} layout="vertical" onFinish={handleCrear} style={{ marginTop: 16 }}>
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

          <Form.Item name="rol" label="Rol" rules={[{ required: true, message: "Seleccioná un rol" }]}>
            <Select
              placeholder="Seleccioná el rol del usuario"
              onChange={handleRolChange}
              options={[
                { value: "staff", label: "Staff — acceso limitado" },
                { value: "admin", label: "Administrador — acceso completo al sistema" },
              ]}
            />
          </Form.Item>

          <Divider orientation="left" style={{ marginTop: 8 }}>
            <SafetyCertificateOutlined /> Permisos personalizados
          </Divider>

          <Form.Item shouldUpdate={(prev, curr) => prev.rol !== curr.rol} noStyle>
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
              return (
                <div style={{ maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
                  {renderPermisosPanel(rol)}
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal: Editar permisos ── */}
      <Modal
        title={<Space><KeyOutlined /> Permisos — {usuarioSeleccionado?.email}</Space>}
        open={modalPermisos}
        onCancel={() => {
          setModalPermisos(false);
          setUsuarioSeleccionado(null);
        }}
        onOk={handleGuardarPermisos}
        okText="Guardar permisos"
        cancelText="Cancelar"
        confirmLoading={actualizarPermisos.isPending}
        width={720}
        destroyOnClose
      >
        {usuarioSeleccionado && (
          <div style={{ marginTop: 8 }}>
            <div className={permisosStyles.resumen}>
              <Space size={8} wrap>
                <Tag color={ROL_COLORS[usuarioSeleccionado.rol]} style={{ margin: 0 }}>
                  {ROL_LABELS[usuarioSeleccionado.rol] || usuarioSeleccionado.rol}
                </Tag>
                <Text type="secondary">{usuarioSeleccionado.email}</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: "var(--text-xs)" }}>
                {usuarioSeleccionado.rol === "admin"
                  ? "Acceso total al sistema"
                  : `${permisosSeleccionados().length} de ${permisosCatalogo.length} permisos activos`}
              </Text>
            </div>

            {usuarioSeleccionado.rol === "admin" && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="El administrador tiene todos los permisos de forma implícita"
                description="Para limitar el acceso de esta cuenta, cambiale el rol a Staff."
              />
            )}

            <div className={permisosStyles.scroll}>
              {renderPermisosPanel(usuarioSeleccionado.rol)}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function GestionUsuarios() {
  const { token } = useAuth();
  const solicitudes = useSolicitudesEstudiante(token);
  const pendientes = solicitudes.data?.total ?? 0;

  const items = [
    {
      key: "staff",
      label: (
        <Space size={6}>
          <TeamOutlined />
          Staff del panel
        </Space>
      ),
      children: <PanelStaff />,
    },
    {
      key: "finales",
      label: (
        <Space size={6}>
          <UserSwitchOutlined />
          Usuarios finales
        </Space>
      ),
      children: <GestionUsuariosFinales />,
    },
    {
      key: "solicitudes",
      label: (
        <Space size={6}>
          <SolutionOutlined />
          Solicitudes de estudiante
          {pendientes > 0 && <Badge count={pendientes} />}
        </Space>
      ),
      children: <SolicitudesEstudiante />,
    },
  ];

  return (
    <div className={adminLayout.layout}>
      <Header />
      <div className={adminLayout.contentNarrow}>
        <AdminPageHeader
          eyebrow="Administración"
          icon={<TeamOutlined />}
          title="Gestión de Usuarios"
          description="Administrá el staff del panel, las cuentas de usuarios finales y las solicitudes de verificación de estudiante."
        />

        <Card
          bordered={false}
          style={{
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--color-neutral-300)",
          }}
        >
          <Tabs defaultActiveKey="staff" items={items} />
        </Card>
      </div>
    </div>
  );
}
