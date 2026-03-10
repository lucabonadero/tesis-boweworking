import { useState, useEffect } from 'react';
import {
  Layout, Typography, Button, Select, InputNumber, Radio, Form, Row, Col, Card, Statistic, Divider,
  message,
} from 'antd';
import {
  DollarOutlined, SyncOutlined, WalletOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import Header from '../../components/header';
import Footer from '../../components/footer';
import TablaFinanciera from '../../components/tablafinanciera';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const getToken = () => localStorage.getItem('token');

export default function GestionFinanciera() {
  const [form] = Form.useForm();
  const [reservas, setReservas] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resReservas, resTrans] = await Promise.all([
          fetch(`${API_URL}/api/reservas`, { headers: { Authorization: `Bearer ${getToken()}` } }),
          fetch(`${API_URL}/api/pagos`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        ]);
        setReservas(await resReservas.json());
        setTransacciones(await resTrans.json());
      } catch {
        message.error("Error al cargar datos");
      }
    };
    fetchData();
  }, []);

  const totalIngresos = transacciones
    .filter(t => t.EstadoPago === 'Pagado')
    .reduce((sum, t) => sum + (parseFloat(t.Monto) || 0), 0);

  const pendientes = transacciones.filter(t => t.EstadoPago === 'Pendiente').length;

  const onRegistrarPago = async (values) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/pagos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          idReserva: values.reserva,
          MetodoPago: values.metodo,
          EstadoPago: values.estado === 'pagado' ? 'Pagado' : 'Pendiente',
        }),
      });
      if (!res.ok) throw new Error();
      message.success("Pago registrado exitosamente");
      form.resetFields();
      // Re-fetch transactions
      const resTrans = await fetch(`${API_URL}/api/pagos`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setTransacciones(await resTrans.json());
    } catch {
      message.error("Error al registrar pago");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header isEmpleado={true} />
      <Content style={{ padding: '2rem', backgroundColor: '#f9f9f9' }}>
        <Title level={2} style={{ marginBottom: '1.5rem' }}>Gestión Financiera</Title>

<Row gutter={16} align="top">
  {/* Col izquierda con botones y tabla */}
  <Col span={14}>
    <div style={{ paddingLeft: '24px' }}>
      {/* Botones alineados con la tabla */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <Button type="primary" style={{ backgroundColor: '#69c187', borderColor: '#69c187' }}>
          Resumen Diario
        </Button>
        <Button type="primary" style={{ backgroundColor: '#69c187', borderColor: '#69c187' }}>
          Resumen Semanal
        </Button>
        <Button type="primary" style={{ backgroundColor: '#69c187', borderColor: '#69c187' }}>
          Resumen Mensual
        </Button>
      </div>

      {/* Tabla */}
      <TablaFinanciera />
    </div>
  </Col>

  <Col span={10} style={{ marginTop: '-8px' }}>
    <Card
      title={<Text strong style={{ fontSize: '16px' }}>Registrar un pago</Text>}
      bordered={false}
      style={{
        borderRadius: '16px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
      }}
      bodyStyle={{ padding: '24px' }}
    >
      <Form form={form} layout="vertical" onFinish={onRegistrarPago}>
        <Form.Item label="Reserva" name="reserva" rules={[{ required: true }]}>
          <Select placeholder="Seleccionar reserva">
            {reservas.map((r) => (
              <Option key={r.idReserva} value={r.idReserva}>
                {r.Nombre} - {r.espacio_nombre || `Espacio ${r.idEspacio}`} ({r.DiaReserva ? new Date(r.DiaReserva).toLocaleDateString() : ''})
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="Método de pago" name="metodo" rules={[{ required: true }]}>
          <Select placeholder="Seleccionar método">
            <Option value="QR">QR</Option>
            <Option value="Efectivo">Efectivo</Option>
            <Option value="Tarjeta">Tarjeta</Option>
          </Select>
        </Form.Item>

        <Form.Item label="Estado del pago" name="estado" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="pagado" style={{ color: '#52c41a' }}>Pagado</Radio>
            <Radio value="pendiente" style={{ color: '#f5222d' }}>Pendiente</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={submitting}
            style={{ backgroundColor: '#69c187', borderColor: '#69c187' }}
          >
            Registrar Pago
          </Button>
        </Form.Item>
      </Form>
    </Card>
  </Col>
</Row>

        <Divider style={{ margin: '2rem 0' }} />

        <Row gutter={32} justify="center">
          <Col span={6}>
            <Card style={{ borderRadius: '16px', textAlign: 'center' }}>
              <Statistic
                title="Total Ingresos"
                value={totalIngresos}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card style={{ borderRadius: '16px', textAlign: 'center' }}>
              <Statistic
                title="Total Transacciones"
                value={transacciones.length}
                prefix={<SyncOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card style={{ borderRadius: '16px', textAlign: 'center' }}>
              <Statistic
                title="Pagos pendientes"
                value={pendientes}
                prefix={<WalletOutlined />}
                valueStyle={{ color: '#f5222d' }}
              />
            </Card>
          </Col>
        </Row>
      </Content>
      <Footer isEmpleado={true} />
    </Layout>
  );
}
