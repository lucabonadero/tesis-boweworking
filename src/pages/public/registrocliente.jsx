import styles from "../../styles/public/registrocliente.module.css";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  Steps,
  Button,
  Select as AntSelect,
  DatePicker,
  TimePicker,
  Row,
  Col,
  message,
  Result,
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ExpandAltOutlined,
  CheckCircleOutlined,
  UserOutlined,
  CreditCardOutlined,
  CalendarOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  LockOutlined,
} from "@ant-design/icons";

const { Step } = Steps;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

import img1 from "../../assets/espacios_sillas.png";
import img2 from "../../assets/espacios_sillones.png";
import img3 from "../../assets/oficina_individual.png";
import img4 from "../../assets/salareuniones.png";
import img5 from "../../assets/terrazarda.png";
import img6 from "../../assets/espacios_plantabaja.png";

const espacioImageMap = {
  "Planta Baja": img6,
  "Primer Piso": img3,
  Terraza: img5,
};
const fallbackImages = [img1, img2, img3, img4, img5, img6];

export default function RegistroCliente() {
  const { isAuthenticated, perfilCompleto, user, openAuthModal, loading: authLoading, authFetch } = useAuth();

  const [activeTab, setActiveTab] = useState("turno");
  const [step, setStep] = useState(0);

  const [disponibilidad, setDisponibilidad] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [loadingDispo, setLoadingDispo] = useState(false);
  const [selectedRecurso, setSelectedRecurso] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reservaCreada, setReservaCreada] = useState(null);

  const [turnoFecha, setTurnoFecha] = useState(null);
  const [turnoHora, setTurnoHora] = useState(null);
  const [turnoDuracion, setTurnoDuracion] = useState(null);

  const [packTipo, setPackTipo] = useState(null);
  const [packFechaInicio, setPackFechaInicio] = useState(null);

  // Auth gate: open modal on mount if not authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      openAuthModal("login");
    } else if (!perfilCompleto) {
      openAuthModal("completar-perfil");
    }
  }, [authLoading, isAuthenticated, perfilCompleto, openAuthModal]);

  const resetAll = useCallback(() => {
    setStep(0);
    setDisponibilidad([]);
    setEspacios([]);
    setSelectedRecurso(null);
    setReservaCreada(null);
    setTurnoFecha(null);
    setTurnoHora(null);
    setTurnoDuracion(null);
    setPackTipo(null);
    setPackFechaInicio(null);
  }, []);

  const switchTab = (tab) => {
    resetAll();
    setActiveTab(tab);
  };

  // ── Fetch availability ──────────────────────────────────

  const fetchDispoTurno = async () => {
    if (!turnoFecha || !turnoHora || !turnoDuracion) {
      message.warning("Completá fecha, hora y duración.");
      return;
    }
    setLoadingDispo(true);
    try {
      const horaIni = turnoHora.format("HH:mm");
      const horaFin = turnoHora.add(turnoDuracion, "minute").format("HH:mm");
      const fecha = turnoFecha.format("YYYY-MM-DD");
      const url = `${API_URL}/api/recursos/disponibilidad?fecha=${fecha}&horaInicio=${horaIni}&horaFin=${horaFin}`;
      const res = await fetch(url);
      const data = await res.json();
      setDisponibilidad(data);

      const espRes = await fetch(`${API_URL}/api/espacios`);
      const espData = await espRes.json();
      setEspacios(
        espData.map((e, i) => ({
          ...e,
          imagen: espacioImageMap[e.Nombre] || fallbackImages[i % fallbackImages.length],
        }))
      );

      setSelectedRecurso(null);
      setStep(1);
    } catch {
      message.error("Error al consultar disponibilidad.");
    } finally {
      setLoadingDispo(false);
    }
  };

  const fetchDispoPack = async () => {
    if (!packTipo || !packFechaInicio) {
      message.warning("Elegí tipo de pack y fecha de inicio.");
      return;
    }
    setLoadingDispo(true);
    try {
      const fecha = packFechaInicio.format("YYYY-MM-DD");
      const url = `${API_URL}/api/recursos/disponibilidad?tipo=${packTipo}&fechaInicio=${fecha}`;
      const res = await fetch(url);
      const data = await res.json();
      setDisponibilidad(data);
      setSelectedRecurso(null);
      setStep(1);
    } catch {
      message.error("Error al consultar disponibilidad.");
    } finally {
      setLoadingDispo(false);
    }
  };

  // ── Group resources by espacio ──────────────────────────

  const recursoGroupsByEspacio = useMemo(() => {
    if (disponibilidad.length === 0) return [];

    const espacioIds = [...new Set(disponibilidad.map((r) => r.idEspacio))];

    return espacioIds.map((espId) => {
      const espData = espacios.find((e) => e.Espacio === espId);
      const recs = disponibilidad.filter((r) => r.idEspacio === espId);

      const grupoIds = new Set(recs.filter((r) => r.idRecursoPadre).map((r) => r.idRecursoPadre));
      const topLevel = recs.filter((r) => !r.idRecursoPadre);
      const dbGroups = topLevel.filter((r) => grupoIds.has(r.idRecurso));
      const standalones = topLevel.filter((r) => !grupoIds.has(r.idRecurso));

      const sections = [];
      const completoItems = standalones.filter((r) => r.esCompleto);
      const individualItems = standalones.filter((r) => !r.esCompleto);

      const prefixes = {};
      individualItems.forEach((r) => {
        const prefix = r.Nombre.replace(/\s*\d+$/, "");
        if (!prefixes[prefix]) prefixes[prefix] = [];
        prefixes[prefix].push(r);
      });

      Object.entries(prefixes).forEach(([label, items]) => {
        if (items.length > 1) {
          sections.push({ type: "visual-group", label: label + "s", items });
        } else {
          sections.push({ type: "standalone", item: items[0] });
        }
      });

      dbGroups.forEach((g) => {
        const children = recs.filter((r) => r.idRecursoPadre === g.idRecurso);
        sections.push({ type: "db-group", label: g.Nombre, items: children });
      });

      if (completoItems.length > 0) {
        sections.push({ type: "completo", items: completoItems });
      }

      return { espId, espData, sections };
    });
  }, [disponibilidad, espacios]);

  // ── Submit reservation ──────────────────────────────────

  const submitReserva = async () => {
    if (!user || !perfilCompleto) return;
    setSubmitting(true);
    try {
      const isTurno = activeTab === "turno";
      const body = {
        DNI: user.dni,
        Nombre: `${user.nombre} ${user.apellido}`,
        idRecurso: selectedRecurso.idRecurso,
        Monto: 0,
        TipoReserva: isTurno ? "turno" : packTipo,
      };

      if (isTurno) {
        body.DiaReserva = turnoFecha.format("YYYY-MM-DD");
        body.HorarioReserva = turnoHora.format("HH:mm");
        body.HorarioFin = turnoHora.add(turnoDuracion, "minute").format("HH:mm");
      } else {
        body.DiaReserva = packFechaInicio.format("YYYY-MM-DD");
        body.HorarioReserva = null;
        body.HorarioFin = null;
      }

      const reservaRes = await authFetch(`${API_URL}/api/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await reservaRes.json().catch(() => ({}));
      if (!reservaRes.ok) {
        message.error(data.message || "Error al crear reserva");
        return;
      }

      const espNombre =
        espacios.find((e) => e.Espacio === selectedRecurso.idEspacio)?.Nombre ||
        selectedRecurso.espacio_nombre ||
        "";

      if (isTurno) {
        setReservaCreada({
          tipo: "turno",
          espacio: espNombre,
          recurso: selectedRecurso.Nombre,
          cliente: `${user.nombre} ${user.apellido}`,
          email: user.email,
          fecha: turnoFecha.format("DD/MM/YYYY"),
          horaInicio: turnoHora.format("HH:mm"),
          horaFin: turnoHora.add(turnoDuracion, "minute").format("HH:mm"),
        });
      } else {
        const inicio = packFechaInicio;
        const fin = inicio.add(packTipo === "semanal" ? 7 : 30, "day");
        setReservaCreada({
          tipo: packTipo,
          espacio: "Primer Piso",
          recurso: selectedRecurso.Nombre,
          cliente: `${user.nombre} ${user.apellido}`,
          email: user.email,
          fechaInicio: inicio.format("DD/MM/YYYY"),
          fechaFin: fin.format("DD/MM/YYYY"),
        });
      }

      setStep(3);
    } catch {
      message.error("Error al conectar con el servidor");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Chip renderer ──────────────────────────────────────

  const renderChip = (r) => {
    const isGrupo = r.esGrupo;
    const available = r.disponible !== false;
    const disabled = isGrupo || !available;

    return (
      <button
        key={r.idRecurso}
        type="button"
        disabled={disabled}
        className={[
          styles.chip,
          r.esCompleto ? styles.chipCompleto : "",
          selectedRecurso?.idRecurso === r.idRecurso ? styles.chipActive : "",
          disabled ? styles.chipDisabled : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => !disabled && setSelectedRecurso(r)}
      >
        {r.esCompleto && <ExpandAltOutlined className={styles.chipIcon} />}
        {r.Nombre}
        {!available && !isGrupo && <span className={styles.chipBadge}>No disponible</span>}
      </button>
    );
  };

  const renderSections = (sections) =>
    sections.map((section, idx) => {
      if (section.type === "visual-group") {
        return (
          <div key={section.label} className={styles.resourceSection} style={{ animationDelay: `${idx * 70}ms` }}>
            <span className={styles.resourceSectionLabel}>{section.label}</span>
            <div className={styles.chipGrid}>{section.items.map(renderChip)}</div>
          </div>
        );
      }
      if (section.type === "db-group") {
        return (
          <div key={section.label} className={styles.resourceSection} style={{ animationDelay: `${idx * 70}ms` }}>
            <span className={styles.resourceSectionLabel}>{section.label}</span>
            <div className={styles.chipGrid}>{section.items.map(renderChip)}</div>
          </div>
        );
      }
      if (section.type === "standalone") {
        return (
          <div key={section.item.idRecurso} className={styles.resourceSection} style={{ animationDelay: `${idx * 70}ms` }}>
            <div className={styles.chipGrid}>{renderChip(section.item)}</div>
          </div>
        );
      }
      if (section.type === "completo") {
        return (
          <div key="completo" className={styles.resourceDivider} style={{ animationDelay: `${idx * 70}ms` }}>
            <div className={styles.dividerLine} />
            <div className={styles.chipGrid}>{section.items.map(renderChip)}</div>
          </div>
        );
      }
      return null;
    });

  // ── Auth overlay when not logged in ─────────────────────

  const renderAuthGate = () => (
    <div className={styles.authGate}>
      <LockOutlined className={styles.authGateIcon} />
      <h2 className={styles.authGateTitle}>Iniciá sesión para reservar</h2>
      <p className={styles.authGateSub}>
        Para reservar un espacio necesitás iniciar sesión o crear una cuenta.
      </p>
      <div className={styles.authGateButtons}>
        <Button type="primary" className={styles.btnPrimary} size="large" onClick={() => openAuthModal("login")}>
          Iniciar sesión
        </Button>
        <Button size="large" onClick={() => openAuthModal("register")}>
          Registrarse
        </Button>
      </div>
    </div>
  );

  // If auth is loading or user not authenticated, show gate
  if (authLoading) {
    return (
      <div>
        <Header />
        <main className={styles.wrapper}>
          <div style={{ textAlign: "center", padding: "4rem" }}>Cargando...</div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !perfilCompleto) {
    return (
      <div>
        <Header />
        <main className={styles.wrapper}>
          <h1 className={styles.mainHeader}>
            Reservá tu <span className={styles.textEspacio}>Espacio</span>
          </h1>
          {renderAuthGate()}
        </main>
        <Footer />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // TAB: TURNO
  // ══════════════════════════════════════════════════════════

  const turnoStep0 = () => (
    <div className={styles.dateStep}>
      <h2 className={styles.dateStepTitle}>¿Cuándo querés reservar?</h2>
      <p className={styles.dateStepSub}>Elegí fecha, hora y duración para ver qué hay disponible.</p>
      <Row gutter={16} className={styles.datePickerRow}>
        <Col xs={24} sm={8}>
          <label className={styles.fieldLabel}>Fecha</label>
          <DatePicker
            format="DD/MM/YYYY"
            style={{ width: "100%" }}
            placeholder="Elegí una fecha"
            value={turnoFecha}
            onChange={setTurnoFecha}
            disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
          />
        </Col>
        <Col xs={24} sm={8}>
          <label className={styles.fieldLabel}>Hora de inicio</label>
          <TimePicker
            format="HH:mm"
            minuteStep={30}
            style={{ width: "100%" }}
            placeholder="Hora"
            value={turnoHora}
            onChange={setTurnoHora}
          />
        </Col>
        <Col xs={24} sm={8}>
          <label className={styles.fieldLabel}>Duración</label>
          <AntSelect
            placeholder="¿Cuánto tiempo?"
            style={{ width: "100%" }}
            value={turnoDuracion}
            onChange={setTurnoDuracion}
          >
            <AntSelect.Option value={60}>1 hora</AntSelect.Option>
            <AntSelect.Option value={120}>2 horas</AntSelect.Option>
            <AntSelect.Option value={180}>3 horas</AntSelect.Option>
            <AntSelect.Option value={240}>Medio día (4 hs)</AntSelect.Option>
            <AntSelect.Option value={480}>Día completo (8 hs)</AntSelect.Option>
          </AntSelect>
        </Col>
      </Row>
      <div className={styles.stepButtons} style={{ justifyContent: "center" }}>
        <Button
          type="primary"
          className={styles.btnPrimary}
          icon={<SearchOutlined />}
          loading={loadingDispo}
          onClick={fetchDispoTurno}
          size="large"
        >
          Ver disponibilidad
        </Button>
      </div>
    </div>
  );

  const turnoStep1 = () => (
    <div className={styles.recursoStep}>
      <div className={styles.resumenMini}>
        <span className={styles.resumenTag}>
          <CalendarOutlined /> {turnoFecha?.format("DD/MM/YYYY")}
        </span>
        <span className={styles.resumenTag}>
          <ClockCircleOutlined /> {turnoHora?.format("HH:mm")} – {turnoHora?.add(turnoDuracion, "minute").format("HH:mm")}
        </span>
      </div>

      {recursoGroupsByEspacio.map(({ espId, espData, sections }) => (
        <div key={espId} className={styles.espacioSection}>
          <div className={styles.espacioSectionHeader}>
            {espData?.imagen && <img src={espData.imagen} alt={espData?.Nombre} className={styles.espacioSectionImg} />}
            <h3 className={styles.espacioSectionName}>{espData?.Nombre || `Espacio ${espId}`}</h3>
          </div>
          <div className={styles.resourcePicker}>{renderSections(sections)}</div>
        </div>
      ))}

      <div className={styles.stepButtons}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)}>
          Volver
        </Button>
        <Button
          type="primary"
          className={styles.btnPrimary}
          icon={<ArrowRightOutlined />}
          iconPosition="end"
          disabled={!selectedRecurso}
          onClick={() => {
            if (!selectedRecurso) {
              message.warning("Seleccioná un recurso.");
              return;
            }
            setStep(2);
          }}
        >
          Continuar
        </Button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // TAB: PACKS OFICINA
  // ══════════════════════════════════════════════════════════

  const packStep0 = () => (
    <div className={styles.dateStep}>
      <h2 className={styles.dateStepTitle}>Packs de Oficina Privada</h2>
      <p className={styles.dateStepSub}>Reservá un escritorio o la oficina completa por semana o mes.</p>

      <div className={styles.packCardsRow}>
        <button
          type="button"
          className={[styles.packCard, packTipo === "semanal" ? styles.packCardActive : ""].join(" ")}
          onClick={() => setPackTipo("semanal")}
        >
          <CalendarOutlined className={styles.packCardIcon} />
          <span className={styles.packCardTitle}>Semanal</span>
          <span className={styles.packCardDesc}>7 días continuos</span>
        </button>
        <button
          type="button"
          className={[styles.packCard, packTipo === "mensual" ? styles.packCardActive : ""].join(" ")}
          onClick={() => setPackTipo("mensual")}
        >
          <CalendarOutlined className={styles.packCardIcon} />
          <span className={styles.packCardTitle}>Mensual</span>
          <span className={styles.packCardDesc}>30 días continuos</span>
        </button>
      </div>

      <div className={styles.packDateRow}>
        <label className={styles.fieldLabel}>Fecha de inicio</label>
        <DatePicker
          format="DD/MM/YYYY"
          style={{ width: "100%", maxWidth: 280 }}
          placeholder="¿Desde cuándo?"
          value={packFechaInicio}
          onChange={setPackFechaInicio}
          disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
        />
      </div>

      <div className={styles.stepButtons} style={{ justifyContent: "center" }}>
        <Button
          type="primary"
          className={styles.btnPrimary}
          icon={<SearchOutlined />}
          loading={loadingDispo}
          onClick={fetchDispoPack}
          size="large"
        >
          Ver disponibilidad
        </Button>
      </div>
    </div>
  );

  const packStep1 = () => (
    <div className={styles.recursoStep}>
      <div className={styles.resumenMini}>
        <span className={styles.resumenTag}>
          Pack {packTipo === "semanal" ? "Semanal" : "Mensual"}
        </span>
        <span className={styles.resumenTag}>
          <CalendarOutlined /> {packFechaInicio?.format("DD/MM/YYYY")} –{" "}
          {packFechaInicio?.add(packTipo === "semanal" ? 7 : 30, "day").format("DD/MM/YYYY")}
        </span>
      </div>

      <div className={styles.espacioSection}>
        <div className={styles.espacioSectionHeader}>
          <img src={img3} alt="Oficina Privada" className={styles.espacioSectionImg} />
          <h3 className={styles.espacioSectionName}>Oficina Privada – Primer Piso</h3>
        </div>
        <div className={styles.resourcePicker}>
          {disponibilidad.map((r) => renderChip(r))}
        </div>
      </div>

      <div className={styles.stepButtons}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)}>
          Volver
        </Button>
        <Button
          type="primary"
          className={styles.btnPrimary}
          icon={<ArrowRightOutlined />}
          iconPosition="end"
          disabled={!selectedRecurso}
          onClick={() => {
            if (!selectedRecurso) {
              message.warning("Seleccioná un recurso.");
              return;
            }
            setStep(2);
          }}
        >
          Continuar
        </Button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // SHARED: profile summary + confirmation
  // ══════════════════════════════════════════════════════════

  const renderDatosStep = () => {
    const espNombre =
      espacios.find((e) => e.Espacio === selectedRecurso?.idEspacio)?.Nombre ||
      selectedRecurso?.espacio_nombre ||
      "Primer Piso";
    return (
      <div className={styles.datosStep}>
        <div className={styles.resumenMini}>
          <span className={styles.resumenTag}>{espNombre}</span>
          <span className={styles.resumenSep}>›</span>
          <span className={styles.resumenTag}>{selectedRecurso?.Nombre}</span>
          {activeTab === "turno" && (
            <>
              <span className={styles.resumenSep}>·</span>
              <span className={styles.resumenTag}>
                {turnoFecha?.format("DD/MM")} {turnoHora?.format("HH:mm")}–
                {turnoHora?.add(turnoDuracion, "minute").format("HH:mm")}
              </span>
            </>
          )}
          {activeTab === "pack" && (
            <>
              <span className={styles.resumenSep}>·</span>
              <span className={styles.resumenTag}>
                Pack {packTipo} desde {packFechaInicio?.format("DD/MM/YYYY")}
              </span>
            </>
          )}
        </div>

        <div className={styles.formulario}>
          <h3 className={styles.profileSummaryTitle}>Reservando como</h3>
          <div className={styles.profileSummaryGrid}>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Nombre</span>
              <span className={styles.resumenValue}>{user.nombre} {user.apellido}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>DNI</span>
              <span className={styles.resumenValue}>{user.dni}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Email</span>
              <span className={styles.resumenValue}>{user.email}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Teléfono</span>
              <span className={styles.resumenValue}>{user.telefono}</span>
            </div>
          </div>

          <div className={styles.stepButtons}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(1)}>
              Volver
            </Button>
            <Button type="primary" className={styles.btnPrimary} loading={submitting} onClick={submitReserva}>
              Confirmar Reserva
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderConfirmStep = () => (
    <div className={styles.confirmStep}>
      <Result
        icon={<CheckCircleOutlined style={{ color: "#34c08f" }} />}
        title="¡Reserva confirmada!"
        subTitle="Tu lugar está reservado. Te enviamos los detalles por email."
      />

      {reservaCreada && (
        <div className={styles.resumenCard}>
          <h3 className={styles.resumenTitle}>Resumen de tu reserva</h3>
          <div className={styles.resumenGrid}>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Espacio</span>
              <span className={styles.resumenValue}>{reservaCreada.espacio}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Recurso</span>
              <span className={styles.resumenValue}>{reservaCreada.recurso}</span>
            </div>
            {reservaCreada.tipo === "turno" ? (
              <>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Fecha</span>
                  <span className={styles.resumenValue}>{reservaCreada.fecha}</span>
                </div>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Horario</span>
                  <span className={styles.resumenValue}>
                    {reservaCreada.horaInicio} – {reservaCreada.horaFin}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Tipo</span>
                  <span className={styles.resumenValue}>
                    Pack {reservaCreada.tipo === "semanal" ? "Semanal" : "Mensual"}
                  </span>
                </div>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Período</span>
                  <span className={styles.resumenValue}>
                    {reservaCreada.fechaInicio} – {reservaCreada.fechaFin}
                  </span>
                </div>
              </>
            )}
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Cliente</span>
              <span className={styles.resumenValue}>{reservaCreada.cliente}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Email</span>
              <span className={styles.resumenValue}>{reservaCreada.email}</span>
            </div>
          </div>

          <div className={styles.pagoSection}>
            <div className={styles.pagoDivider} />
            <p className={styles.pagoInfo}>
              El pago se coordina directamente en el espacio o podés abonar online:
            </p>
            <Button size="large" className={styles.btnMercadoPago} icon={<CreditCardOutlined />} disabled>
              Pagar con MercadoPago (próximamente)
            </Button>
          </div>
        </div>
      )}

      <div className={styles.stepButtons} style={{ justifyContent: "center" }}>
        <Button type="primary" className={styles.btnPrimary} onClick={resetAll}>
          Hacer otra reserva
        </Button>
      </div>
    </div>
  );

  // ── Steps config per tab ──────────────────────────────

  const turnoSteps = [
    { title: "Fecha y hora", icon: <CalendarOutlined /> },
    { title: "Recurso", icon: <AppstoreOutlined /> },
    { title: "Confirmar", icon: <UserOutlined /> },
    { title: "Listo", icon: <CheckCircleOutlined /> },
  ];

  const packSteps = [
    { title: "Tipo de pack", icon: <CalendarOutlined /> },
    { title: "Escritorios", icon: <AppstoreOutlined /> },
    { title: "Confirmar", icon: <UserOutlined /> },
    { title: "Listo", icon: <CheckCircleOutlined /> },
  ];

  const stepsConfig = activeTab === "turno" ? turnoSteps : packSteps;

  const stepContents =
    activeTab === "turno"
      ? [turnoStep0, turnoStep1, renderDatosStep, renderConfirmStep]
      : [packStep0, packStep1, renderDatosStep, renderConfirmStep];

  return (
    <div>
      <Header />
      <main className={styles.wrapper}>
        <h1 className={styles.mainHeader}>
          Reservá tu <span className={styles.textEspacio}>Espacio</span>
        </h1>

        <div className={styles.tabBar}>
          <button
            type="button"
            className={[styles.tab, activeTab === "turno" ? styles.tabActive : ""].join(" ")}
            onClick={() => switchTab("turno")}
          >
            <ClockCircleOutlined /> Reserva por turno
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "pack" ? styles.tabActive : ""].join(" ")}
            onClick={() => switchTab("pack")}
          >
            <CalendarOutlined /> Packs de Oficina
          </button>
        </div>

        <Steps current={step} className={styles.steps}>
          {stepsConfig.map((s) => (
            <Step key={s.title} title={s.title} icon={s.icon} />
          ))}
        </Steps>

        <div className={styles.stepContent}>{stepContents[step]()}</div>
      </main>
      <Footer />
    </div>
  );
}
