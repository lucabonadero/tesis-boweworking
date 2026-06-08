import { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, Spin, Button, Typography, Space, Tag, Result } from "antd";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import "../../styles/global.css";
import styles from "../../styles/public/pagoConfirmacion.module.css";

const { Title, Paragraph, Text } = Typography;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function PagoConfirmacion() {
  const [searchParams] = useSearchParams();
  const rawId = searchParams.get("idReserva");
  const resultadoMp = searchParams.get("resultado");
  const idReserva = rawId != null && String(rawId).trim() !== "" ? parseInt(String(rawId).trim(), 10) : NaN;

  const { isAuthenticated, loading: authLoading, openAuthModal, authFetch } = useAuth();
  const [loadingTx, setLoadingTx] = useState(false);
  const [tx, setTx] = useState(null);
  const [error, setError] = useState(null);

  const obtenerEstado = useCallback(async () => {
    if (!Number.isFinite(idReserva) || idReserva <= 0) return;
    setLoadingTx(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/pagos/estado/${idReserva}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTx(null);
        setError(data.message || "No se pudo obtener el estado del pago.");
        return;
      }
      setTx(data);
    } catch {
      setTx(null);
      setError("Error de red al consultar el pago.");
    } finally {
      setLoadingTx(false);
    }
  }, [authFetch, idReserva]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    if (Number.isFinite(idReserva) && idReserva > 0) obtenerEstado();
  }, [authLoading, isAuthenticated, openAuthModal, idReserva, obtenerEstado]);

  useEffect(() => {
    if (!tx || tx.EstadoPago !== "Pendiente") return;
    const t = setTimeout(() => obtenerEstado(), 3500);
    return () => clearTimeout(t);
  }, [tx, obtenerEstado]);

  const invalidId = !Number.isFinite(idReserva) || idReserva <= 0;

  let titulo = "Estado de tu pago";
  if (resultadoMp === "error") titulo = "El pago no se completó";
  else if (resultadoMp === "pendiente") titulo = "Pago pendiente de confirmación";

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <Card className={styles.card} bordered={false}>
          {invalidId ? (
            <Result
              status="warning"
              title="Falta el identificador de reserva"
              subTitle="Volvé desde el flujo de pago o revisá tu historial en el perfil."
              extra={
                <Space>
                  <Link to="/perfil">
                    <Button type="primary">Ir a mi perfil</Button>
                  </Link>
                  <Link to="/registro">
                    <Button>Nueva reserva</Button>
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
              subTitle="Necesitamos tu cuenta para consultar la transacción de forma segura."
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
                Reserva <Text strong>#{idReserva}</Text>
                {resultadoMp ? (
                  <>
                    {" "}
                    · retorno Mercado Pago:{" "}
                    <Tag color={resultadoMp === "error" ? "red" : resultadoMp === "pendiente" ? "gold" : "blue"}>
                      {resultadoMp}
                    </Tag>
                  </>
                ) : null}
              </Paragraph>

              {loadingTx && !tx ? (
                <div className={styles.centered}>
                  <Spin tip="Consultando estado en el servidor…" />
                </div>
              ) : error ? (
                <Result
                  status="error"
                  title="No pudimos cargar el estado"
                  subTitle={error}
                  extra={
                    <Button type="primary" onClick={obtenerEstado} loading={loadingTx}>
                      Reintentar
                    </Button>
                  }
                />
              ) : tx ? (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <div>
                    <Text type="secondary">Estado del cobro</Text>
                    <div>
                      <Tag
                        color={
                          tx.EstadoPago === "Pagado"
                            ? "green"
                            : tx.EstadoPago === "Rechazado"
                              ? "red"
                              : "default"
                        }
                        style={{ marginTop: 8, fontSize: 14, padding: "4px 12px" }}
                      >
                        {tx.EstadoPago || "—"}
                      </Tag>
                    </div>
                  </div>
                  {tx.MetodoPago ? (
                    <div>
                      <Text type="secondary">Método</Text>
                      <div>
                        <Text>{tx.MetodoPago}</Text>
                      </div>
                    </div>
                  ) : null}
                  <Space wrap>
                    <Button onClick={obtenerEstado} loading={loadingTx}>
                      Actualizar estado
                    </Button>
                    <Link to="/perfil">
                      <Button type="primary">Ir a mi perfil</Button>
                    </Link>
                  </Space>
                </Space>
              ) : null}
            </>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
