import { useState } from 'react';
import {
  Layout, Typography, Button, Select, InputNumber, Radio, Form, Row, Col, Card, Statistic, Divider,
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

export default function GestionFinanciera() {
  const [form] = Form.useForm();

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
      <Form form={form} layout="vertical">
        <Form.Item label="Cliente" name="cliente" rules={[{ required: true }]}>
          <Select placeholder="Seleccionar cliente">
            <Option value="cliente1">Matías Dutto</Option>
            <Option value="cliente2">Esteban Belcuore</Option>
          </Select>
        </Form.Item>

        <Form.Item label="Monto" name="monto" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="Método de pago" name="metodo" rules={[{ required: true }]}>
          <Select placeholder="Seleccionar método">
            <Option value="qr">QR</Option>
            <Option value="efectivo">Efectivo</Option>
            <Option value="tarjeta">Tarjeta</Option>
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
                value={5423}
                prefix={<DollarOutlined />}
                valueStyle={{ color: '#52c41a' }}
                suffix={<Text type="success"><ArrowUpOutlined /> 16% este mes</Text>}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card style={{ borderRadius: '16px', textAlign: 'center' }}>
              <Statistic
                title="Balance"
                value={1893}
                prefix={<SyncOutlined />}
                valueStyle={{ color: '#faad14' }}
                suffix={<Text type="danger"><ArrowDownOutlined /> 1% este mes</Text>}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card style={{ borderRadius: '16px', textAlign: 'center' }}>
              <Statistic
                title="Pagos pendientes"
                value={16}
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
