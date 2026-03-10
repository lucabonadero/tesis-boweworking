import styles from "../../styles/public/registrocliente.module.css";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import React, { useState, useEffect } from "react";
import {
  Steps,
  Button,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Card,
  Row,
  Col,
  message,
  Spin,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

const { Step } = Steps;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Imágenes de los espacios (fallback)
import img1 from "../../assets/espacios_sillas.png";
import img2 from "../../assets/espacios_sillones.png";
import img3 from "../../assets/oficina_individual.png";
import img4 from "../../assets/salareuniones.png";
import img5 from "../../assets/terrazarda.png";
import img6 from "../../assets/espacios_plantabaja.png";

const imagenesDefault = [img1, img2, img3, img4, img5, img6];

export default function RegistroCliente() {
  const [current, setCurrent] = useState(0);
  const [selectedEspacio, setSelectedEspacio] = useState(null);
  const [espacios, setEspacios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const fetchEspacios = async () => {
      try {
        const res = await fetch(`${API_URL}/api/espacios`);
        const data = await res.json();
        const mapped = data.map((e, i) => ({
          ...e,
          imagen: imagenesDefault[i % imagenesDefault.length],
        }));
        setEspacios(mapped);
      } catch {
        message.error("Error al cargar espacios");
      } finally {
        setLoading(false);
      }
    };
    fetchEspacios();
  }, []);

  const prev = () => setCurrent(current - 1);

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      // 1. Crear o verificar cliente
      const clienteRes = await fetch(`${API_URL}/api/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DNI: values.dni,
          Nombre: values.nombre,
          Apellido: values.apellido,
          Email: values.email,
        }),
      });

      if (!clienteRes.ok) {
        const err = await clienteRes.json();
        // Si ya existe el cliente, no es error grave
        if (!err.message?.includes('duplicate')) {
          console.warn("Cliente posiblemente ya existe:", err.message);
        }
      }

      // 2. Crear reserva
      const fechaObj = values.fecha;
      const reservaRes = await fetch(`${API_URL}/api/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DNI: values.dni,
          Nombre: `${values.nombre} ${values.apellido}`,
          idEspacio: selectedEspacio.Espacio,
          HorarioReserva: fechaObj.format("HH:mm"),
          Monto: 0,
          DiaReserva: fechaObj.format("YYYY-MM-DD"),
        }),
      });

      if (!reservaRes.ok) {
        const err = await reservaRes.json();
        message.error(err.message || "Error al crear reserva");
        return;
      }

      message.success("¡Reserva enviada con éxito!");
      setCurrent(2);
    } catch {
      message.error("Error al conectar con el servidor");
    } finally {
      setSubmitting(false);
    }
  };
const handleEspacioClick = (espacio) => {
  setSelectedEspacio(espacio);
  setTimeout(() => {
    setCurrent(1);
  }, 0);
};
  const steps = [
    {
      title: "Elegir espacio",
      content: loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}><Spin size="large" /></div>
      ) : (
        <Row gutter={[16, 16]} justify="center">
          {espacios.map((espacio, index) => (
            <Col xs={24} sm={12} md={8} key={espacio.Espacio || index}>
              <Card
                hoverable
                className={styles.cardFullHeight}
                onClick={() => handleEspacioClick(espacio)}
                cover={<img alt={espacio.Nombre} src={espacio.imagen} className={styles.espacioImagen} />}
              >
                <Card.Meta
                  title={espacio.Nombre}
                  description={`Capacidad: ${espacio.Capacidad} personas${espacio.Disponible === false ? ' - No disponible' : ''}`}
                />
              </Card>
            </Col>
          ))}
        </Row>
      ),
    },
    {
      title: "Completar datos",
      content: selectedEspacio ? (
        <>
          <div className={styles.espacioSeleccionado}>
            <img src={selectedEspacio.imagen} alt={selectedEspacio.Nombre} />
            <div>
              <h3>{selectedEspacio.Nombre}</h3>
              <p>Capacidad: {selectedEspacio.Capacidad} personas</p>
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            className={styles.formulario}
          >
            <Form.Item
              name="dni"
              label="DNI"
              rules={[{ required: true, message: "Por favor ingresa tu DNI" }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="nombre"
              label="Nombre"
              rules={[{ required: true, message: "Por favor ingresa tu nombre" }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="apellido"
              label="Apellido"
              rules={[{ required: true, message: "Por favor ingresa tu apellido" }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="email"
              label="Correo Electrónico"
              rules={[{ required: true, type: "email" }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="fecha"
              label="Fecha y Hora de la Visita"
              rules={[{ required: true }]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                style={{ width: "100%" }}
              />
            </Form.Item>

            <div className={styles.botones}>
              <Button icon={<ArrowLeftOutlined />} onClick={prev} />
              <Button type="primary" htmlType="submit" loading={submitting}>
                Reservar
              </Button>
            </div>
          </Form>
        </>
      ) : (
        <p>Error: no se ha seleccionado un espacio.</p>
      ),
    },
    {
      title: "Confirmación",
      content: (
        <div className={styles.confirmacion}>
          ¡Gracias por tu reserva! Te contactaremos pronto.
        </div>
      ),
    },
  ];

  return (
    <div>
      <Header />
      <main className={styles.wrapper}>
        <h1 className={styles.mainHeader}>
          Reserva tu <span className={styles.textEspacio}>Espacio</span>
        </h1>
        <Steps current={current} className={styles.steps}>
          {steps.map((item) => (
            <Step key={item.title} title={item.title} />
          ))}
        </Steps>
        <div className={styles.stepContent}>{steps[current].content}</div>
      </main>
      <Footer />
    </div>
  );
}