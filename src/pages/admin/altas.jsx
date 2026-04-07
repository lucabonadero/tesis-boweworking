
import "../../styles/global.css";
import styles from "../../styles/admin/altas.module.css";
import Header from "../../components/header";
import React, { useState, useEffect } from "react";
import { Layout, Row, Col, Card, Select, Button, Input, Table, Tag, Space, Pagination, message, Spin } from "antd";
import { SearchOutlined, DownOutlined } from "@ant-design/icons";
import { adminFetch } from "../../utils/adminApi";

const { Content } = Layout;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AltaClientes() {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDni, setSelectedDni] = useState(null);

  const fetchReservas = async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/reservas`);
      const data = await res.json();
      setReservas(data);
    } catch {
      message.error("Error al cargar reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReservas(); }, []);

  const dniList = [...new Set(reservas.map((r) => r.DNI).filter(Boolean))];

  const filteredData = reservas
    .filter((r) => {
      const matchSearch = search === "" ||
        (r.Nombre || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.DNI || "").includes(search);
      return matchSearch;
    })
    .map((r) => ({
      key: r.idReserva,
      nombre: r.Nombre || `${r.cliente_nombre || ""} ${r.cliente_apellido || ""}`,
      dni: r.DNI,
      email: r.cliente_email || "-",
      espacio: r.espacio_nombre || "-",
      empresa: "-",
    }));

  const columns = [
    {
      title: "Nombre del Cliente",
      dataIndex: "nombre",
      key: "nombre",
      render: (text) => <span className={styles.nombreCliente}>{text}</span>,
    },
    {
      title: "DNI",
      dataIndex: "dni",
      key: "dni",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (text) => <a className={styles.emailLink}>{text}</a>,
    },
    {
      title: "Espacio",
      dataIndex: "espacio",
      key: "espacio",
    },
    {
      title: "Empresa",
      dataIndex: "empresa",
      key: "empresa",
    },
  ];

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header isEmpleado={true} />
        <Content className={styles.contentWrap}>
          <div style={{ textAlign: 'center', padding: '4rem' }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header isEmpleado={true} />
      <Content className={styles.contentWrap}>
        <Row gutter={24} className={styles.pageRow}>
          {/* Left filter column */}
          <Col span={6} className={styles.leftCol}>
            <Card bordered={false} className={styles.leftCard}>
              <div className={styles.filterLabel}>DNI asociado a la Reserva</div>
              <Select
                placeholder="Seleccione DNI"
                className={styles.dniSelect}
                suffixIcon={<DownOutlined />}
                allowClear
                value={selectedDni}
                onChange={(v) => setSelectedDni(v)}
              >
                {dniList.map((dni) => {
                  const r = reservas.find((x) => x.DNI === dni);
                  return (
                    <Option key={dni} value={dni}>{dni} - {r?.Nombre || r?.cliente_nombre || ""}</Option>
                  );
                })}
              </Select>

              <div className={styles.buttonsGroup}>
                <Button className={styles.btnAsistio} disabled={!selectedDni}>Asistio</Button>
                <Button className={styles.btnNoAsistio} disabled={!selectedDni}>No Asistio</Button>
              </div>
            </Card>
          </Col>

          {/* Main content column */}
          <Col span={18} className={styles.mainCol}>
            <Card bordered={false} className={styles.mainCard}>
              <div className={styles.headerRow}>
                <h2 className={styles.title}>Alta Clientes</h2>

                <div className={styles.tools}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder="Buscar"
                    className={styles.searchInput}
                    allowClear
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Select defaultValue="newest" className={styles.sortSelect}>
                    <Option value="newest">Nuevos</Option>
                    <Option value="oldest">Mas Viejos</Option>
                    <Option value="nombre">Nombre</Option>
                  </Select>
                </div>
              </div>

              <Table
                columns={columns}
                dataSource={filteredData}
                pagination={false}
                rowClassName={() => styles.tableRow}
                className={styles.dataTable}
                showHeader
              />

              <div className={styles.tableBottom}>
                <div className={styles.infoText}>Mostrando {filteredData.length} de {reservas.length} entradas</div>
                <Pagination simple defaultCurrent={1} total={400} className={styles.pagination} />
              </div>
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}