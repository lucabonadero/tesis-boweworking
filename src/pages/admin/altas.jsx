import React from "react";
import { Table, Input, Select, Button, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import "../../styles/global.css";
import styles from "../../styles/admin/altas.module.css";
import Header from "../../components/header";
import Footer from "../../components/footer";

const { Option } = Select;

const dataSource = [
  {
    key: "1",
    nombre: "Matias Dutto",
    dni: "45854882",
    email: "mtdutto@gmail.com",
    espacio: "Sillon Individual",
    empresa: "-",
    estado: "Asistio",
  },
  {
    key: "2",
    nombre: "Martin Cattani",
    dni: "34934232",
    email: "mctao@gmail.com",
    espacio: "Oficina",
    empresa: "-",
    estado: "No Asistio",
  },
  {
    key: "3",
    nombre: "Agustin Rasero",
    dni: "44687234",
    email: "agsrasero@gmail.com",
    espacio: "Sillon Individual",
    empresa: "-",
    estado: "Asistio",
  },
];

const columns = [
  {
    title: "Nombre del Cliente",
    dataIndex: "nombre",
    key: "nombre",
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
    render: (text) => <a href={`mailto:${text}`}>{text}</a>,
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
    render: (estado) => (
      <Tag color={estado === "Asistio" ? "green" : "red"}>{estado}</Tag>
    ),
  },
];

export default function AltaClientes() {
  return (
    <div>
        <Header isEmpleado={true} />
    <div className="alta-clientes__container">
      <div className="alta-clientes__sidebar">
        <Select
          defaultValue="DNI asociado a la Reserva"
          className="alta-clientes__select"
        >
          <Option value="dni">DNI asociado a la Reserva</Option>
        </Select>
        <div className="alta-clientes__buttons">
          <Button type="primary" className="asistio">Asistió</Button>
          <Button danger className="no-asistio">No Asistió</Button>
        </div>
      </div>

      <div className="alta-clientes__main">
        <h2>Alta Clientes</h2>
        <div className="alta-clientes__header">
          <Input
            placeholder="Search"
            prefix={<SearchOutlined />}
            className="alta-clientes__search"
          />
          <Select defaultValue="Newest" className="alta-clientes__sort">
            <Option value="newest">Newest</Option>
            <Option value="oldest">Oldest</Option>
          </Select>
        </div>
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={{ pageSize: 8 }}
          className="alta-clientes__table"
        />
      </div>
    </div>
    </div>
  );
}
