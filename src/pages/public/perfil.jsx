import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Tooltip,
  Upload,
  Typography,
} from "antd";

const { Text } = Typography;
import ReservaModificacionAviso from "../../components/ReservaModificacionAviso.jsx";
import {
  RESERVA_ESTADO_LABEL,
  RESERVA_ESTADO_COLOR,
  PAGO_ESTADO_LABEL,
  PAGO_ESTADO_COLOR,
} from "../../utils/reservaEstados.js";
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
  ReadOutlined,
  UploadOutlined,
} from "@ant-design/icons";

const VERIFICACION_ESTUDIANTE_LABEL = {
  no_solicitado: "Sin solicitar",
  pendiente: "Pendiente de revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};
const VERIFICACION_ESTUDIANTE_COLOR = {
  no_solicitado: "default",
  pendiente: "gold",
  aprobado: "green",
  rechazado: "red",
};

const COMPROBANTE_MAX_BYTES = 1.4 * 1024 * 1024;

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const [estudianteForm] = Form.useForm();
  const [estadoEstudiante, setEstadoEstudiante] = useState(null);
  const [loadingEstudiante, setLoadingEstudiante] = useState(true);
  const [enviandoEstudiante, setEnviandoEstudiante] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState(null);

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

  const loadEstadoEstudiante = useCallback(async () => {
    if (!token) return;
    setLoadingEstudiante(true);
    try {
      const r = await authFetch(`${API_URL}/api/auth/cliente/estado-estudiante`);
      const texto = await r.text();
      const data = texto ? JSON.parse(texto) : null;
      setEstadoEstudiante(r.ok ? data : null);
    } catch {
      setEstadoEstudiante(null);
    } finally {
      setLoadingEstudiante(false);
    }
  }, [token, authFetch]);

  useEffect(() => {
    loadEstadoEstudiante();
  }, [loadEstadoEstudiante]);

  const onSolicitarEstudiante = async (values) => {
    setEnviandoEstudiante(true);
    try {
      let comprobante;
      if (comprobanteFile) {
        comprobante = await archivoABase64(comprobanteFile);
      }
      const res = await authFetch(`${API_URL}/api/auth/cliente/solicitar-estudiante`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institucion: values.institucion, comprobante }),
      });
      // 413 y errores de proxy vuelven en HTML, no JSON.
      const texto = await res.text();
      let data = null;
      try { data = texto ? JSON.parse(texto) : null; } catch { data = null; }
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("La imagen es demasiado grande. Probá con una más liviana.");
        }
        throw new Error(data?.message || "Error al enviar la solicitud");
      }
      message.success("Solicitud enviada. Un administrador la va a revisar.");
      estudianteForm.resetFields();
      setComprobanteFile(null);
      await loadEstadoEstudiante();
    } catch (err) {
      message.error(err.message);
    } finally {
      setEnviandoEstudiante(false);
    }
  };

  const reservasVista = useMemo(() => {
    const list = reservas || [];
    const bySerie = new Map();
    const byGrupo = new Map();
    for (const r of list) {
      if (r.idSerie) {
        if (!bySerie.has(r.idSerie)) bySerie.set(r.idSerie, []);
        bySerie.get(r.idSerie).push(r);
      }
      if (r.idReservaGrupo) {
        if (!byGrupo.has(r.idReservaGrupo)) byGrupo.set(r.idReservaGrupo, []);
        byGrupo.get(r.idReservaGrupo).push(r);
      }
    }
    const doneS = new Set();
    const doneG = new Set();
    const out = [];
    for (const r of list) {
      if (r.idSerie) {
        if (doneS.has(r.idSerie)) continue;
        doneS.add(r.idSerie);
        const grp = bySerie.get(r.idSerie) || [];
        const sorted = [...grp].sort((a, b) => String(a.DiaReserva).localeCompare(String(b.DiaReserva)));
        const first = sorted[0];
        const monto = sorted.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
        const recs = [...new Set(sorted.map((x) => x.recurso_nombre).filter(Boolean))];
        const pairsMap = new Map();
        for (const x of sorted) {
          if (!x.recurso_nombre) continue;
          if (!pairsMap.has(x.recurso_nombre)) pairsMap.set(x.recurso_nombre, x.espacio_nombre || null);
        }
        const recursos_detalle = Array.from(pairsMap, ([recurso, espacio]) => ({ recurso, espacio }));
        out.push({
          ...first,
          key: `serie-${r.idSerie}`,
          idReserva: Math.min(...sorted.map((x) => x.idReserva)),
          Monto: monto,
          recurso_nombre: recs.join(", "),
          recursos_detalle,
        });
        continue;
      }
      if (r.idReservaGrupo) {
        if (doneG.has(r.idReservaGrupo)) continue;
        doneG.add(r.idReservaGrupo);
        const grp = byGrupo.get(r.idReservaGrupo) || [];
        const sorted = [...grp].sort((a, b) => (a.idReserva || 0) - (b.idReserva || 0));
        const first = sorted[0];
        const monto = sorted.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
        const recursos_detalle = sorted
          .filter((x) => x.recurso_nombre)
          .map((x) => ({ recurso: x.recurso_nombre, espacio: x.espacio_nombre || null }));
        out.push({
          ...first,
          key: `grupo-${r.idReservaGrupo}`,
          idReserva: r.idReservaGrupo,
          Monto: monto,
          recurso_nombre: sorted.map((x) => x.recurso_nombre).filter(Boolean).join(", "),
          recursos_detalle,
        });
        continue;
      }
      out.push({
        ...r,
        key: r.idReserva,
        recursos_detalle: r.recurso_nombre
          ? [{ recurso: r.recurso_nombre, espacio: r.espacio_nombre || null }]
          : [],
      });
    }
    return out;
  }, [reservas]);

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

  const handlePagarMP = async (r) => {
    const loadingKey = r.idSerie ? `serie-${r.idSerie}` : r.idReservaGrupo ? `grupo-${r.idReservaGrupo}` : r.idReserva;
    setMpLoadingId(loadingKey);
    try {
      const body = r.idSerie
        ? { idSerie: r.idSerie }
        : r.idReservaGrupo
          ? { idReservaGrupo: r.idReservaGrupo }
          : { idReserva: r.idReserva };
      const res = await authFetch(`${API_URL}/api/pagos/crear-preferencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      fixed: "left",
      render: (_, r) => (
        <span>
          <CalendarOutlined style={{ marginRight: 4 }} />
          {r.DiaReserva ? dayjs(r.DiaReserva).format("DD/MM/YYYY") : "-"}
        </span>
      ),
      sorter: (a, b) => new Date(a.DiaReserva || 0) - new Date(b.DiaReserva || 0),
    },
    {
      title: "Pago",
      key: "pagoAccion",
      width: 118,
      fixed: "left",
      render: (_, r) => {
        const puedePagar =
          r.EstadoPago !== "Pagado" && r.Estado !== "cancelada" && (parseFloat(r.Monto) || 0) > 0;
        if (!puedePagar) return <span className={styles.cellMuted}>—</span>;
        const loadKey = r.idSerie ? `serie-${r.idSerie}` : r.idReservaGrupo ? `grupo-${r.idReservaGrupo}` : r.idReserva;
        return (
          <Button
            size="small"
            type="primary"
            icon={<CreditCardOutlined />}
            loading={mpLoadingId === loadKey}
            onClick={() => handlePagarMP(r)}
            style={{ background: "#009ee3", borderColor: "#009ee3" }}
          >
            Pagar
          </Button>
        );
      },
    },
    {
      title: "Recurso",
      key: "espacio",
      ellipsis: true,
      render: (_, r) => {
        const detalle = Array.isArray(r.recursos_detalle) && r.recursos_detalle.length
          ? r.recursos_detalle
          : r.recurso_nombre
            ? [{ recurso: r.recurso_nombre, espacio: r.espacio_nombre || null }]
            : [];
        const tooltipContent = detalle.length ? (
          <div className={styles.recursoTooltip}>
            {detalle.map((d, i) => (
              <div key={`${d.recurso}-${i}`} className={styles.recursoTooltipRow}>
                <strong>{d.recurso}</strong>
                <span>{d.espacio || "Sin espacio"}</span>
              </div>
            ))}
          </div>
        ) : null;
        const label = detalle.length
          ? detalle.map((d) => d.recurso).join(", ")
          : r.recurso_nombre || "-";
        return (
          <Tooltip title={tooltipContent} placement="top">
            <span className={styles.recursoCell}>{label}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Horario",
      key: "horario",
      width: 120,
      render: (_, r) => {
        if (r.TipoReserva === "semanal") return <Tag color="blue">Semanal</Tag>;
        if (r.TipoReserva === "mensual") return <Tag color="purple">Mensual pack</Tag>;
        if (r.idSerie) return <Tag color="cyan">Fijo 4 sem.</Tag>;
        if (r.idReservaGrupo) return <Tag color="geekblue">Varios lugares</Tag>;
        return r.HorarioReserva ? `${r.HorarioReserva} - ${r.HorarioFin || ""}` : "-";
      },
    },
    {
      title: "Estado del turno",
      key: "estadoTurno",
      width: 130,
      responsive: ["md"],
      render: (_, r) => {
        const estado = (r.Estado || "activa").toLowerCase();
        return (
          <Tag color={RESERVA_ESTADO_COLOR[estado] || "default"}>
            {RESERVA_ESTADO_LABEL[estado] || estado}
          </Tag>
        );
      },
    },
    {
      title: "Estado del pago",
      key: "pago",
      width: 130,
      render: (_, r) => {
        if (!r.EstadoPago) return <Tag>Sin pago</Tag>;
        const e = String(r.EstadoPago).trim();
        const color = PAGO_ESTADO_COLOR[e] || "default";
        const icon =
          e === "Pagado" ? <CheckCircleOutlined /> :
          e === "Pendiente" ? <ClockCircleOutlined /> : null;
        return <Tag icon={icon} color={color}>{PAGO_ESTADO_LABEL[e] || e}</Tag>;
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

          <Card
            className={styles.profileCard}
            title={
              <span>
                <ReadOutlined style={{ marginRight: 8 }} />
                Verificación de Estudiante
              </span>
            }
          >
            {loadingEstudiante ? (
              <div style={{ textAlign: "center", padding: "1rem" }}><Spin /></div>
            ) : !estadoEstudiante ? (
              <Text type="secondary">No se pudo cargar el estado de la solicitud.</Text>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Tag color={VERIFICACION_ESTUDIANTE_COLOR[estadoEstudiante.estado_verificacion_estudiante] || "default"}>
                    {VERIFICACION_ESTUDIANTE_LABEL[estadoEstudiante.estado_verificacion_estudiante] || estadoEstudiante.estado_verificacion_estudiante}
                  </Tag>
                  {estadoEstudiante.rol === "estudiante" && (
                    <Tag color="purple" style={{ marginLeft: 8 }}>Rol actual: Estudiante</Tag>
                  )}
                </div>

                {estadoEstudiante.estado_verificacion_estudiante === "rechazado" && estadoEstudiante.motivo_rechazo_estudiante && (
                  <p style={{ fontSize: 13, color: "#cf1322", marginBottom: 16 }}>
                    Motivo del rechazo: {estadoEstudiante.motivo_rechazo_estudiante}
                  </p>
                )}

                {estadoEstudiante.estado_verificacion_estudiante === "pendiente" && (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 0 }}>
                    Tu solicitud está en revisión. Institución informada: {estadoEstudiante.institucion_estudiante || "—"}.
                  </p>
                )}

                {estadoEstudiante.estado_verificacion_estudiante === "aprobado" && (
                  <p style={{ fontSize: 13, color: "#389e0d", marginBottom: 0 }}>
                    Ya tenés el rol Estudiante y accedés a los beneficios diferenciados.
                  </p>
                )}

                {estadoEstudiante.puede_solicitar && (
                  <Form
                    form={estudianteForm}
                    layout="vertical"
                    onFinish={onSolicitarEstudiante}
                    style={{ marginTop: 16 }}
                  >
                    <Form.Item
                      name="institucion"
                      label="Institución educativa"
                      rules={[{ required: true, message: "Requerido" }]}
                    >
                      <Input placeholder="Ej: Universidad de Buenos Aires" />
                    </Form.Item>
                    <Form.Item
                      label="Certificado de alumno regular"
                      required
                      tooltip="Imagen (JPG o PNG), hasta 1.4 MB"
                    >
                      <Upload
                        accept="image/png,image/jpeg"
                        maxCount={1}
                        beforeUpload={(file) => {
                          const esImagen = file.type === "image/png" || file.type === "image/jpeg";
                          if (!esImagen) {
                            message.error("Solo se aceptan imágenes JPG o PNG");
                            return Upload.LIST_IGNORE;
                          }
                          if (file.size > COMPROBANTE_MAX_BYTES) {
                            message.error("La imagen no puede superar 1.4 MB");
                            return Upload.LIST_IGNORE;
                          }
                          setComprobanteFile(file);
                          return false;
                        }}
                        onRemove={() => setComprobanteFile(null)}
                      >
                        <Button icon={<UploadOutlined />}>Elegir imagen</Button>
                      </Upload>
                    </Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={enviandoEstudiante}
                      disabled={!comprobanteFile}
                      style={{ background: "#34c08f", borderColor: "#34c08f" }}
                    >
                      Enviar solicitud
                    </Button>
                  </Form>
                )}
              </>
            )}
          </Card>
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
                  dataSource={reservasVista}
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
