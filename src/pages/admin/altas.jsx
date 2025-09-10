
import "../../styles/global.css";
import styles from "../../styles/admin/altas.module.css";
import Header from "../../components/header";
import React from "react";
import { Layout, Row, Col, Card, Select, Button, Input, Table, Tag, Space, Avatar, Pagination } from "antd";
import { SearchOutlined, DownOutlined } from "@ant-design/icons";



const { Content } = Layout;
const { Option } = Select;

const sampleData = [
  {
    key: "1",
    nombre: "Matias Dutto",
    dni: "45854882",
    email: "mtdutto@gmail.com",
    espacio: "Sillón Individual",
    empresa: "-",
    estado: "Asistió",
  },
  {
    key: "2",
    nombre: "Martin Cattani",
    dni: "34934232",
    email: "mctao@gmail.com",
    espacio: "Oficina",
    empresa: "-",
    estado: "No Asistió",
  },
  {
    key: "3",
    nombre: "Agustin Rasero",
    dni: "44687234",
    email: "agsrasero@gmail.com",
    espacio: "Sillón Individual",
    empresa: "-",
    estado: "Asistió",
  },
];

export default function AltaClientes() {
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
    {
      title: "Estado",
      dataIndex: "estado",
      key: "estado",
      align: "right",
      render: (estado) => (
        <Tag className={estado === "Asistió" ? styles.tagAsistio : styles.tagNoAsistio}>
          {estado}
        </Tag>
      ),
    },
  ];

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
              >
                <Option value="45854882">45854882 - Matias D</Option>
                <Option value="34934232">34934232 - Martin C</Option>
                <Option value="44687234">44687234 - Agustin R</Option>
              </Select>

              <div className={styles.buttonsGroup}>
                <Button className={styles.btnAsistio}>Asistio</Button>
                <Button className={styles.btnNoAsistio}>No Asistio</Button>
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
                    placeholder="Search"
                    className={styles.searchInput}
                    allowClear
                  />
                  <Select defaultValue="newest" className={styles.sortSelect}>
                    <Option value="newest">Newest</Option>
                    <Option value="oldest">Oldest</Option>
                    <Option value="nombre">Nombre</Option>
                  </Select>
                </div>
              </div>

              <Table
                columns={columns}
                dataSource={sampleData}
                pagination={false}
                rowClassName={() => styles.tableRow}
                className={styles.dataTable}
                showHeader
              />

              <div className={styles.tableBottom}>
                <div className={styles.infoText}>Showing data 1 to 8 of 256K entries</div>
                <Pagination simple defaultCurrent={1} total={400} className={styles.pagination} />
              </div>
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}