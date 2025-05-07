import React from 'react';
import { Table, Tag } from 'antd';

const columns = [
  {
    title: <div style={{ textAlign: 'center' }}>Cliente</div>,
    dataIndex: 'name',
    key: 'name',
    render: (_, record) => (
      <div style={{ textAlign: 'center' }}>{record.name} {record.lastname}</div>
    ),
  },
  {
    title: <div style={{ textAlign: 'center' }}>Monto</div>,
    dataIndex: 'amount',
    key: 'amount',
    render: amount => <div style={{ textAlign: 'center' }}>${amount}</div>,
  },
  {
    title: <div style={{ textAlign: 'center' }}>Método de pago</div>,
    dataIndex: 'payment',
    key: 'payment',
    render: payment => <div style={{ textAlign: 'center' }}>{payment}</div>,
  },
  {
    title: <div style={{ textAlign: 'center' }}>Estado</div>,
    dataIndex: 'status',
    key: 'status',
    render: status => (
      <div style={{ textAlign: 'center' }}>
        <Tag color={status === 'Pagado' ? 'green' : 'red'} style={{ borderRadius: '8px', padding: '2px 12px' }}>
          {status}
        </Tag>
      </div>
    ),
  },
];

const data = [
  {
    key: '1',
    name: 'Matías',
    lastname: 'Dutto',
    amount: 'XXX',
    payment: 'Tarjeta',
    status: 'Pagado',
  },
  {
    key: '2',
    name: 'Esteban',
    lastname: 'Belcuore',
    amount: 'XXX',
    payment: 'Efectivo',
    status: 'Pendiente',
  },
  {
    key: '3',
    name: 'Tomás',
    lastname: 'Vignolo',
    amount: 'XXX',
    payment: 'Transferencia',
    status: 'Pendiente',
  },
];

const TablaFinanciera = () => (
  <div style={{
    padding: '20px',
    borderRadius: '20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
    backgroundColor: 'white',
    maxWidth: '800px',
    margin: '0 auto'
  }}>
    <h3 style={{ marginBottom: '10px', fontWeight: 'bold' }}>Resumen ingresos de Hoy</h3>
    <p style={{ marginTop: 0, marginBottom: '20px' }}>Ingresos totales: $XXX,XX</p>

    <h3 style={{ fontWeight: 'bold' }}>Transacciones Recientes</h3>
    <p style={{ marginTop: 0, marginBottom: '10px' }}>
      <span style={{ color: 'green', fontWeight: 'bold' }}>Pagados</span> y <span style={{ color: 'red', fontWeight: 'bold' }}>pendientes</span>
    </p>

    <Table
      columns={columns}
      dataSource={data}
      pagination={{ pageSize: 3 }}
      bordered={false}
      rowClassName={() => 'custom-row'}
    />
  </div>
);

export default TablaFinanciera;