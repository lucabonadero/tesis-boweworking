import styles from "../../styles/public/registrocliente.module.css";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import React, { useState } from "react";
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
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

const { Step } = Steps;
const { Option } = Select;

// Imágenes de los espacios
import img1 from "../../assets/espacios_sillas.png";
import img2 from "../../assets/espacios_sillones.png";
import img3 from "../../assets/oficina_individual.png";
import img4 from "../../assets/salareuniones.png";
import img5 from "../../assets/terrazarda.png";
import img6 from "../../assets/espacios_plantabaja.png";

// Datos de los espacios
const espacios = [
  { titulo: "Bancos - $0.99", valor: "bancos", imagen: img1, descripcion: "Espacio con bancos cómodos para trabajar." },
  { titulo: "Sillones - ", valor: "sillones", imagen: img2, descripcion: "Ambiente relajado con sillones amplios." },
  { titulo: "Oficina Individual - ", valor: "oficina-individual", imagen: img3, descripcion: "Oficina privada para una persona." },
  { titulo: "Sala de Reuniones - ", valor: "sala-de-reuniones", imagen: img4, descripcion: "Sala ideal para reuniones grupales." },
  { titulo: "Terraza - ", valor: "terraza", imagen: img5, descripcion: "Espacio al aire libre en la terraza." },
  { titulo: "Planta Baja - ", valor: "planta-baja", imagen: img6, descripcion: "Zona común en la planta baja." },
];

export default function RegistroCliente() {
  const [current, setCurrent] = useState(0);
  const [selectedEspacio, setSelectedEspacio] = useState(null);
  const [form] = Form.useForm();

  

  const prev = () => setCurrent(current - 1);

  const onFinish = (values) => {
    console.log("Reserva enviada:", { ...values, espacio: selectedEspacio.titulo });
    message.success("¡Reserva enviada con éxito!");
    setCurrent(2);
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
      content: (
        <Row gutter={[16, 16]} justify="center">
          {espacios.map((espacio, index) => (
            <Col xs={24} sm={12} md={8} key={index}>
              <Card
                hoverable
                className={styles.cardFullHeight}
                onClick={() => handleEspacioClick(espacio)}
                cover={<img alt={espacio.titulo} src={espacio.imagen} className={styles.espacioImagen} />}
              >
                <Card.Meta title={espacio.titulo} description={espacio.descripcion} />
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
            <img src={selectedEspacio.imagen} alt={selectedEspacio.titulo} />
            <div>
              <h3>{selectedEspacio.titulo}</h3>
              <p>{selectedEspacio.descripcion}</p>
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            className={styles.formulario}
          >
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

            <Form.Item
              name="duracion"
              label="Duración"
              rules={[{ required: true }]}
            >
              <Select>
                <Option value="1">1 hora</Option>
                <Option value="2">2 horas</Option>
                <Option value="3">3 horas</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="cantidad"
              label="Cantidad de personas"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>

            <div className={styles.botones}>
              <Button icon={<ArrowLeftOutlined />} onClick={prev} />
              <Button type="primary" htmlType="submit">
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