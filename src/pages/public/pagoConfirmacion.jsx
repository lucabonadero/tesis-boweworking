import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, Spin, Button, Typography, Space, Tag, Result } from "antd";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useInvalidarCreditos } from "../../hooks/useCreditos.js";
import "../../styles/global.css";
import styles from "../../styles/public/pagoConfirmacion.module.css";

const { Title, Paragraph, Text } = Typography;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const MENSAJE_POR_RESULTADO = {
  pendiente: "Tu pago está en proceso. Vas a ver los créditos en tu cuenta cuando se acredite.",
  error: "El pago no se completó. Podés intentarlo de nuevo desde tu cuenta.",
};
const MENSAJE_DEFAULT = "Tu compra se acreditó. Ya podés reservar con tus créditos.";

export default function PagoConfirmacion() {
  const [params] = useSearchParams();
  const compraId = params.get("compra");
  const paymentId = params.get("payment_id");
  const resultado = params.get("resultado");

  const { isAuthenticated, loading: authLoading, openAuthModal, authFetch } = useAuth();
  const invalidarCreditos = useInvalidarCreditos();
  const [verificacion, setVerificacion] = useState(null);

  useEffect(() => {
    if (!paymentId) return;

    // Se verifica sin esperar al webhook, que puede demorar unos segundos.
    authFetch(`${API_URL}/api/pagos/verificar/${paymentId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setVerificacion(data);
        if (data.estado === "acreditada") invalidarCreditos();
      })
      .catch(() => {
        /* el webhook acreditará igual: no hay nada que hacer acá */
      });
  }, [paymentId, authFetch, invalidarCreditos]);

  const invalidCompra = !compraId;

  // Un resultado explícito en la URL (falla o pendiente del checkout) siempre gana;
  // si no hay uno, se refleja lo que verificarPago realmente confirmó.
  const estadoEfectivo =
    resultado === "error" || resultado === "pendiente"
      ? resultado
      : verificacion?.estado === "acreditada"
      ? "ok"
      : verificacion?.estado === "rechazada"
      ? "error"
      : "pendiente";

  let titulo = "Estado de tu compra";
  if (estadoEfectivo === "error") titulo = "El pago no se completó";
  else if (estadoEfectivo === "pendiente") titulo = "Pago pendiente de confirmación";

  const mensaje = MENSAJE_POR_RESULTADO[estadoEfectivo] || MENSAJE_DEFAULT;

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <Card className={styles.card} bordered={false}>
          {invalidCompra ? (
            <Result
              status="warning"
              title="Falta el identificador de compra"
              subTitle="Volvé desde el flujo de compra o revisá tu historial en el perfil."
              extra={
                <Space>
                  <Link to="/perfil">
                    <Button type="primary">Ir a mi perfil</Button>
                  </Link>
                </Space>
              }
            />
          ) : authLoading ? (
            <div className={styles.centered}>
              <Spin size="large" />
            </div>
          ) : !isAuthenticated ? (
            <Result
              status="info"
              title="Iniciá sesión para ver el estado"
              subTitle="Necesitamos tu cuenta para consultar la compra de forma segura."
              extra={
                <Button type="primary" onClick={() => openAuthModal("login")}>
                  Iniciar sesión
                </Button>
              }
            />
          ) : (
            <>
              <Title level={3}>{titulo}</Title>
              <Paragraph type="secondary">
                Compra <Text strong>#{compraId}</Text>
                {resultado ? (
                  <>
                    {" "}
                    · retorno Mercado Pago:{" "}
                    <Tag color={resultado === "error" ? "red" : resultado === "pendiente" ? "gold" : "blue"}>
                      {resultado}
                    </Tag>
                  </>
                ) : null}
              </Paragraph>

              <Result
                status={estadoEfectivo === "error" ? "error" : estadoEfectivo === "pendiente" ? "info" : "success"}
                title={mensaje}
                extra={
                  <Link to="/perfil">
                    <Button type="primary">Ir a mi perfil</Button>
                  </Link>
                }
              />
            </>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
