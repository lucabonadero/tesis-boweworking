import React from 'react';
import { Space, Table, Tag } from 'antd';

const columns = [
  {
    title: 'Nombre',
    dataIndex: 'name',
    key: 'name',
    render: text => <a>{text}</a>,
  },
  {
    title: 'Apellido',
    dataIndex: 'lastname',
    key: 'lastname',
  },
  {
    title: 'Email',
    dataIndex: 'email',
    key: 'email',
    width: 200,
    ellipsis: true, // Esto muestra "..." si se corta
    allign: 'center', // Centra el texto
  },
  {
    title: 'Espacio',
    dataIndex: 'space',
    key: 'space',
  },
  {
    title: 'Fecha y Hora',
    dataIndex: 'date',
    key: 'date',
    width: 200,
    ellipsis: true,
  },
  {
    title: 'Duración',
    dataIndex: 'duration',
    key: 'duration',
    width: 80, // bien angosta
  },
  {
    title: 'Personas',
    dataIndex: 'people',
    key: 'people',
  },
  {
    title: <div style={{ textAlign: 'center' }}>Acciones</div>,
    key: 'action',
    dataIndex: 'action',
    width: 150,
    fixed: 'right',
    allign: 'center',
    render: (_, record) => (
      <Space size="middle">
        <a>Eliminar</a>
        <a>Modificar</a>
      </Space>
    ),
  },
];

const data = [
  {
    key: '1',
    name: 'Juan',
    lastname: 'Pérez',
    email: 'juanperez245@gmail.com',
    space: 'Planta Baja',
    date: '2023-10-01 10:00',
    duration: '1hs',
    people: 2,
  },
  {
    key: '2',
    name: 'María',
    lastname: 'Gómez',
    email: 'mariagomezperez213@gmail.com',
    space: 'Oficina Individual',
    date: '2023-10-02 11:00',
    duration: '2hs',
    people: 1,
  },
];

const Tabla = () => (
  <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
    <div style={{ minWidth: '1000px' }}>
      <Table
        columns={columns}
        dataSource={data}
        pagination={true}
        scroll={{ x: true }}
      />
    </div>
  </div>
);
export default Tabla;