import React from "react";
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
} from "antd";
import { SearchOutlined } from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;

const sampleData = [
  {
    key: "1",
    nombre: "Juan",
    apellido: "Pérez",
    email: "juanperez245@gmail.com",
    espacio: "Planta Baja",
    fechaHora: "2023-10-01 10:00",
    duracion: "1hs",
    personas: 2,
  },
  {
    key: "2",
    nombre: "María",
    apellido: "Gómez",
    email: "mariagomezperez213@gmail.com",
    espacio: "Oficina Individual",
    fechaHora: "2023-10-02 11:00",
    duracion: "2hs",
    personas: 1,
  },
];

export default function ControlReservas() {
  const columns = [
    { title: "Nombre", dataIndex: "nombre", key: "nombre" },
    { title: "Apellido", dataIndex: "apellido", key: "apellido" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Espacio", dataIndex: "espacio", key: "espacio" },
    { title: "Fecha y Hora", dataIndex: "fechaHora", key: "fechaHora" },
    { title: "Duración", dataIndex: "duracion", key: "duracion" },
    { title: "Personas", dataIndex: "personas", key: "personas" },
    {
      title: "Acciones",
      key: "acciones",
      render: () => (
        <Space>
          <a className={styles.actionLink}>Eliminar</a>
          <a className={styles.actionLink}>Modificar</a>
        </Space>
      ),
    },
  ];

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
                    />
                    {/* Filtro */}
                    <Select
                        defaultValue="Todos"
                        className={styles.filterSelect}
                    >
                        <Option value="Todos">Todos</Option>
                        <Option value="Planta Baja">Planta Baja</Option>
                        <Option value="Oficina Individual">Oficina Individual</Option>
                        <Option value="Sillón Individual">Sillón Individual</Option>
                    </Select>

                    </div>
                </div>

                {/* Tabla */}
                <div className={styles.tableWrapper}>
                    <Table
                    columns={columns}
                    dataSource={sampleData}
                    pagination={false}
                    className={styles.table}
                    tableLayout="auto"
                    />
                </div>

                {/* Footer con info + paginación */}
                <div className={styles.tableFooter}>
                    <div className={styles.tableInfo}>
                    Mostrando 1 a 2 de 2 entradas
                    </div>
                    <Pagination simple defaultCurrent={1} total={400} className={styles.pagination} />
                </div>
                </Card>
            </div>

            {/* RIGHT: formulario con ancho fijo al lado derecho */}
            <aside className={styles.rightArea}>
              <Card className={styles.formCard} bordered={false}>
                <h2 className={styles.formTitle}>
                  Alta/Baja/Modificación de Reserva
                </h2>

                <div className={styles.formField}>
                  <label className={styles.label}>Nombre:</label>
                  <Input placeholder="Nombre" className={styles.input} />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Apellido:</label>
                  <Input placeholder="Apellido" className={styles.input} />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Correo Electrónico:</label>
                  <Input
                    placeholder="email@ejemplo.com"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Espacio a reservar:</label>
                  <Select className={styles.select} defaultValue="Planta Baja">
                    <Option value="Planta Baja">Planta Baja</Option>
                    <Option value="Oficina Individual">Oficina Individual</Option>
                    <Option value="Sillón Individual">Sillón Individual</Option>
                  </Select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.label}>Fecha y Hora:</label>
                  <DatePicker
                    showTime
                    className={styles.input}
                    style={{ width: "100%" }}
                  />
                </div>

                <div className={styles.actions}>
                  <Button className={styles.btnGrey}>Limpiar</Button>
                  <Button className={styles.btnRed}>Eliminar</Button>
                  <Button type="primary" className={styles.btnGreen}>
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