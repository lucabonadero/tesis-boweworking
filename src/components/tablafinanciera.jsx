import React, { useState, useEffect } from 'react';
import { Table, Tag, Spin, message } from 'antd';
import { adminFetch } from '../utils/adminApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const columns = [
  {
    title: <div style={{ textAlign: 'center' }}>Cliente</div>,
    dataIndex: 'reserva_nombre',
    key: 'reserva_nombre',
    render: (text) => (
      <div style={{ textAlign: 'center' }}>{text || '-'}</div>
    ),
  },
  {
    title: <div style={{ textAlign: 'center' }}>Monto</div>,
    dataIndex: 'Monto',
    key: 'Monto',
    render: amount => <div style={{ textAlign: 'center' }}>${amount || 0}</div>,
  },
  {
    title: <div style={{ textAlign: 'center' }}>Método de pago</div>,
    dataIndex: 'MetodoPago',
    key: 'MetodoPago',
    render: payment => <div style={{ textAlign: 'center' }}>{payment}</div>,
  },
  {
    title: <div style={{ textAlign: 'center' }}>Estado de pago</div>,
    dataIndex: 'EstadoPago',
    key: 'EstadoPago',
    render: status => (
      <div style={{ textAlign: 'center' }}>
        <Tag color={status === 'Pagado' ? 'green' : 'red'} style={{ borderRadius: '8px', padding: '2px 12px' }}>
          {status}
        </Tag>
      </div>
    ),
  },
];

const TablaFinanciera = () => {
  const [transacciones, setTransacciones] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransacciones = async () => {
      try {
        const [resPagos, resResumen] = await Promise.all([
          adminFetch(`${API_URL}/api/pagos?limit=50&offset=0`),
          adminFetch(`${API_URL}/api/pagos/resumen`),
        ]);
        const data = await resPagos.json();
        const items = data.items ?? [];
        setTransacciones(items.map((t) => ({ ...t, key: t.idTransaccion })));
        setResumen(await resResumen.json());
      } catch {
        message.error("Error al cargar transacciones");
      } finally {
        setLoading(false);
      }
    };
    fetchTransacciones();
  }, []);

  const totalIngresos =
    resumen != null
      ? parseFloat(resumen.ingresosHoy) || 0
      : transacciones
          .filter((t) => t.EstadoPago === "Pagado")
          .reduce((sum, t) => sum + (parseFloat(t.Monto) || 0), 0);

  const pendientes = transacciones.filter((t) => t.EstadoPago === "Pendiente").length;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}><Spin /></div>;
  }

  return (
    <div style={{
      padding: '20px',
      borderRadius: '20px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      backgroundColor: 'white',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <h3 style={{ marginBottom: '10px', fontWeight: 'bold' }}>Resumen ingresos de Hoy</h3>
      <p style={{ marginTop: 0, marginBottom: '20px' }}>Ingresos totales: ${totalIngresos.toFixed(2)}</p>

      <h3 style={{ fontWeight: 'bold' }}>Transacciones Recientes</h3>
      <p style={{ marginTop: 0, marginBottom: '10px' }}>
        <span style={{ color: 'green', fontWeight: 'bold' }}>Pagados</span> y <span style={{ color: 'red', fontWeight: 'bold' }}>pendientes ({pendientes})</span>
      </p>

      <Table
        columns={columns}
        dataSource={transacciones}
        pagination={{ pageSize: 5 }}
        bordered={false}
        rowClassName={() => 'custom-row'}
      />
    </div>
  );
};

export default TablaFinanciera;