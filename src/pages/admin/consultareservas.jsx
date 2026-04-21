import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import Header from "../../components/header.jsx";
import styles from "../../styles/admin/consultareservas.module.css";
import "../../styles/global.css";
import { adminFetch } from "../../utils/adminApi";
import {
  validarVentanaOperativaTurno,
  validarDiaReservaNoEnElPasadoLocal,
  validarInicioTurnoNoEnElPasadoLocal,
} from "../../utils/coworkingHours.js";
import { recursoExcluidoFlujoTurnoHora } from "../../utils/reservaRecursoRules.js";
import { notifyReservasChanged } from "../../utils/boweSync.js";

dayjs.extend(isBetween);

import {
  Layout,
  Card,
  Table,
  Input,
  Select,
  Button,
  DatePicker,
  TimePicker,
  Popconfirm,
  Tag,
  message,
  Spin,
  Drawer,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  ExpandAltOutlined,
  AppstoreOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const COWORKING_OPEN = 9;
const COWORKING_CLOSE = 21;

export default function ControlReservas() {
  const queryClient = useQueryClient();
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 10;
  const [occupancyReservas, setOccupancyReservas] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [recursos, setRecursos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filtroEspacio, setFiltroEspacio] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [dateRange, setDateRange] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    DNI: "", Nombre: "", Apellido: "", Email: "",
    idEspacio: null, idRecurso: null,
    fecha: null, hora: null, duracion: 60,
  });

  // Occupancy view state
  const [occupancyDate, setOccupancyDate] = useState(dayjs());
  const [showOccupancy, setShowOccupancy] = useState(false);
  const [occupancyRefresh, setOccupancyRefresh] = useState(0);

  const dateDesde = dateRange?.[0]?.format("YYYY-MM-DD") ?? "";
  const dateHasta = dateRange?.[1]?.format("YYYY-MM-DD") ?? "";

  const {
    data: reservasQueryData,
    isFetching: reservasFetching,
    isError: reservasError,
  } = useQuery({
    queryKey: [
      "staff-reservas",
      tablePage,
      pageSize,
      search,
      filtroEspacio,
      filtroEstado,
      dateDesde,
      dateHasta,
    ],
    queryFn: async () => {
      const limit = pageSize;
      const offset = (tablePage - 1) * limit;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (search.trim()) params.set("q", search.trim());
      if (filtroEspacio !== "Todos") params.set("espacio", filtroEspacio);
      if (filtroEstado !== "Todos") params.set("estado", filtroEstado);
      if (dateDesde && dateHasta) {
        params.set("desde", dateDesde);
        params.set("hasta", dateHasta);
      }
      const res = await adminFetch(`${API_URL}/api/reservas?${params}`);
      if (!res.ok) throw new Error("fetch reservas");
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items ?? [];
      const total = Array.isArray(data) ? items.length : data.total ?? items.length;
      return {
        items: items.map((r) => ({ ...r, key: r.idReserva })),
        total,
      };
    },
    enabled: !loading,
    retry: 2,
  });

  const reservas = reservasQueryData?.items ?? [];
  const reservasTotal = reservasQueryData?.total ?? 0;

  const fetchEspacios = async () => {
    try {
      const res = await fetch(`${API_URL}/api/espacios`);
      setEspacios(await res.json());
    } catch {
      message.error("Error al cargar espacios");
    }
  };

  const fetchRecursos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/recursos`);
      setRecursos(await res.json());
    } catch {
      message.error("Error al cargar recursos");
    }
  };

  useEffect(() => {
    Promise.all([fetchEspacios(), fetchRecursos()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTablePage(1);
  }, [search, filtroEspacio, filtroEstado, dateRange]);

  useEffect(() => {
    if (reservasError) message.error("Error al cargar reservas");
  }, [reservasError]);

  // Grouped resource structure for picker
  const recursoGroups = useMemo(() => {
    if (!formData.idEspacio) return [];
    const raw = recursos.filter((r) => r.idEspacio === formData.idEspacio);
    const delEspacio = raw.filter((r) => {
      const isParent = raw.some((c) => c.idRecursoPadre === r.idRecurso);
      if (isParent) {
        const kids = raw.filter(
          (c) => c.idRecursoPadre === r.idRecurso && !recursoExcluidoFlujoTurnoHora(c, recursos)
        );
        return kids.length > 0;
      }
      return !recursoExcluidoFlujoTurnoHora(r, recursos);
    });
    const grupoIds = new Set(delEspacio.filter((r) => r.idRecursoPadre).map((r) => r.idRecursoPadre));
    const topLevel = delEspacio.filter((r) => !r.idRecursoPadre);
    const dbGroups = topLevel.filter((r) => grupoIds.has(r.idRecurso));
    const standalones = topLevel.filter((r) => !grupoIds.has(r.idRecurso));
    const sections = [];
    const completoItems = standalones.filter((r) => r.esCompleto);
    const individualItems = standalones.filter((r) => !r.esCompleto);
    const prefixes = {};
    individualItems.forEach((r) => {
      const prefix = r.Nombre.replace(/\s*\d+$/, "");
      if (!prefixes[prefix]) prefixes[prefix] = [];
      prefixes[prefix].push(r);
    });
    Object.entries(prefixes).forEach(([label, items]) => {
      if (items.length > 1) sections.push({ type: "visual-group", label: label + "s", items });
      else sections.push({ type: "standalone", item: items[0] });
    });
    dbGroups.forEach((g) => {
      const children = delEspacio.filter(
        (r) => r.idRecursoPadre === g.idRecurso && !recursoExcluidoFlujoTurnoHora(r, recursos)
      );
      if (children.length > 0) sections.push({ type: "db-group", label: g.Nombre, items: children });
    });
    if (completoItems.length > 0) sections.push({ type: "completo", items: completoItems });
    return sections;
  }, [formData.idEspacio, recursos]);

  // Occupancy data
  useEffect(() => {
    if (!showOccupancy || loading) return;
    (async () => {
      try {
        const fecha = occupancyDate.format("YYYY-MM-DD");
        const res = await adminFetch(
          `${API_URL}/api/reservas/ocupacion-dia?fecha=${encodeURIComponent(fecha)}`
        );
        const data = await res.json();
        setOccupancyReservas(data.items ?? []);
      } catch {
        message.error("Error al cargar ocupación del día");
      }
    })();
  }, [showOccupancy, occupancyDate, loading, occupancyRefresh]);

  const occupancyData = useMemo(() => {
    const dayReservas = occupancyReservas;

    const leafRecursos = recursos.filter((r) => {
      return !recursos.some((child) => child.idRecursoPadre === r.idRecurso);
    });

    return leafRecursos.map((rec) => {
      const bookings = dayReservas.filter((rv) => rv.idRecurso === rec.idRecurso);
      const espName = espacios.find((e) => e.Espacio === rec.idEspacio)?.Nombre || "";
      return { ...rec, espacio_nombre: espName, bookings };
    }).filter((r) => r.bookings.length > 0 || !r.esCompleto);
  }, [occupancyReservas, recursos, espacios]);

  // Handlers
  const handleGuardar = async () => {
    if (!formData.fecha || !formData.hora) {
      message.warning("Selecciona fecha y hora de la reserva.");
      return;
    }
    if (!formData.idRecurso) {
      message.warning("Selecciona un recurso a reservar.");
      return;
    }
    try {
      const horaInicio = formData.hora.format("HH:mm");
      const horaFin = formData.hora.clone().add(formData.duracion, "minute").format("HH:mm");
      const ventana = validarVentanaOperativaTurno(horaInicio, horaFin);
      if (ventana) {
        message.warning(ventana);
        return;
      }
      const errDia = validarDiaReservaNoEnElPasadoLocal(formData.fecha);
      if (errDia) {
        message.warning(errDia);
        return;
      }
      const errPasado = validarInicioTurnoNoEnElPasadoLocal(formData.fecha, horaInicio);
      if (errPasado) {
        message.warning(errPasado);
        return;
      }
      const body = {
        DNI: formData.DNI,
        Nombre: `${formData.Nombre} ${formData.Apellido}`.trim(),
        idRecurso: formData.idRecurso,
        HorarioReserva: horaInicio,
        HorarioFin: horaFin,
        DiaReserva: formData.fecha.format("YYYY-MM-DD"),
      };

      if (editingId) {
        const res = await adminFetch(`${API_URL}/api/reservas/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(data.message || "Error al actualizar"); return; }
        message.success("Reserva actualizada");
      } else {
        const creaCli = await adminFetch(`${API_URL}/api/clientes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ DNI: formData.DNI, Nombre: formData.Nombre, Apellido: formData.Apellido, Email: formData.Email }),
        });
        if (!creaCli.ok) {
          const d = await creaCli.json().catch(() => ({}));
          message.error(d.message || "Error al registrar el cliente");
          return;
        }
        const res = await adminFetch(`${API_URL}/api/reservas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(data.message || "Error al crear"); return; }
        message.success("Reserva creada");
      }
      handleLimpiar();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();
      if (showOccupancy) setOccupancyRefresh((x) => x + 1);
    } catch {
      message.error("Error al guardar reserva");
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "Error al eliminar");
        return;
      }
      message.success("Reserva eliminada");
      if (editingId === id) handleLimpiar();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();
      if (showOccupancy) setOccupancyRefresh((x) => x + 1);
    } catch {
      message.error("Error al eliminar");
    }
  };

  const handleModificar = (record) => {
    setEditingId(record.idReserva);
    const [nombre, ...rest] = (record.Nombre || "").split(" ");
    let fecha = record.DiaReserva ? dayjs(record.DiaReserva) : null;
    let hora = null;
    let duracion = 60;
    if (record.HorarioReserva) {
      const [hh, mm] = record.HorarioReserva.split(":");
      hora = dayjs().hour(parseInt(hh) || 0).minute(parseInt(mm) || 0).second(0);
    }
    if (record.HorarioReserva && record.HorarioFin) {
      const [h1, m1] = record.HorarioReserva.split(":").map(Number);
      const [h2, m2] = record.HorarioFin.split(":").map(Number);
      duracion = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (duracion <= 0) duracion = 60;
    }
    const recurso = recursos.find((r) => r.idRecurso === record.idRecurso);
    setFormData({
      DNI: record.DNI || "", Nombre: nombre || "", Apellido: rest.join(" ") || "", Email: "",
      idEspacio: recurso ? recurso.idEspacio : null, idRecurso: record.idRecurso || null,
      fecha, hora, duracion,
    });
    setDrawerOpen(true);
  };

  const handleLimpiar = () => {
    setEditingId(null);
    setFormData({ DNI: "", Nombre: "", Apellido: "", Email: "", idEspacio: null, idRecurso: null, fecha: null, hora: null, duracion: 60 });
    setDrawerOpen(false);
  };

  const tableRangeStart = reservas.length === 0 ? 0 : (tablePage - 1) * pageSize + 1;
  const tableRangeEnd = (tablePage - 1) * pageSize + reservas.length;

  const columns = [
    {
      title: "Cliente", key: "cliente",
      sorter: (a, b) => (a.Nombre || "").localeCompare(b.Nombre || ""),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.Nombre || "-"}</div>
          <div style={{ fontSize: 11, color: "#999" }}>DNI: {r.DNI || "-"}</div>
        </div>
      ),
    },
    {
      title: "Espacio / Recurso", key: "espacio",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.espacio_nombre || "-"}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{r.recurso_nombre || "-"}</div>
        </div>
      ),
    },
    {
      title: "Fecha", dataIndex: "DiaReserva", key: "fecha",
      sorter: (a, b) => new Date(a.DiaReserva || 0) - new Date(b.DiaReserva || 0),
      render: (v) => v ? dayjs(v).format("DD/MM/YYYY") : "-",
    },
    {
      title: "Horario", key: "horario",
      render: (_, r) => {
        if (r.TipoReserva === "semanal") return <Tag color="blue">Semanal</Tag>;
        if (r.TipoReserva === "mensual") return <Tag color="purple">Mensual</Tag>;
        return r.HorarioReserva ? `${r.HorarioReserva} - ${r.HorarioFin || ""}` : "-";
      },
    },
    {
      title: "Estado del turno",
      key: "estado",
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
      title: "Monto", dataIndex: "Monto", key: "monto",
      render: (v) => `$${parseFloat(v || 0).toLocaleString("es-AR")}`,
    },
    {
      title: "Acciones", key: "acciones", width: 160,
      render: (_, record) => {
        const puedeEditar = record.puedeEditar === true;
        const puedeEliminar = record.puedeEliminar === true;
        const motivo = record.mensajeMutacion || "No se puede modificar esta reserva.";
        const motivoEliminar = record.mensajeNoEliminar || record.mensajeMutacion || "No se puede eliminar esta reserva.";
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tooltip title={!puedeEditar ? motivo : null}>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={!puedeEditar}
                onClick={() => puedeEditar && handleModificar(record)}
              />
            </Tooltip>
            {puedeEliminar ? (
              <Popconfirm
                title="¿Eliminar esta reserva? Se borrará también el registro de pago asociado si existe."
                onConfirm={() => handleDelete(record.idReserva)}
                okText="Eliminar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ) : (
              <Tooltip title={motivoEliminar}>
                <span>
                  <Button size="small" danger icon={<DeleteOutlined />} disabled />
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const renderChip = (r) => (
    <button
      key={r.idRecurso}
      type="button"
      className={[styles.chip, r.esCompleto ? styles.chipCompleto : "", formData.idRecurso === r.idRecurso ? styles.chipActive : ""].join(" ")}
      onClick={() => setFormData({ ...formData, idRecurso: r.idRecurso })}
    >
      {r.esCompleto && <ExpandAltOutlined style={{ fontSize: 12 }} />}
      {r.Nombre}
    </button>
  );

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header />
        <Content className={styles.content}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.content}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Control de Reservas</h1>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type={showOccupancy ? "primary" : "default"}
                icon={<ClockCircleOutlined />}
                onClick={() => setShowOccupancy(!showOccupancy)}
                style={showOccupancy ? { background: "#34c08f", borderColor: "#34c08f" } : {}}
              >
                {showOccupancy ? "Ver tabla" : "Ver ocupacion"}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { handleLimpiar(); setDrawerOpen(true); }}
                style={{ background: "#34c08f", borderColor: "#34c08f" }}>
                Nueva reserva
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filtersRow}>
            <Input placeholder="Buscar cliente, DNI..." prefix={<SearchOutlined />} allowClear value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 250 }} />
            <Select value={filtroEspacio} onChange={setFiltroEspacio} style={{ minWidth: 150 }}>
              <Option value="Todos">Todos los espacios</Option>
              {espacios.map((e) => <Option key={e.Espacio} value={e.Nombre}>{e.Nombre}</Option>)}
            </Select>
            <Select
              value={filtroEstado}
              onChange={setFiltroEstado}
              style={{ minWidth: 220 }}
              placeholder="Estado del turno"
            >
              <Option value="Todos">Turno: todos</Option>
              <Option value="activa">Activa</Option>
              <Option value="completada">Cerrada — asistió</Option>
              <Option value="no_asistio">No asistió</Option>
              <Option value="cancelada">Cancelada</Option>
            </Select>
            <DatePicker.RangePicker format="DD/MM/YYYY" value={dateRange} onChange={setDateRange}
              placeholder={["Desde", "Hasta"]} allowClear />
          </div>

          {!showOccupancy ? (
            <Card bordered={false} className={styles.tableCard}>
              <Table
                columns={columns}
                dataSource={reservas}
                loading={reservasFetching}
                pagination={{
                  current: tablePage,
                  pageSize,
                  total: reservasTotal,
                  showSizeChanger: false,
                  size: "small",
                  onChange: (p) => setTablePage(p),
                }}
                size="middle"
                scroll={{ x: 900 }}
              />
              <div className={styles.tableFooter}>
                Mostrando {tableRangeStart}-{tableRangeEnd} de {reservasTotal} reservas
              </div>
            </Card>
          ) : (
            <Card bordered={false} className={styles.tableCard}>
              <div className={styles.occupancyHeader}>
                <h3>Ocupacion del dia</h3>
                <DatePicker value={occupancyDate} onChange={(v) => v && setOccupancyDate(v)} format="DD/MM/YYYY" />
              </div>
              <div className={styles.occupancyGrid}>
                <div className={styles.occupancyTimeHeader}>
                  <div className={styles.occupancyLabel}>Recurso</div>
                  {Array.from({ length: COWORKING_CLOSE - COWORKING_OPEN }, (_, i) => (
                    <div key={i} className={styles.occupancyHour}>{COWORKING_OPEN + i}:00</div>
                  ))}
                </div>
                {occupancyData.slice(0, 20).map((rec) => (
                  <div key={rec.idRecurso} className={styles.occupancyRow}>
                    <div className={styles.occupancyLabel} title={`${rec.espacio_nombre} / ${rec.Nombre}`}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{rec.Nombre}</div>
                      <div style={{ fontSize: 10, color: "#999" }}>{rec.espacio_nombre}</div>
                    </div>
                    <div className={styles.occupancyTimeline}>
                      {rec.bookings.map((bk) => {
                        if (!bk.HorarioReserva) {
                          return (
                            <div key={bk.idReserva} className={styles.occupancyBlock}
                              style={{ left: "0%", width: "100%", background: "#e8a830" }}
                              title={`${bk.Nombre} (todo el dia)`}>
                              <span>{bk.Nombre}</span>
                            </div>
                          );
                        }
                        const [h1, m1] = bk.HorarioReserva.split(":").map(Number);
                        const [h2, m2] = (bk.HorarioFin || bk.HorarioReserva).split(":").map(Number);
                        const totalMins = (COWORKING_CLOSE - COWORKING_OPEN) * 60;
                        const startMin = (h1 - COWORKING_OPEN) * 60 + m1;
                        const endMin = (h2 - COWORKING_OPEN) * 60 + m2;
                        const left = Math.max(0, (startMin / totalMins) * 100);
                        const width = Math.max(2, ((endMin - startMin) / totalMins) * 100);
                        return (
                          <div key={bk.idReserva} className={styles.occupancyBlock}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${bk.Nombre} ${bk.HorarioReserva}-${bk.HorarioFin}`}>
                            <span>{bk.HorarioReserva}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {occupancyData.length === 0 && (
                  <div style={{ textAlign: "center", padding: 32, color: "#999" }}>
                    No hay reservas para este dia
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Drawer for create/edit */}
        <Drawer
          title={editingId ? "Modificar Reserva" : "Nueva Reserva"}
          placement="right"
          width={400}
          onClose={handleLimpiar}
          open={drawerOpen}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button onClick={handleLimpiar}>Cancelar</Button>
              <Button type="primary" onClick={handleGuardar} style={{ background: "#34c08f", borderColor: "#34c08f" }}>
                {editingId ? "Actualizar" : "Crear Reserva"}
              </Button>
            </div>
          }
        >
          <div className={styles.drawerForm}>
            <div className={styles.formField}>
              <label className={styles.label}>DNI</label>
              <Input value={formData.DNI} onChange={(e) => setFormData({ ...formData, DNI: e.target.value })} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Nombre</label>
              <Input value={formData.Nombre} onChange={(e) => setFormData({ ...formData, Nombre: e.target.value })} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Apellido</label>
              <Input value={formData.Apellido} onChange={(e) => setFormData({ ...formData, Apellido: e.target.value })} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Email</label>
              <Input value={formData.Email} onChange={(e) => setFormData({ ...formData, Email: e.target.value })} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Espacio</label>
              <Select style={{ width: "100%" }} value={formData.idEspacio}
                onChange={(v) => setFormData({ ...formData, idEspacio: v, idRecurso: null })}
                placeholder="Seleccionar espacio">
                {espacios.map((e) => <Option key={e.Espacio} value={e.Espacio}>{e.Nombre}</Option>)}
              </Select>
            </div>
            {formData.idEspacio && (
              <div className={styles.formField}>
                <label className={styles.label}>Recurso</label>
                <div className={styles.chipGrid}>
                  {recursoGroups.flatMap((s) =>
                    s.items ? s.items.map(renderChip) : s.item ? [renderChip(s.item)] : []
                  )}
                </div>
              </div>
            )}
            <div className={styles.formField}>
              <label className={styles.label}>Fecha</label>
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} value={formData.fecha}
                onChange={(v) => setFormData({ ...formData, fecha: v })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className={styles.formField}>
                <label className={styles.label}>Hora inicio</label>
                <TimePicker format="HH:mm" minuteStep={30} style={{ width: "100%" }} value={formData.hora}
                  onChange={(v) => setFormData({ ...formData, hora: v })}
                  disabledHours={() => {
                    const h = [];
                    for (let i = 0; i < COWORKING_OPEN; i++) h.push(i);
                    for (let i = COWORKING_CLOSE; i < 24; i++) h.push(i);
                    return h;
                  }}
                  disabledMinutes={(selectedHour) => {
                    if (selectedHour == null || !formData.duracion) return [];
                    const cierreMin = COWORKING_CLOSE * 60;
                    const bad = [];
                    for (const mm of [0, 30]) {
                      if (selectedHour * 60 + mm + formData.duracion > cierreMin) bad.push(mm);
                    }
                    return bad;
                  }} />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Duracion</label>
                <Select style={{ width: "100%" }} value={formData.duracion}
                  onChange={(v) => setFormData({ ...formData, duracion: v })}>
                  <Option value={60}>1 hora</Option>
                  <Option value={120}>2 horas</Option>
                  <Option value={180}>3 horas</Option>
                  <Option value={240}>Medio dia</Option>
                  <Option value={480}>Dia completo</Option>
                </Select>
              </div>
            </div>
          </div>
        </Drawer>
      </Content>
    </Layout>
  );
}
