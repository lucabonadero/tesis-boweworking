import { Form, Input, Button, Typography, Card, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import styles from '../../styles/admin/login.module.css';
import 'antd/dist/reset.css';
const { Title } = Typography;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

const onFinish = async ({ email, password }) => {
  setLoading(true);
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      message.error(data.message || 'Credenciales incorrectas');
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    message.success('Inicio de sesión exitoso');
    navigate('/control');
  } catch {
    message.error('Error al conectar con el servidor');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className={styles.loginContainer}>
      <Card className={styles.loginCard} bordered={false}>
        <Title level={3} className={styles.title}>Ingreso de empleados</Title>
        <Form
          layout="vertical"
          name="login-form"
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            label="Correo electrónico"
            name="email"
            className={styles.formItem}
            rules={[{ required: true, message: 'Por favor ingrese su email' }]}
          >
            <Input placeholder="ejemplo@correo.com" />
          </Form.Item>

          <Form.Item
            label="Contraseña"
            name="password"
            className={styles.formItem}
            rules={[{ required: true, message: 'Por favor ingrese su contraseña' }]}
          >
            <Input.Password placeholder="••••••••" />
          </Form.Item>

          <Form.Item className={styles.formItem}>
            <Button type="primary" htmlType="submit" className={styles.submitButton} loading={loading}>
              Ingresar
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}