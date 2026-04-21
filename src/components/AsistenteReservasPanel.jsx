import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { notifyReservasChanged } from "../utils/boweSync.js";
import styles from "../styles/public/asistenteReservas.module.css";
import { Button, Input, message, Spin, Empty, Alert, Tag } from "antd";
import {
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const PROMPTS_RAPIDOS = [
  "Reunión para 4 personas mañana por la mañana",
  "Sala grande para equipo esta semana",
  "Espacio tranquilo hoy a la tarde",
  "Sala de reuniones el viernes por la tarde",
];

export default function AsistenteReservasPanel({
  autoPromptLogin = false,
  showPageHeading = true,
}) {
  const { user, isAuthenticated, loading: authLoading, openAuthModal, authFetch, isStaff } =
    useAuth();
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [mensajeEnviado, setMensajeEnviado] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (!autoPromptLogin || authLoading) return;
    if (!isAuthenticated) openAuthModal("login");
  }, [authLoading, isAuthenticated, openAuthModal, autoPromptLogin]);

  useEffect(() => {
    if (resultado && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [resultado]);

  const enviar = async () => {
    if (!texto.trim()) {
      message.warning("Escribí qué necesitás reservar.");
      return;
    }
    const trimmed = texto.trim();
    setMensajeEnviado(trimmed);
    setLoading(true);
    setResultado(null);
    try {
      const res = await authFetch(`${API_URL}/api/ai/sugerir-reserva`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: trimmed, diasVentana: 5 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al obtener sugerencias");
      }
      setResultado(data);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmar = async (s) => {
    if (!user?.dni) {
      message.error("Necesitás tener DNI cargado en tu perfil para reservar.");
      return;
    }
    const nombre = `${user.nombre || ""} ${user.apellido || ""}`.trim() || user.email;
    setConfirmandoId(`${s.idRecurso}-${s.fecha}-${s.horaInicio}`);
    try {
      const res = await authFetch(`${API_URL}/api/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          DNI: user.dni,
          Nombre: nombre,
          idRecurso: s.idRecurso,
          DiaReserva: s.fecha,
          HorarioReserva: s.horaInicio,
          HorarioFin: s.horaFin,
          TipoReserva: "turno",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "No se pudo confirmar (puede que otro usuario haya reservado ese horario).");
      }
      message.success("Reserva creada. La disponibilidad fue validada en el servidor.");
      notifyReservasChanged();
      setResultado((prev) =>
        prev
          ? {
              ...prev,
              sugerenciasValidadas: (prev.sugerenciasValidadas || []).filter(
                (x) =>
                  !(
                    x.idRecurso === s.idRecurso &&
                    x.fecha === s.fecha &&
                    x.horaInicio === s.horaInicio
                  )
              ),
            }
          : prev
      );
    } catch (e) {
      message.error(e.message);
    } finally {
      setConfirmandoId(null);
    }
  };

  const limpiarBusqueda = () => {
    setTexto("");
    setResultado(null);
    setMensajeEnviado(null);
  };

  const aplicarPrompt = (p) => {
    setTexto(p);
  };

  if (authLoading) {
    return (
      <div className={styles.panelLoading}>
        <div className={styles.pulseRing} aria-hidden>
          <RobotOutlined className={styles.loadingBot} />
        </div>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.panelGate}>
        <div className={styles.gateIcon}>
          <RobotOutlined />
        </div>
        <p className={styles.gateText}>Iniciá sesión para usar el asistente.</p>
        <Button type="primary" size="large" className={styles.gateBtn} onClick={() => openAuthModal("login")}>
          Iniciar sesión
        </Button>
      </div>
    );
  }

  if (isStaff) {
    return (
      <Alert
        type="info"
        showIcon
        message="Asistente para clientes"
        description="Iniciá sesión con una cuenta de cliente para probar sugerencias y confirmar reservas."
        className={styles.adminAlert}
      />
    );
  }

  const sugerencias = resultado?.sugerenciasValidadas || [];
  const nombreCorto = user?.nombre?.split?.(" ")?.[0] || "";

  return (
    <div
      className={`${styles.panelInner} ${showPageHeading ? styles.panelFull : styles.panelCompact}`}
    >
      {showPageHeading ? (
        <header className={styles.hero}>
          <div className={styles.heroVisual}>
            <span className={styles.heroGlow} aria-hidden />
            <RobotOutlined className={styles.heroIcon} />
          </div>
          <h1 className={styles.title}>Asistente de reservas</h1>
          <p className={styles.lead}>
            Escribí como si le hablaras a una persona: fechas, cantidad de gente y tipo de espacio. Solo
            te mostramos horarios que existen en el sistema.
          </p>
          <div className={styles.pills}>
            <span className={styles.pill}>
              <ThunderboltOutlined /> IA + datos en vivo
            </span>
            <span className={styles.pill}>
              <CheckCircleOutlined /> Confirmación validada
            </span>
          </div>
        </header>
      ) : (
        <div className={styles.compactHeader}>
          <RobotOutlined className={styles.compactIcon} />
          <div>
            <p className={styles.compactHi}>{nombreCorto ? `Hola, ${nombreCorto}` : "Hola"}</p>
            <p className={styles.compactSub}>¿Qué querés reservar?</p>
          </div>
        </div>
      )}

      <section className={styles.chipsSection}>
        <span className={styles.chipsLabel}>Probar con</span>
        <div className={styles.chips}>
          {PROMPTS_RAPIDOS.map((p) => (
            <Tag
              key={p}
              className={`${styles.chip} ${loading ? styles.chipDisabled : ""}`}
              onClick={() => !loading && aplicarPrompt(p)}
            >
              {p}
            </Tag>
          ))}
        </div>
      </section>

      <section className={styles.composer}>
        <TextArea
          className={styles.textarea}
          rows={showPageHeading ? 4 : 3}
          placeholder="Ej: Somos 6 y necesitamos reunirnos mañana después del mediodía…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <p className={styles.enterHint}>Enter para enviar · Shift+Enter para salto de línea</p>
        <div className={styles.actions}>
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={enviar}
            loading={loading}
            className={styles.sendBtn}
          >
            Pedir sugerencias
          </Button>
          <Button
            size="large"
            icon={<ReloadOutlined />}
            onClick={limpiarBusqueda}
            disabled={loading}
          >
            Empezar de nuevo
          </Button>
        </div>
      </section>

      {(mensajeEnviado || loading) && (
        <section className={styles.thread} aria-live="polite">
          <div className={styles.bubbleUser}>
            <span className={styles.bubbleLabel}>Tu pedido</span>
            <p>{mensajeEnviado}</p>
          </div>

          {loading && (
            <div className={styles.bubbleAssistant}>
              <span className={styles.bubbleLabel}>
                <RobotOutlined /> Asistente
              </span>
              <div className={styles.typing}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.typingText}>Buscando disponibilidad…</span>
              </div>
            </div>
          )}
        </section>
      )}

      {resultado && !loading && (
        <div ref={resultRef} className={styles.result}>
          <div className={styles.bubbleAssistant}>
            <span className={styles.bubbleLabel}>
              <RobotOutlined /> Asistente
            </span>
            <p className={styles.mensaje}>{resultado.mensajeAmigable}</p>
            {resultado.preguntaAclaratoria && (
              <Alert className={styles.clarifyAlert} type="warning" message={resultado.preguntaAclaratoria} showIcon />
            )}
          </div>

          {sugerencias.length === 0 ? (
            <Empty
              description="No hay opciones disponibles con esos criterios"
              className={styles.empty}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <>
              <h2 className={styles.suggestionsTitle}>
                <CalendarOutlined /> Opciones para vos
              </h2>
              <ul className={styles.list}>
                {sugerencias.map((s, i) => (
                  <li
                    key={`${s.idRecurso}-${s.fecha}-${s.horaInicio}`}
                    className={styles.suggestionLi}
                    style={{ animationDelay: `${i * 0.06}s` }}
                  >
                    <div className={styles.suggestionCard}>
                      <div className={styles.suggestionIndex}>{i + 1}</div>
                      <div className={styles.suggestionBody}>
                        <div className={styles.suggestionHead}>
                          <strong>{s.etiquetaRecurso}</strong>
                          <span className={styles.badge}>{s.espacioNombre}</span>
                        </div>
                        <p className={styles.slot}>
                          <CalendarOutlined className={styles.slotIcon} />
                          {s.fecha} · {s.horaInicio} – {s.horaFin}
                        </p>
                        {s.motivo && <p className={styles.motivo}>{s.motivo}</p>}
                        {s.precioHora != null && (
                          <p className={styles.precio}>Referencia ${s.precioHora} / hora</p>
                        )}
                        <Button
                          type="primary"
                          block
                          size="large"
                          className={styles.confirmBtn}
                          loading={confirmandoId === `${s.idRecurso}-${s.fecha}-${s.horaInicio}`}
                          onClick={() => confirmar(s)}
                          disabled={!user?.dni}
                          icon={<CheckCircleOutlined />}
                        >
                          Confirmar esta reserva
                        </Button>
                        {!user?.dni && (
                          <p className={styles.hint}>Cargá tu DNI en el perfil para confirmar.</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
