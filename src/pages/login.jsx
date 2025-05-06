import { Form, Input, Button, Typography, Card, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/login.module.css'; // Importa el archivo CSS para estilos
import 'antd/dist/reset.css';
const { Title } = Typography;

export default function Login() {
  const navigate = useNavigate();

const onFinish = ({ email, password }) => {
  console.log('Intento de login:', email, password);
  if (email === 'admin@bowe.com' && password === 'admin123') {
    navigate('/control');
  } else {
    message.error('Credenciales incorrectas');
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
            <Button type="primary" htmlType="submit" className={styles.submitButton}>
              Ingresar
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}