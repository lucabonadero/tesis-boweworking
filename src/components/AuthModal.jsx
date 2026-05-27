import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal, Form, Input, Button, message } from "antd";
import { LockOutlined, MailOutlined, UserOutlined, IdcardOutlined, PhoneOutlined } from "@ant-design/icons";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "../styles/components/authmodal.module.css";

export default function AuthModal() {
  const {
    authModalOpen,
    authModalView,
    closeAuthModal,
    openAuthModal,
    login,
    register,
    googleAuth,
    completarPerfil,
    user,
  } = useAuth();

  const [loading, setLoading] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const navigate = useNavigate();

  const view = authModalView;

  const isStaffRol = (rol) => rol === "admin" || rol === "empleado" || rol === "staff";

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const usr = await login(values.email, values.password);
      message.success(`Bienvenido/a, ${usr.nombre}!`);
      loginForm.resetFields();
      if (isStaffRol(usr.rol)) {
        closeAuthModal();
        navigate("/panel");
      } else if (!usr.perfil_completo) {
        openAuthModal("completar-perfil");
      } else {
        closeAuthModal();
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    if (values.password !== values.confirmPassword) {
      message.error("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const usr = await register({
        email: values.email,
        password: values.password,
        nombre: values.nombre,
        apellido: values.apellido,
        dni: values.dni,
        telefono: values.telefono,
      });
      message.success(`Cuenta creada. Bienvenido/a, ${usr.nombre}!`);
      registerForm.resetFields();
      closeAuthModal();
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credentialResponse) => {
    if (!credentialResponse?.credential) {
      message.warning("Inicio de sesión con Google cancelado o incompleto.");
      return;
    }
    setLoading(true);
    try {
      const usr = await googleAuth(credentialResponse.credential);
      if (isStaffRol(usr.rol)) {
        message.success(`Bienvenido/a, ${usr.nombre}!`);
        closeAuthModal();
        navigate("/panel");
      } else if (!usr.perfil_completo) {
        message.info("Completá tu perfil para poder reservar.");
        openAuthModal("completar-perfil");
      } else {
        message.success(`Bienvenido/a, ${usr.nombre}!`);
        closeAuthModal();
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProfile = async (values) => {
    setLoading(true);
    try {
      const usr = await completarPerfil(values.dni, values.telefono);
      message.success(`Perfil completado. Bienvenido/a, ${usr.nombre}!`);
      profileForm.resetFields();
      closeAuthModal();
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderLogin = () => (
    <div className={styles.authForm}>
      <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
        <Form.Item name="email" rules={[{ required: true, type: "email", message: "Email válido requerido" }]}>
          <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: "Ingresá tu contraseña" }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="Contraseña" size="large" />
        </Form.Item>
        <div className={styles.forgotRow}>
          <Link to="/olvide-contrasena" className={styles.forgotLink} onClick={closeAuthModal}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Button htmlType="submit" className={styles.submitBtn} loading={loading}>
          Iniciar sesión
        </Button>
      </Form>

      <div className={styles.divider}>
        <div className={styles.dividerLine} />
        <span>o continuá con</span>
        <div className={styles.dividerLine} />
      </div>
      <div className={styles.googleRow}>
        <GoogleLogin
          onSuccess={handleGoogle}
          onError={() => message.error("Error con Google. Revisá VITE_GOOGLE_CLIENT_ID y la consola del navegador.")}
          shape="pill"
          width="100%"
        />
      </div>

      <div className={styles.footerLink}>
        ¿No tenés cuenta?
        <button type="button" onClick={() => openAuthModal("register")}>
          Registrate
        </button>
      </div>
    </div>
  );

  const renderRegister = () => (
    <div className={styles.authForm}>
      <Form form={registerForm} layout="vertical" onFinish={handleRegister}>
        <Form.Item name="dni" rules={[{ required: true, message: "Ingresá tu DNI" }]}>
          <Input prefix={<IdcardOutlined />} placeholder="DNI" size="large" />
        </Form.Item>
        <Form.Item name="nombre" rules={[{ required: true, message: "Ingresá tu nombre" }]}>
          <Input prefix={<UserOutlined />} placeholder="Nombre" size="large" />
        </Form.Item>
        <Form.Item name="apellido" rules={[{ required: true, message: "Ingresá tu apellido" }]}>
          <Input prefix={<UserOutlined />} placeholder="Apellido" size="large" />
        </Form.Item>
        <Form.Item name="email" rules={[{ required: true, type: "email", message: "Email válido requerido" }]}>
          <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
        </Form.Item>
        <Form.Item name="telefono" rules={[{ required: true, message: "Ingresá tu teléfono" }]}>
          <Input prefix={<PhoneOutlined />} placeholder="Teléfono" size="large" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, min: 6, message: "Mínimo 6 caracteres" }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="Contraseña" size="large" />
        </Form.Item>
        <Form.Item name="confirmPassword" rules={[{ required: true, message: "Confirmá tu contraseña" }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="Confirmar contraseña" size="large" />
        </Form.Item>
        <Button htmlType="submit" className={styles.submitBtn} loading={loading}>
          Crear cuenta
        </Button>
      </Form>

      <div className={styles.divider}>
        <div className={styles.dividerLine} />
        <span>o continuá con</span>
        <div className={styles.dividerLine} />
      </div>
      <div className={styles.googleRow}>
        <GoogleLogin
          onSuccess={handleGoogle}
          onError={() => message.error("Error con Google. Revisá VITE_GOOGLE_CLIENT_ID y la consola del navegador.")}
          shape="pill"
        />
      </div>

      <div className={styles.footerLink}>
        ¿Ya tenés cuenta?
        <button type="button" onClick={() => openAuthModal("login")}>
          Iniciá sesión
        </button>
      </div>
    </div>
  );

  const renderCompleteProfile = () => (
    <div className={styles.authForm}>
      <p className={styles.profileTitle}>Completá tu perfil</p>
      <p className={styles.profileSub}>Necesitamos estos datos para que puedas reservar.</p>

      {user && (
        <div className={styles.profileUser}>
          <div className={styles.profileUserName}>{user.nombre} {user.apellido}</div>
          <div className={styles.profileUserEmail}>{user.email}</div>
        </div>
      )}

      <Form form={profileForm} layout="vertical" onFinish={handleProfile}>
        <Form.Item name="dni" rules={[{ required: true, message: "Ingresá tu DNI" }]}>
          <Input prefix={<IdcardOutlined />} placeholder="DNI" size="large" />
        </Form.Item>
        <Form.Item name="telefono" rules={[{ required: true, message: "Ingresá tu teléfono" }]}>
          <Input prefix={<PhoneOutlined />} placeholder="Teléfono" size="large" />
        </Form.Item>
        <Button htmlType="submit" className={styles.submitBtn} loading={loading}>
          Guardar
        </Button>
      </Form>
    </div>
  );

  const showTabs = view === "login" || view === "register";

  return (
    <Modal
      open={authModalOpen}
      onCancel={view === "completar-perfil" ? undefined : closeAuthModal}
      footer={null}
      closable={view !== "completar-perfil"}
      maskClosable={view !== "completar-perfil"}
      width={420}
      centered
      destroyOnClose
    >
      <div className={styles.modalBody}>
        {showTabs && (
          <div className={styles.tabRow}>
            <button
              type="button"
              className={[styles.tabBtn, view === "login" ? styles.tabBtnActive : ""].join(" ")}
              onClick={() => openAuthModal("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={[styles.tabBtn, view === "register" ? styles.tabBtnActive : ""].join(" ")}
              onClick={() => openAuthModal("register")}
            >
              Crear cuenta
            </button>
          </div>
        )}

        {view === "login" && renderLogin()}
        {view === "register" && renderRegister()}
        {view === "completar-perfil" && renderCompleteProfile()}
      </div>
    </Modal>
  );
}
