import React, { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import "../../styles/global.css";
import styles from "../../styles/public/perfil.module.css";
import {
  Card,
  Form,
  Input,
  Button,
  Table,
  Tag,
  message,
  Spin,
  Empty,
} from "antd";
import ReservaModificacionAviso from "../../components/ReservaModificacionAviso.jsx";
import {
  UserOutlined,
  MailOutlined,
  IdcardOutlined,
  PhoneOutlined,
  EditOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  LockOutlined,
} from "@ant-design/icons";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function Perfil() {
  const { user, token, isAuthenticated, loading: authLoading, openAuthModal, authFetch, cambiarPassword } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [reservas, setReservas] = useState([]);
  const [loadingReservas, setLoadingReservas] = useState(true);
  const [mpLoadingId, setMpLoadingId] = useState(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const loadReservas = useCallback(async () => {
    if (!token) return;
    setLoadingReservas(true);
    try {
      const r = await authFetch(`${API_URL}/api/reservas/mis-reservas?limit=100&offset=0`);
      const data = await r.json();
      const items = Array.isArray(data) ? data : data.items ?? [];
      setReservas(Array.isArray(items) ? items : []);
    } catch {
      setReservas([]);
    } finally {
      setLoadingReservas(false);
    }
  }, [token, authFetch]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) openAuthModal("login");
  }, [authLoading, isAuthenticated, openAuthModal]);

  useEffect(() => {
    loadReservas();
  }, [loadReservas]);

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
      });
    }
  }, [user, form]);

  const onSave = async (values) => {
    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/cliente/perfil`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Error al actualizar");
      }
      message.success("Perfil actualizado");
      setEditing(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onPasswordChange = async (values) => {
    if (values.passwordNueva !== values.passwordNueva2) {
      message.error("Las contraseñas nuevas no coinciden");
      return;
    }
    setPasswordSaving(true);
    try {
      await cambiarPassword(values.passwordActual, values.passwordNueva);
      message.success("Contraseña actualizada");
      passwordForm.resetFields();
    } catch (err) {
      message.error(err.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handlePagarMP = async (idReserva) => {
    setMpLoadingId(idReserva);
    try {
      const res = await authFetch(`${API_URL}/api/pagos/crear-preferencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idReserva }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.message || "Error al crear preferencia de pago");
        return;
      }
      window.location.href = data.sandboxInitPoint || data.initPoint;
    } catch {
      message.error("Error al conectar con Mercado Pago");
    } finally {
      setMpLoadingId(null);
    }
  };

  const reservaCols = [
    {
      title: "Fecha",
      key: "fecha",
      width: 108,
      render: (_, r) => (
        <span>
          <CalendarOutlined style={{ marginRight: 4 }} />
          {r.DiaReserva ? dayjs(r.DiaReserva).format("DD/MM/YYYY") : "-"}
        </span>
      ),
      sorter: (a, b) => new Date(a.DiaReserva || 0) - new Date(b.DiaReserva || 0),
    },
    {
      title: "Espacio",
      key: "espacio",
      ellipsis: true,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.espacio_nombre || "-"}</div>
          <div className={styles.recursoSub}>{r.recurso_nombre || "-"}</div>
        </div>
      ),
    },
    {
      title: "Horario",
      key: "horario",
      width: 120,
      render: (_, r) => {
        if (r.TipoReserva === "semanal") return <Tag color="blue">Semanal</Tag>;
        if (r.TipoReserva === "mensual") return <Tag color="purple">Mensual</Tag>;
        return r.HorarioReserva ? `${r.HorarioReserva} - ${r.HorarioFin || ""}` : "-";
      },
    },
    {
      title: "Estado del turno",
      key: "estadoTurno",
      width: 130,
      responsive: ["md"],
      render: (_, r) => {
        const estado = r.Estado || "activa";
        const colors = { activa: "green", completada: "blue", no_asistio: "red", cancelada: "default" };
        const labels = {
          activa: "Activa",
          completada: "Cerrada — asistió",
          no_asistio: "No asistió",
          cancelada: "Cancelada",
        };
        return <Tag color={colors[estado] || "default"}>{labels[estado] || estado}</Tag>;
      },
    },
    {
      title: "Estado del cobro",
      key: "pago",
      width: 120,
      render: (_, r) => {
        if (!r.EstadoPago) return <Tag>Sin pago</Tag>;
        if (r.EstadoPago === "Pagado") return <Tag icon={<CheckCircleOutlined />} color="success">Pagado</Tag>;
        if (r.EstadoPago === "Rechazado") return <Tag color="error">Rechazado</Tag>;
        return <Tag icon={<ClockCircleOutlined />} color="warning">Pendiente</Tag>;
      },
    },
    {
      title: "Pago",
      key: "pagoAccion",
      width: 118,
      fixed: "right",
      render: (_, r) => {
        const puedePagar =
          r.EstadoPago !== "Pagado" && r.Estado !== "cancelada" && (parseFloat(r.Monto) || 0) > 0;
        if (!puedePagar) return <span className={styles.cellMuted}>—</span>;
        return (
          <Button
            size="small"
            type="primary"
            icon={<CreditCardOutlined />}
            loading={mpLoadingId === r.idReserva}
            onClick={() => handlePagarMP(r.idReserva)}
            style={{ background: "#009ee3", borderColor: "#009ee3" }}
          >
            Pagar
          </Button>
        );
      },
    },
  ];

  if (authLoading) {
    return (
      <div>
        <Header />
        <main className={styles.wrapper}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div>
        <Header />
        <main className={styles.wrapper}>
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <p>Inicia sesion para ver tu perfil.</p>
            <Button type="primary" onClick={() => openAuthModal("login")}>Iniciar sesion</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div>
      <Header />
      <main className={styles.wrapper}>
        <h1 className={styles.pageTitle}>Mi Perfil</h1>

        <ReservaModificacionAviso style={{ marginBottom: 20 }} />

        <div className={styles.grid}>
          <div className={styles.leftCol}>
          <Card className={styles.profileCard}>
            <div className={styles.avatarSection}>
              <div className={styles.avatar}>
                <UserOutlined />
              </div>
              <h2 className={styles.userName}>{user?.nombre} {user?.apellido}</h2>
              <span className={styles.userEmail}><MailOutlined /> {user?.email}</span>
            </div>

            {!editing ? (
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}><IdcardOutlined /> DNI</span>
                  <span className={styles.infoValue}>{user?.dni || "-"}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}><PhoneOutlined /> Telefono</span>
                  <span className={styles.infoValue}>{user?.telefono || "-"}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}><MailOutlined /> Email</span>
                  <span className={styles.infoValue}>{user?.email}</span>
                </div>
                <Button
                  icon={<EditOutlined />}
                  className={styles.editBtn}
                  onClick={() => setEditing(true)}
                >
                  Editar perfil
                </Button>
              </div>
            ) : (
              <Form form={form} layout="vertical" onFinish={onSave} className={styles.editForm}>
                <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: "Requerido" }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="apellido" label="Apellido" rules={[{ required: true, message: "Requerido" }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="telefono" label="Telefono">
                  <Input />
                </Form.Item>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button type="primary" htmlType="submit" loading={saving} style={{ background: "#34c08f", borderColor: "#34c08f" }}>
                    Guardar
                  </Button>
                  <Button onClick={() => setEditing(false)}>Cancelar</Button>
                </div>
              </Form>
            )}
          </Card>

          {user?.tiene_password === true && (
            <Card
              className={styles.profileCard}
              title={
                <span>
                  <LockOutlined style={{ marginRight: 8 }} />
                  Seguridad
                </span>
              }
            >
              <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                Cambiá tu contraseña ingresando la actual y una nueva (mínimo 8 caracteres).
              </p>
              <Form form={passwordForm} layout="vertical" onFinish={onPasswordChange}>
                <Form.Item
                  name="passwordActual"
                  label="Contraseña actual"
                  rules={[{ required: true, message: "Requerido" }]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  name="passwordNueva"
                  label="Nueva contraseña"
                  rules={[{ required: true, min: 8, message: "Mínimo 8 caracteres" }]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  name="passwordNueva2"
                  label="Confirmar nueva contraseña"
                  rules={[{ required: true, message: "Confirmá la contraseña" }]}
                >
                  <Input.Password />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={passwordSaving} style={{ background: "#34c08f", borderColor: "#34c08f" }}>
                  Actualizar contraseña
                </Button>
              </Form>
            </Card>
          )}
          {user?.tiene_password === false && (
            <Card className={styles.profileCard} size="small">
              <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
                <LockOutlined style={{ marginRight: 6 }} />
                Tu cuenta usa inicio de sesión con Google. No hay contraseña local para cambiar desde aquí.
              </p>
            </Card>
          )}
          </div>

          <Card className={`${styles.reservasCard} ${styles.reservasCardTable}`} title="Mis Reservas">
            {loadingReservas ? (
              <div style={{ textAlign: "center", padding: "2rem" }}><Spin /></div>
            ) : reservas.length === 0 ? (
              <Empty description="No tenes reservas aun" />
            ) : (
              <div className={styles.tableScrollWrap}>
                <Table
                  className={styles.reservasTable}
                  columns={reservaCols}
                  dataSource={reservas.map((r) => ({ ...r, key: r.idReserva }))}
                  pagination={{ pageSize: 5, size: "small", responsive: true }}
                  size="small"
                  scroll={{ x: "max-content" }}
                  tableLayout="fixed"
                />
              </div>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
