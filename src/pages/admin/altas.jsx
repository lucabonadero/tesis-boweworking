import "../../styles/global.css";
import styles from "../../styles/admin/altas.module.css";
import Header from "../../components/header";
import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Layout, Card, Button, Input, Table, Tag, message, Spin, Empty, Badge, Tooltip, Popconfirm } from "antd";
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { adminFetch } from "../../utils/adminApi";
import { validarRecepcionNoAnticipadaLocal } from "../../utils/coworkingHours.js";
import { notifyReservasChanged } from "../../utils/boweSync.js";
import {
  RESERVA_ESTADO_LABEL,
  RESERVA_ESTADO_COLOR,
  estadoReservaEfectivo,
} from "../../utils/reservaEstados.js";

const { Content } = Layout;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function mensajeRecepcionAnticipada(r) {
  const tipo = r.TipoReserva || "turno";
  if (tipo !== "turno" || !r.HorarioReserva) return null;
  const dia = dayjs(r.DiaReserva).format("YYYY-MM-DD");
  return validarRecepcionNoAnticipadaLocal(dia, String(r.HorarioReserva).slice(0, 5));
}

export default function AltaClientes() {
  const queryClient = useQueryClient();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [procesando, setProcesando] = useState(null);
  const [, setTick] = useState(0);

  const hoy = dayjs().format("YYYY-MM-DD");

  // Tick local cada 30s para que las reservas en_curso pasen visualmente a
  // "Asistió / Finalizada" cuando cruzan HorarioFin, aún antes de que el sweep
  // del backend persista el cambio.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const fetchReservas = async () => {
    try {
      const params = new URLSearchParams({
        afectaDia: dayjs().format("YYYY-MM-DD"),
        limit: "500",
        offset: "0",
      });
      const res = await adminFetch(`${API_URL}/api/reservas?${params}`);
      const data = await res.json();
      const items = data.items ?? data;
      setReservas(Array.isArray(items) ? items : []);
    } catch {
      message.error("Error al cargar reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservas();
  }, []);

  const pendientes = useMemo(() => {
    return reservas
      .filter((r) => {
        const dia = r.DiaReserva ? dayjs(r.DiaReserva).format("YYYY-MM-DD") : null;
        const estado = r.Estado || "activa";
        return dia === hoy && estado === "activa";
      })
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (r.Nombre || "").toLowerCase().includes(q) ||
          (r.DNI || "").includes(q) ||
          (r.espacio_nombre || "").toLowerCase().includes(q)
        );
      });
  }, [reservas, hoy, search]);

  const procesadas = useMemo(() => {
    return reservas.filter((r) => {
      const dia = r.DiaReserva ? dayjs(r.DiaReserva).format("YYYY-MM-DD") : null;
      const estado = r.Estado || "activa";
      return dia === hoy && (estado === "en_curso" || estado === "completada" || estado === "no_asistio");
    });
  }, [reservas, hoy]);

  const marcarEstado = async (idReserva, estado, esFinalizacionManual = false) => {
    setProcesando(idReserva);
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${idReserva}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, esFinalizacionManual }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Error al actualizar estado");
      }

      // El backend devuelve el estado que realmente guardó.
      const estadoPersistido = data.estado || estado;

      setReservas((prev) =>
        prev.map((r) => r.idReserva === idReserva ? { ...r, Estado: estadoPersistido } : r)
      );
      void fetchReservas();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();

      if (estado === "no_asistio") {
        message.success("No asistencia registrada");
      } else if (esFinalizacionManual || estadoPersistido === "completada") {
        message.success("Turno finalizado");
      } else if (estadoPersistido === "en_curso") {
        message.success("Cliente recepcionado — turno en curso");
      } else {
        message.success("Asistencia registrada");
      }
    } catch (e) {
      message.error(e.message || "Error al actualizar estado");
    } finally {
      setProcesando(null);
    }
  };

  const pendienteCols = [
    {
      title: "Cliente",
      key: "cliente",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#222" }}>
            <UserOutlined style={{ marginRight: 6 }} />
            {r.Nombre || `${r.cliente_nombre || ""} ${r.cliente_apellido || ""}`}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>DNI: {r.DNI || "-"}</div>
        </div>
      ),
    },
    {
      title: "Espacio",
      key: "espacio",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.espacio_nombre || "-"}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{r.recurso_nombre || "-"}</div>
        </div>
      ),
    },
    {
      title: "Horario",
      key: "horario",
      render: (_, r) => (
        <span>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {r.HorarioReserva || "Todo el dia"}
          {r.HorarioFin ? ` - ${r.HorarioFin}` : ""}
        </span>
      ),
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 220,
      render: (_, r) => {
        const bloqueo = mensajeRecepcionAnticipada(r);
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tooltip title={bloqueo || undefined}>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={procesando === r.idReserva}
                disabled={Boolean(bloqueo)}
                onClick={() => marcarEstado(r.idReserva, "completada")}
                style={{ background: "#34c08f", borderColor: "#34c08f" }}
              >
                Asistió
              </Button>
            </Tooltip>
            <Tooltip title={bloqueo || undefined}>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                loading={procesando === r.idReserva}
                disabled={Boolean(bloqueo)}
                onClick={() => marcarEstado(r.idReserva, "no_asistio")}
              >
                No asistió
              </Button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  const procesadaCols = [
    {
      title: "Cliente",
      key: "cliente",
      render: (_, r) => (
        <span style={{ fontWeight: 500 }}>
          {r.Nombre || `${r.cliente_nombre || ""} ${r.cliente_apellido || ""}`}
        </span>
      ),
    },
    { title: "DNI", dataIndex: "DNI", key: "dni" },
    {
      title: "Espacio",
      key: "espacio",
      render: (_, r) => `${r.espacio_nombre || "-"} / ${r.recurso_nombre || "-"}`,
    },
    {
      title: "Horario",
      key: "horario",
      render: (_, r) =>
        r.HorarioReserva
          ? `${r.HorarioReserva}${r.HorarioFin ? ` - ${r.HorarioFin}` : ""}`
          : "Todo el dia",
    },
    {
      title: "Estado del turno",
      key: "estado",
      render: (_, r) => {
        const ef = estadoReservaEfectivo(r);
        const icon =
          ef === "en_curso" ? <PlayCircleOutlined />
          : ef === "completada" ? <CheckCircleOutlined />
          : <CloseCircleOutlined />;
        return (
          <Tag color={RESERVA_ESTADO_COLOR[ef] || "default"} icon={icon}>
            {RESERVA_ESTADO_LABEL[ef] || r.Estado}
          </Tag>
        );
      },
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 120,
      render: (_, r) => {
        const ef = estadoReservaEfectivo(r);
        if (ef !== "en_curso") return null;
        return (
          <Popconfirm
            title="¿Finalizar este turno?"
            description="La reserva pasará a 'Asistió' ahora mismo."
            onConfirm={() => marcarEstado(r.idReserva, "completada", true)}
            okText="Finalizar"
            cancelText="Cancelar"
            okButtonProps={{ danger: false }}
          >
            <Button
              danger
              size="small"
              icon={<StopOutlined />}
              loading={procesando === r.idReserva}
            >
              Finalizar
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header />
        <Content className={styles.contentWrap}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.contentWrap}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>
            <CalendarOutlined /> Control de Asistencia
          </h1>
          <span className={styles.pageDate}>{dayjs().format("dddd DD/MM/YYYY")}</span>
        </div>

        <div className={styles.counters}>
          <Badge count={pendientes.length} showZero overflowCount={99}>
            <Card size="small" className={styles.counterCard}>
              <ClockCircleOutlined style={{ color: "#e67e22", fontSize: 20 }} />
              <span>Por recepcionar</span>
            </Card>
          </Badge>
          <Badge count={procesadas.length} showZero overflowCount={99} color="#34c08f">
            <Card size="small" className={styles.counterCard}>
              <CheckCircleOutlined style={{ color: "#34c08f", fontSize: 20 }} />
              <span>Recepcionadas</span>
            </Card>
          </Badge>
        </div>

        <Card bordered={false} className={styles.mainCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Reservas confirmadas de hoy</h2>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Buscar por nombre, DNI..."
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>

          {pendientes.length === 0 ? (
            <Empty description="No hay reservas por recepcionar hoy" />
          ) : (
            <Table
              columns={pendienteCols}
              dataSource={pendientes.map((r) => ({ ...r, key: r.idReserva }))}
              pagination={false}
              size="middle"
            />
          )}
        </Card>

        {procesadas.length > 0 && (
          <Card bordered={false} className={styles.mainCard} style={{ marginTop: 24 }}>
            <h2 className={styles.sectionTitle}>Recepcionadas hoy</h2>
            <Table
              columns={procesadaCols}
              dataSource={procesadas.map((r) => ({ ...r, key: r.idReserva }))}
              pagination={false}
              size="middle"
            />
          </Card>
        )}
      </Content>
    </Layout>
  );
}
