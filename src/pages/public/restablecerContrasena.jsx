import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Form, Input, Button, message, Spin, Result } from "antd";
import { LockOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import "../../styles/global.css";
import styles from "../../styles/public/authRecovery.module.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function RestablecerContrasena() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const { setAuthSession } = useAuth();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setValid(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/auth/cliente/recuperacion/validar?token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setValid(Boolean(data.valid));
        }
      } catch {
        if (!cancelled) setValid(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onFinish = async ({ password, confirmPassword }) => {
    if (password !== confirmPassword) {
      message.error("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/cliente/recuperacion/restablecer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "No se pudo actualizar la contraseña");
        return;
      }
      message.success(data.message || "Listo");
      if (data.token && data.usuario) {
        setAuthSession(data.token, data.usuario);
      }
      navigate("/perfil", { replace: true });
    } catch {
      message.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  let body;
  if (checking) {
    body = (
      <div style={{ textAlign: "center", padding: "2rem 0" }}>
        <Spin size="large" />
        <p style={{ marginTop: 16, color: "#666" }}>Verificando enlace…</p>
      </div>
    );
  } else if (!token || !valid) {
    body = (
      <>
        <Result
          status="warning"
          title="Enlace inválido o vencido"
          subTitle="Solicitá un nuevo enlace desde «Olvidé mi contraseña»."
        />
        <Link to="/olvide-contrasena" className={styles.back}>
          Solicitar nuevo enlace
        </Link>
        <Link to="/" className={styles.back} style={{ display: "block", marginTop: 8 }}>
          <ArrowLeftOutlined /> Inicio
        </Link>
      </>
    );
  } else {
    body = (
      <>
        <h1 className={styles.title}>Nueva contraseña</h1>
        <p className={styles.sub}>Elegí una contraseña segura (mínimo 8 caracteres).</p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="password"
            rules={[{ required: true, min: 8, message: "Mínimo 8 caracteres" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Nueva contraseña" size="large" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            rules={[{ required: true, message: "Confirmá la contraseña" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Repetir contraseña" size="large" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            style={{ background: "#34c08f", borderColor: "#34c08f" }}
          >
            Guardar e iniciar sesión
          </Button>
        </Form>
      </>
    );
  }

  return (
    <div>
      <Header />
      <main className={styles.wrapper}>
        <div className={styles.card}>{body}</div>
      </main>
      <Footer />
    </div>
  );
}
