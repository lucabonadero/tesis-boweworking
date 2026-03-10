import React, { useState, useEffect } from "react";
import Header from "../../components/header.jsx";
import styles from "../../styles/admin/consultareservas.module.css";
import "../../styles/global.css";

import {
  Layout,
  Card,
  Table,
  Input,
  Select,
  Button,
  DatePicker,
  Pagination,
  Space,
  message,
  Spin,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const getToken = () => localStorage.getItem('token');

export default function ControlReservas() {
  const [reservas, setReservas] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEspacio, setFiltroEspacio] = useState("Todos");
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    DNI: "", Nombre: "", Apellido: "", Email: "", idEspacio: null, fecha: null,
  });

  const fetchReservas = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reservas`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setReservas(data.map((r) => ({ ...r, key: r.idReserva })));
    } catch {
      message.error("Error al cargar reservas");
    }
  };

  const fetchEspacios = async () => {
    try {
      const res = await fetch(`${API_URL}/api/espacios`);
      const data = await res.json();
      setEspacios(data);
    } catch {
      message.error("Error al cargar espacios");
    }
  };

  useEffect(() => {
    Promise.all([fetchReservas(), fetchEspacios()]).finally(() => setLoading(false));
  }, []);

  const handleGuardar = async () => {
    try {
      const body = {
        DNI: formData.DNI,
        Nombre: `${formData.Nombre} ${formData.Apellido}`,
        idEspacio: formData.idEspacio,
        HorarioReserva: formData.fecha ? formData.fecha.format("HH:mm") : "",
        Monto: 0,
        DiaReserva: formData.fecha ? formData.fecha.format("YYYY-MM-DD") : "",
      };

      if (editingId) {
        const res = await fetch(`${API_URL}/api/reservas/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        message.success("Reserva actualizada");
      } else {
        // Crear cliente primero
        await fetch(`${API_URL}/api/clientes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            DNI: formData.DNI,
            Nombre: formData.Nombre,
            Apellido: formData.Apellido,
            Email: formData.Email,
          }),
        });

        const res = await fetch(`${API_URL}/api/reservas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
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
      const res = await fetch(`${API_URL}/api/reservas/${editingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      message.success("Reserva eliminada");
      handleLimpiar();
      fetchReservas();
    } catch {
      message.error("Error al eliminar reserva");
    }
  };

  const handleEliminarRow = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/reservas/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      message.success("Reserva eliminada");
      fetchReservas();
    } catch {
      message.error("Error al eliminar reserva");
    }
  };

  const handleModificar = (record) => {
    setEditingId(record.idReserva);
    const [nombre, ...rest] = (record.Nombre || "").split(" ");
    setFormData({
      DNI: record.DNI || "",
      Nombre: nombre || "",
      Apellido: rest.join(" ") || "",
      Email: "",
      idEspacio: record.idEspacio,
      fecha: null,
    });
  };

  const handleLimpiar = () => {
    setEditingId(null);
    setFormData({ DNI: "", Nombre: "", Apellido: "", Email: "", idEspacio: null, fecha: null });
  };

  const filteredReservas = reservas.filter((r) => {
    const matchSearch = search === "" ||
      (r.Nombre || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.DNI || "").includes(search);
    const matchEspacio = filtroEspacio === "Todos" || r.espacio_nombre === filtroEspacio;
    return matchSearch && matchEspacio;
  });

  const columns = [
    { title: "Nombre", dataIndex: "Nombre", key: "Nombre" },
    { title: "DNI", dataIndex: "DNI", key: "DNI" },
    { title: "Espacio", dataIndex: "espacio_nombre", key: "espacio_nombre" },
    { title: "Día Reserva", dataIndex: "DiaReserva", key: "DiaReserva",
      render: (v) => v ? new Date(v).toLocaleDateString() : "-" },
    { title: "Horario", dataIndex: "HorarioReserva", key: "HorarioReserva" },
    { title: "Monto", dataIndex: "Monto", key: "Monto",
      render: (v) => v ? `$${v}` : "$0" },
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

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header isEmpleado={true} />
        <Content className={styles.content}>
          <div style={{ textAlign: 'center', padding: '4rem' }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header isEmpleado={true} />
      <Content className={styles.content}>
        <div className={styles.container}>
          

          {/* Grid que coloca la tabla a la izquierda (expandida) y el formulario fijo a la derecha */}
          <div className={styles.edgeGrid}>
            {/* LEFT: tarjeta blanca que debe pegarse al margen izquierdo y estirarse */}
            <div className={styles.leftArea}>
              <Card className={styles.tableCard} bordered={false}>
                {/* Header: título + buscador + controles */}
                <div className={styles.tableHeader}>
                    <h2 className={styles.tableTitle}>Control de Reservas</h2>
                    <div className={styles.tableControls}>
                    
                    {/* Buscar */}
                    <Input
                        placeholder="Buscar..."
                        prefix={<SearchOutlined />}
                        className={styles.searchInput}
                        allowClear
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {/* Filtro */}
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

                {/* Tabla */}
                <div className={styles.tableWrapper}>
                    <Table
                    columns={columns}
                    dataSource={filteredReservas}
                    pagination={false}
                    className={styles.table}
                    tableLayout="auto"
                    />
                </div>

                {/* Footer con info + paginación */}
                <div className={styles.tableFooter}>
                    <div className={styles.tableInfo}>
                    Mostrando {filteredReservas.length} de {reservas.length} entradas
                    </div>
                    <Pagination simple defaultCurrent={1} total={400} className={styles.pagination} />
                </div>
                </Card>
            </div>

            {/* RIGHT: formulario con ancho fijo al lado derecho */}
            <aside className={styles.rightArea}>
              <Card className={styles.formCard} bordered={false}>
                <h2 className={styles.formTitle}>
                  {editingId ? "Modificar Reserva" : "Alta de Reserva"}
                </h2>

                <div className={styles.formField}>
                  <label className={styles.label}>DNI:</label>
                  <Input placeholder="DNI" className={styles.input}
                    value={formData.DNI}
                    onChange={(e) => setFormData({...formData, DNI: e.target.value})}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Nombre:</label>
                  <Input placeholder="Nombre" className={styles.input}
                    value={formData.Nombre}
                    onChange={(e) => setFormData({...formData, Nombre: e.target.value})}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Apellido:</label>
                  <Input placeholder="Apellido" className={styles.input}
                    value={formData.Apellido}
                    onChange={(e) => setFormData({...formData, Apellido: e.target.value})}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Correo Electrónico:</label>
                  <Input
                    placeholder="email@ejemplo.com"
                    className={styles.input}
                    value={formData.Email}
                    onChange={(e) => setFormData({...formData, Email: e.target.value})}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Espacio a reservar:</label>
                  <Select className={styles.select}
                    value={formData.idEspacio}
                    onChange={(v) => setFormData({...formData, idEspacio: v})}
                    placeholder="Seleccionar espacio"
                  >
                    {espacios.map((e) => (
                      <Option key={e.Espacio} value={e.Espacio}>{e.Nombre}</Option>
                    ))}
                  </Select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Fecha y Hora:</label>
                  <DatePicker
                    showTime
                    className={styles.input}
                    style={{ width: "100%" }}
                    value={formData.fecha}
                    onChange={(v) => setFormData({...formData, fecha: v})}
                  />
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