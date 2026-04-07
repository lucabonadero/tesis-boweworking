import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import Header from "../../components/header.jsx";
import styles from "../../styles/admin/consultareservas.module.css";
import "../../styles/global.css";
import { adminFetch } from "../../utils/adminApi";

import {
  Layout,
  Card,
  Table,
  Input,
  Select,
  Button,
  DatePicker,
  TimePicker,
  Pagination,
  Space,
  message,
  Spin,
} from "antd";
import { SearchOutlined, ExpandAltOutlined, AppstoreOutlined } from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function ControlReservas() {
  const [reservas, setReservas] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [recursos, setRecursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEspacio, setFiltroEspacio] = useState("Todos");
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    DNI: "", Nombre: "", Apellido: "", Email: "",
    idEspacio: null, idRecurso: null,
    fecha: null, hora: null, duracion: 60,
  });

  const fetchReservas = async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/reservas`);
      const data = await res.json();
      setReservas(data.map((r) => ({ ...r, key: r.idReserva })));
    } catch {
      message.error("Error al cargar reservas");
    }
  };

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
    Promise.all([fetchReservas(), fetchEspacios(), fetchRecursos()])
      .finally(() => setLoading(false));
  }, []);

  // ── Build grouped resource structure for the picker ─────

  const recursoGroups = useMemo(() => {
    if (!formData.idEspacio) return [];

    const delEspacio = recursos.filter((r) => r.idEspacio === formData.idEspacio);
    const grupoIds = new Set(
      delEspacio.filter((r) => r.idRecursoPadre).map((r) => r.idRecursoPadre)
    );
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
      if (items.length > 1) {
        sections.push({ type: "visual-group", label: label + "s", items });
      } else {
        sections.push({ type: "standalone", item: items[0] });
      }
    });

    dbGroups.forEach((g) => {
      const children = delEspacio.filter((r) => r.idRecursoPadre === g.idRecurso);
      sections.push({ type: "db-group", label: g.Nombre, items: children });
    });

    if (completoItems.length > 0) {
      sections.push({ type: "completo", items: completoItems });
    }

    return sections;
  }, [formData.idEspacio, recursos]);

  // ── Handlers ────────────────────────────────────────────

  const handleGuardar = async () => {
    if (!formData.fecha || !formData.hora) {
      message.warning("Seleccioná fecha y hora de la reserva.");
      return;
    }
    if (!formData.idRecurso) {
      message.warning("Seleccioná un recurso a reservar.");
      return;
    }
    try {
      const horaInicio = formData.hora.format("HH:mm");
      const horaFin = formData.hora.add(formData.duracion, "minute").format("HH:mm");

      const body = {
        DNI: formData.DNI,
        Nombre: `${formData.Nombre} ${formData.Apellido}`.trim(),
        idRecurso: formData.idRecurso,
        HorarioReserva: horaInicio,
        HorarioFin: horaFin,
        Monto: 0,
        DiaReserva: formData.fecha.format("YYYY-MM-DD"),
      };

      if (editingId) {
        const res = await adminFetch(`${API_URL}/api/reservas/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          message.error(data.message || "No se pudo actualizar la reserva");
          return;
        }
        message.success("Reserva actualizada");
      } else {
        await fetch(`${API_URL}/api/clientes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            DNI: formData.DNI,
            Nombre: formData.Nombre,
            Apellido: formData.Apellido,
            Email: formData.Email,
          }),
        });

        const res = await adminFetch(`${API_URL}/api/reservas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          message.error(data.message || "No se pudo crear la reserva");
          return;
        }
        message.success("Reserva creada");
      }
      handleLimpiar();
      fetchReservas();
    } catch {
      message.error("Error al guardar reserva");
    }
  };

  const handleEliminar = async () => {
    if (!editingId) return;
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${editingId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "No se pudo eliminar la reserva");
        return;
      }
      message.success("Reserva eliminada");
      handleLimpiar();
      fetchReservas();
    } catch {
      message.error("Error al eliminar reserva");
    }
  };

  const handleEliminarRow = async (id) => {
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "No se pudo eliminar la reserva");
        return;
      }
      message.success("Reserva eliminada");
      fetchReservas();
    } catch {
      message.error("Error al eliminar reserva");
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
      hora = dayjs().hour(parseInt(hh, 10) || 0).minute(parseInt(mm, 10) || 0).second(0);
    }
    if (record.HorarioReserva && record.HorarioFin) {
      const [h1, m1] = record.HorarioReserva.split(":").map(Number);
      const [h2, m2] = record.HorarioFin.split(":").map(Number);
      duracion = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (duracion <= 0) duracion = 60;
    }

    const recurso = recursos.find((r) => r.idRecurso === record.idRecurso);
    setFormData({
      DNI: record.DNI || "",
      Nombre: nombre || "",
      Apellido: rest.join(" ") || "",
      Email: "",
      idEspacio: recurso ? recurso.idEspacio : null,
      idRecurso: record.idRecurso || null,
      fecha, hora, duracion,
    });
  };

  const handleLimpiar = () => {
    setEditingId(null);
    setFormData({
      DNI: "", Nombre: "", Apellido: "", Email: "",
      idEspacio: null, idRecurso: null,
      fecha: null, hora: null, duracion: 60,
    });
  };

  // ── Filter + columns ───────────────────────────────────

  const filteredReservas = reservas.filter((r) => {
    const matchSearch =
      search === "" ||
      (r.Nombre || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.DNI || "").includes(search);
    const matchEspacio = filtroEspacio === "Todos" || r.espacio_nombre === filtroEspacio;
    return matchSearch && matchEspacio;
  });

  const columns = [
    { title: "Nombre", dataIndex: "Nombre", key: "Nombre" },
    { title: "DNI", dataIndex: "DNI", key: "DNI" },
    { title: "Espacio", dataIndex: "espacio_nombre", key: "espacio_nombre" },
    { title: "Recurso", dataIndex: "recurso_nombre", key: "recurso_nombre" },
    {
      title: "Día Reserva", dataIndex: "DiaReserva", key: "DiaReserva",
      render: (v) => (v ? new Date(v).toLocaleDateString() : "-"),
    },
    { title: "Horario", key: "horario",
      render: (_, r) => r.HorarioFin ? `${r.HorarioReserva} – ${r.HorarioFin}` : r.HorarioReserva || "-" },
    {
      title: "Monto", dataIndex: "Monto", key: "Monto",
      render: (v) => (v ? `$${v}` : "$0"),
    },
    {
      title: "Acciones",
      key: "acciones",
      render: (_, record) => (
        <Space>
          <a className={styles.actionLink} onClick={() => handleEliminarRow(record.idReserva)}>Eliminar</a>
          <a className={styles.actionLink} onClick={() => handleModificar(record)}>Modificar</a>
        </Space>
      ),
    },
  ];

  // ── Render helpers ──────────────────────────────────────

  const renderChip = (r) => (
    <button
      key={r.idRecurso}
      type="button"
      className={[
        styles.chip,
        r.esCompleto ? styles.chipCompleto : "",
        formData.idRecurso === r.idRecurso ? styles.chipActive : "",
      ].join(" ")}
      onClick={() => setFormData({ ...formData, idRecurso: r.idRecurso })}
    >
      {r.esCompleto && <ExpandAltOutlined className={styles.chipIcon} />}
      {r.Nombre}
    </button>
  );

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header isEmpleado={true} />
        <Content className={styles.content}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header isEmpleado={true} />
      <Content className={styles.content}>
        <div className={styles.container}>
          <div className={styles.edgeGrid}>

            {/* ── TABLE ── */}
            <div className={styles.leftArea}>
              <Card className={styles.tableCard} bordered={false}>
                <div className={styles.tableHeader}>
                  <h2 className={styles.tableTitle}>Control de Reservas</h2>
                  <div className={styles.tableControls}>
                    <Input
                      placeholder="Buscar..."
                      prefix={<SearchOutlined />}
                      className={styles.searchInput}
                      allowClear
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Select
                      defaultValue="Todos"
                      className={styles.filterSelect}
                      onChange={(v) => setFiltroEspacio(v)}
                    >
                      <Option value="Todos">Todos</Option>
                      {espacios.map((e) => (
                        <Option key={e.Espacio} value={e.Nombre}>{e.Nombre}</Option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <Table
                    columns={columns}
                    dataSource={filteredReservas}
                    pagination={false}
                    className={styles.table}
                    tableLayout="auto"
                  />
                </div>

                <div className={styles.tableFooter}>
                  <div className={styles.tableInfo}>
                    Mostrando {filteredReservas.length} de {reservas.length} entradas
                  </div>
                  <Pagination simple defaultCurrent={1} total={reservas.length} className={styles.pagination} />
                </div>
              </Card>
            </div>

            {/* ── FORM ── */}
            <aside className={styles.rightArea}>
              <Card className={styles.formCard} bordered={false}>
                <h2 className={styles.formTitle}>
                  {editingId ? "Modificar Reserva" : "Alta de Reserva"}
                </h2>

                <div className={styles.formField}>
                  <label className={styles.label}>DNI:</label>
                  <Input placeholder="DNI" className={styles.input}
                    value={formData.DNI}
                    onChange={(e) => setFormData({ ...formData, DNI: e.target.value })}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Nombre:</label>
                  <Input placeholder="Nombre" className={styles.input}
                    value={formData.Nombre}
                    onChange={(e) => setFormData({ ...formData, Nombre: e.target.value })}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Apellido:</label>
                  <Input placeholder="Apellido" className={styles.input}
                    value={formData.Apellido}
                    onChange={(e) => setFormData({ ...formData, Apellido: e.target.value })}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Correo Electrónico:</label>
                  <Input placeholder="email@ejemplo.com" className={styles.input}
                    value={formData.Email}
                    onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                  />
                </div>

                {/* ── ESPACIO SELECTOR ── */}
                <div className={styles.formField}>
                  <label className={styles.label}>Espacio:</label>
                  <Select className={styles.select}
                    value={formData.idEspacio}
                    onChange={(v) => setFormData({ ...formData, idEspacio: v, idRecurso: null })}
                    placeholder="Seleccionar espacio"
                  >
                    {espacios.map((e) => (
                      <Option key={e.Espacio} value={e.Espacio}>{e.Nombre}</Option>
                    ))}
                  </Select>
                </div>

                {/* ── RESOURCE PICKER (animated) ── */}
                <div className={styles.formField}>
                  <label className={styles.label}>Recurso a reservar:</label>

                  <div className={`${styles.resourcePicker} ${formData.idEspacio ? styles.resourcePickerOpen : ""}`}>
                    {!formData.idEspacio && (
                      <div className={styles.resourceHint}>
                        <AppstoreOutlined style={{ fontSize: 20, opacity: 0.3 }} />
                        <span>Elegí un espacio para ver los recursos</span>
                      </div>
                    )}

                    {formData.idEspacio && (
                      <div key={formData.idEspacio} className={styles.resourceContent}>
                        {recursoGroups.map((section, idx) => {
                          if (section.type === "visual-group") {
                            return (
                              <div key={section.label} className={styles.resourceSection} style={{ animationDelay: `${idx * 60}ms` }}>
                                <span className={styles.resourceSectionLabel}>{section.label}</span>
                                <div className={styles.chipGrid}>
                                  {section.items.map(renderChip)}
                                </div>
                              </div>
                            );
                          }
                          if (section.type === "db-group") {
                            return (
                              <div key={section.label} className={styles.resourceSection} style={{ animationDelay: `${idx * 60}ms` }}>
                                <span className={styles.resourceSectionLabel}>{section.label}</span>
                                <div className={styles.chipGrid}>
                                  {section.items.map(renderChip)}
                                </div>
                              </div>
                            );
                          }
                          if (section.type === "standalone") {
                            return (
                              <div key={section.item.idRecurso} className={styles.resourceSection} style={{ animationDelay: `${idx * 60}ms` }}>
                                <div className={styles.chipGrid}>
                                  {renderChip(section.item)}
                                </div>
                              </div>
                            );
                          }
                          if (section.type === "completo") {
                            return (
                              <div key="completo" className={styles.resourceDivider} style={{ animationDelay: `${idx * 60}ms` }}>
                                <div className={styles.dividerLine} />
                                <div className={styles.chipGrid}>
                                  {section.items.map(renderChip)}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Fecha:</label>
                  <DatePicker
                    format="DD/MM/YYYY"
                    className={styles.input}
                    style={{ width: "100%" }}
                    value={formData.fecha}
                    onChange={(v) => setFormData({ ...formData, fecha: v })}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formFieldHalf}>
                    <label className={styles.label}>Hora inicio:</label>
                    <TimePicker
                      format="HH:mm"
                      minuteStep={30}
                      className={styles.input}
                      style={{ width: "100%" }}
                      value={formData.hora}
                      onChange={(v) => setFormData({ ...formData, hora: v })}
                    />
                  </div>
                  <div className={styles.formFieldHalf}>
                    <label className={styles.label}>Duración:</label>
                    <Select
                      className={styles.select}
                      value={formData.duracion}
                      onChange={(v) => setFormData({ ...formData, duracion: v })}
                    >
                      <Option value={60}>1 hora</Option>
                      <Option value={120}>2 horas</Option>
                      <Option value={180}>3 horas</Option>
                      <Option value={240}>Medio día</Option>
                      <Option value={480}>Día completo</Option>
                    </Select>
                  </div>
                </div>

                <div className={styles.actions}>
                  <Button className={styles.btnGrey} onClick={handleLimpiar}>Limpiar</Button>
                  <Button className={styles.btnRed} onClick={handleEliminar} disabled={!editingId}>Eliminar</Button>
                  <Button type="primary" className={styles.btnGreen} onClick={handleGuardar}>
                    Guardar
                  </Button>
                </div>
              </Card>
            </aside>
          </div>
        </div>
      </Content>
    </Layout>
  );
}
