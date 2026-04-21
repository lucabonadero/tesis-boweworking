import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Form, Input, Button, message, Result } from "antd";
import { MailOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import styles from "../../styles/public/authRecovery.module.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function OlvideContrasena() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async ({ email }) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/cliente/recuperacion/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "No se pudo procesar la solicitud");
        return;
      }
      message.success(data.message || "Revisá tu correo");
      setSent(true);
    } catch {
      message.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header />
      <main className={styles.wrapper}>
        <div className={styles.card}>
          {sent ? (
            <>
              <Result
                status="success"
                title="Solicitud registrada"
                subTitle="Si el correo tiene una cuenta con contraseña, recibirás un enlace. Revisá también la carpeta de spam."
              />
              <Link to="/" className={styles.back}>
                <ArrowLeftOutlined /> Volver al inicio
              </Link>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Olvidé mi contraseña</h1>
              <p className={styles.sub}>
                Ingresá el email de tu cuenta. Te enviaremos un enlace seguro (válido por 1 hora) para elegir una nueva contraseña.
              </p>
              <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item
                  name="email"
                  rules={[{ required: true, type: "email", message: "Ingresá un email válido" }]}
                >
                  <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ background: "#34c08f", borderColor: "#34c08f" }}>
                  Enviar enlace
                </Button>
              </Form>
              <p className={styles.hint}>
                Si tu cuenta es solo con Google, no recibirás correo: en ese caso iniciá sesión con el botón de Google.
              </p>
              <Link to="/" className={styles.back}>
                <ArrowLeftOutlined /> Volver al inicio
              </Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
