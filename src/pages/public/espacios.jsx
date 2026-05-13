import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import styles from "../../styles/public/espacios.module.css";
import "../../styles/global.css";

// ── Assets ──────────────────────────────────────────────────────────────────
import imgFrenteBowe    from "../../assets/frentebowe.jpg";
import imgPlantaBaja    from "../../assets/plantabaja.png";
import imgPrimerPiso    from "../../assets/primerpiso.png";
import imgTerraza       from "../../assets/terrazarda.png";
import imgSillas        from "../../assets/espacios_sillas.png";
import imgSillones      from "../../assets/espacios_sillones.png";
import imgOficina       from "../../assets/oficina_individual.png";
import imgSalaReu       from "../../assets/salareuniones.png";
import imgPBMitad       from "../../assets/plantabajamitad.png";
import imgPasillo       from "../../assets/pasillosegundopiso.png";
import imgTerrazaPersona from "../../assets/personaenterraza.png";
import imgTerrazaChica  from "../../assets/terrazardaachidada.png";
import imgEscritorioMod from "../../assets/escritoriomoderno.png";
import imgEscritorio2   from "../../assets/escritorioblanco2.png";
import imgServicios     from "../../assets/serviciosvarios.png";
import imgEspaciosPB    from "../../assets/espacios_plantabaja.png";
import imgSalaChica     from "../../assets/salareunionesachicada.png";

// ── Static content data ──────────────────────────────────────────────────────
const PISOS = [
  {
    id: "planta-baja",
    label: "Planta Baja",
    numero: "PB",
    subtitulo: "Coworking abierto y flexible",
    descripcion:
      "El corazón del edificio. Un espacio amplio, luminoso y lleno de energía donde conviven freelancers, equipos pequeños y profesionales independientes. Cada rincón está pensado para que trabajes con total comodidad.",
    idealPara:
      "Freelancers, sesiones individuales, coworking colaborativo y sprints creativos.",
    accent: "#34c08f",
    heroImg: imgPlantaBaja,
    galeria: [
      { src: imgEspaciosPB,  caption: "Ingreso y espacio común" },
      { src: imgSillas,      caption: "Puestos tipo hot desk" },
      { src: imgSillones,    caption: "Zona de sillones y descanso" },
      { src: imgPBMitad,     caption: "Vista general del piso" },
    ],
    spaces: [
      {
        nombre: "Hot Desk",
        descripcion:
          "Escritorios compartidos con acceso libre durante el turno. Perfectos para jornadas productivas sin necesidad de lugar fijo.",
        img: imgSillas,
        tag: "Reserva diaria",
      },
      {
        nombre: "Zona Lounge",
        descripcion:
          "Sillones y mesas bajas ideales para pausas creativas, lecturas o reuniones informales entre colegas.",
        img: imgSillones,
        tag: "Acceso libre",
      },
    ],
    amenities: [
      { icon: "📶", label: "Wi-Fi de alta velocidad" },
      { icon: "❄️",  label: "Climatización" },
      { icon: "☕",  label: "Cocina y café disponible" },
      { icon: "🔌", label: "Tomacorrientes en cada puesto" },
      { icon: "💡", label: "Iluminación natural" },
      { icon: "🚶", label: "Acceso directo desde la entrada" },
    ],
  },
  {
    id: "primer-piso",
    label: "Primer Piso",
    numero: "1°",
    subtitulo: "Oficinas privadas y sala de reuniones",
    descripcion:
      "Para quienes buscan concentración y privacidad. El primer piso alberga oficinas individuales cerradas y una sala de reuniones totalmente equipada, en un ambiente diseñado para el trabajo profundo.",
    idealPara:
      "Reuniones con clientes, trabajo enfocado, equipos pequeños y presentaciones profesionales.",
    accent: "#4f8ef7",
    heroImg: imgPrimerPiso,
    galeria: [
      { src: imgOficina,     caption: "Oficina individual privada" },
      { src: imgSalaReu,     caption: "Sala de reuniones equipada" },
      { src: imgPasillo,     caption: "Pasillo y accesos al piso" },
      { src: imgEscritorioMod, caption: "Escritorios de última generación" },
    ],
    spaces: [
      {
        nombre: "Oficina Individual",
        descripcion:
          "Espacio cerrado con escritorio, silla ergonómica y monitor. Disponible por semana o mes completo.",
        img: imgOficina,
        tag: "Pack semanal / mensual",
      },
      {
        nombre: "Sala de Reuniones",
        descripcion:
          "Mesa para 6 personas, TV HD, proyector y pizarrón. El espacio ideal para presentaciones de equipo.",
        img: imgSalaReu,
        tag: "Reserva por hora",
      },
    ],
    amenities: [
      { icon: "📶", label: "Wi-Fi de alta velocidad" },
      { icon: "🖥️", label: "Monitor incluido" },
      { icon: "📺", label: "TV HD y proyector en sala" },
      { icon: "❄️",  label: "Climatización independiente" },
      { icon: "🔒", label: "Privacidad garantizada" },
      { icon: "☕",  label: "Acceso a cocina del piso" },
    ],
  },
  {
    id: "terraza",
    label: "Terraza",
    numero: "T",
    subtitulo: "Espacio al aire libre",
    descripcion:
      "Un refugio abierto para recargar energías. Mesas, sillones y la frescura del exterior hacen de la terraza el lugar perfecto para pausas creativas, reuniones informales o simplemente desconectar.",
    idealPara:
      "Pausas activas, reuniones informales, trabajo al aire libre y momentos de desconexión.",
    accent: "#ff9800",
    heroImg: imgTerraza,
    galeria: [
      { src: imgTerrazaPersona, caption: "Trabajo y pausa al aire libre" },
      { src: imgTerrazaChica,   caption: "Vista de la terraza" },
      { src: imgSillones,       caption: "Sillones bajo techo" },
      { src: imgTerraza,        caption: "Ambiente exterior relajado" },
    ],
    spaces: [
      {
        nombre: "Zona Exterior",
        descripcion:
          "Mesas y sillas con sombra para trabajar o descansar al aire libre con una vista única del entorno.",
        img: imgTerrazaPersona,
        tag: "Acceso libre",
      },
      {
        nombre: "Rincón Lounge",
        descripcion:
          "Sillones y mesas bajas para reuniones informales con el cielo abierto como techo y la brisa como compañía.",
        img: imgSillones,
        tag: "Sin reserva",
      },
    ],
    amenities: [
      { icon: "☀️", label: "Luz natural y cielo abierto" },
      { icon: "📶", label: "Wi-Fi extendido al exterior" },
      { icon: "🌬️", label: "Ventilación natural" },
      { icon: "🛋️", label: "Sillones y mesas" },
      { icon: "🌿", label: "Ambiente relajado" },
      { icon: "🌅", label: "Perfecta para pausas" },
    ],
  },
];

const RECURSOS = [
  {
    nombre: "Escritorios",
    descripcion: "Amplios y ergonómicos para largas jornadas de trabajo productivo.",
    img: imgEscritorioMod,
    count: "20+",
    icon: "🗂️",
  },
  {
    nombre: "Sillones",
    descripcion: "Zona de descanso y reuniones informales perfecta para recargar.",
    img: imgSillones,
    count: "10+",
    icon: "🛋️",
  },
  {
    nombre: "Monitores",
    descripcion: "Disponibles en las oficinas del primer piso para mayor productividad.",
    img: imgEscritorio2,
    count: "5",
    icon: "🖥️",
  },
  {
    nombre: "Sala de Reuniones",
    descripcion: "Equipada con TV HD, proyector y pizarrón. Capacidad para 6 personas.",
    img: imgSalaChica,
    count: "1",
    icon: "📊",
  },
  {
    nombre: "Bancos y Sillas",
    descripcion: "Distribuidos en todos los espacios comunes del edificio.",
    img: imgSillas,
    count: "30+",
    icon: "🪑",
  },
  {
    nombre: "Cocina Equipada",
    descripcion: "Café, heladera, microondas y todo lo necesario para tu jornada.",
    img: imgServicios,
    count: "Full",
    icon: "☕",
  },
];

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ src, caption, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className={styles.lightboxOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada de imagen"
    >
      <div className={styles.lightboxBox} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.lightboxClose}
          onClick={onClose}
          aria-label="Cerrar imagen"
        >
          ×
        </button>
        <img src={src} alt={caption} className={styles.lightboxImg} />
        {caption && <p className={styles.lightboxCaption}>{caption}</p>}
      </div>
    </div>
  );
}

// ── Floor Section ─────────────────────────────────────────────────────────────
function FloorSection({ piso, onOpenLightbox }) {
  return (
    <section
      id={piso.id}
      className={styles.floorSection}
      data-animate
      style={{ "--accent": piso.accent }}
    >
      {/* Hero image */}
      <div className={styles.floorHero}>
        <img src={piso.heroImg} alt={piso.label} className={styles.floorHeroImg} />
        <div className={styles.floorHeroOverlay}>
          <div className={styles.floorHeroContent}>
            <span className={styles.floorNumBadge}>{piso.numero}</span>
            <h2 className={styles.floorHeroTitle}>{piso.label}</h2>
            <p className={styles.floorHeroSub}>{piso.subtitulo}</p>
          </div>
        </div>
      </div>

      {/* Info + Gallery */}
      <div className={styles.floorBody}>
        <div className={styles.floorInfo}>
          <p className={styles.floorDesc}>{piso.descripcion}</p>
          <p className={styles.floorIdeal}>
            <span className={styles.floorIdealLabel}>Ideal para: </span>
            {piso.idealPara}
          </p>
          <div className={styles.amenityChips}>
            {piso.amenities.map((a) => (
              <span key={a.label} className={styles.amenityChip}>
                <span className={styles.amenityIcon}>{a.icon}</span>
                {a.label}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.galleryGrid}>
          {piso.galeria.map((img, i) => (
            <button
              key={i}
              className={`${styles.galleryItem} ${i === 0 ? styles.galleryFeatured : ""}`}
              onClick={() => onOpenLightbox(img.src, img.caption)}
              aria-label={`Ver imagen: ${img.caption}`}
            >
              <img src={img.src} alt={img.caption} loading={i === 0 ? "eager" : "lazy"} />
              <span className={styles.galleryCaption}>{img.caption}</span>
              <span className={styles.galleryZoomIcon} aria-hidden>⊕</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spaces */}
      <div className={styles.spacesBlock}>
        <h3 className={styles.spacesBlockTitle}>Espacios en {piso.label}</h3>
        <div className={styles.spacesGrid}>
          {piso.spaces.map((sp) => (
            <div key={sp.nombre} className={styles.spaceCard}>
              <div className={styles.spaceCardImgWrap}>
                <img src={sp.img} alt={sp.nombre} className={styles.spaceCardImg} />
                <span className={styles.spaceCardTag}>{sp.tag}</span>
              </div>
              <div className={styles.spaceCardBody}>
                <h4 className={styles.spaceCardTitle}>{sp.nombre}</h4>
                <p className={styles.spaceCardDesc}>{sp.descripcion}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Espacios() {
  const [activeFloor, setActiveFloor] = useState(PISOS[0].id);
  const [lightbox, setLightbox]       = useState(null);
  const navRef = useRef(null);

  // Smooth-scroll to a floor section, accounting for sticky nav height
  const scrollToFloor = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const navH = navRef.current?.offsetHeight ?? 0;
    const top  = el.getBoundingClientRect().top + window.scrollY - navH - 12;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  // Highlight active floor as user scrolls
  useEffect(() => {
    const sections = PISOS.map((p) => document.getElementById(p.id)).filter(Boolean);
    if (!sections.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best?.target?.id) setActiveFloor(best.target.id);
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0.1, 0.3, 0.5] }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  // Fade-in on scroll for all [data-animate] elements
  useEffect(() => {
    const els = document.querySelectorAll("[data-animate]");
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.visible);
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.1 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const openLightbox = useCallback((src, caption) => setLightbox({ src, caption }), []);

  return (
    <div className={styles.page}>
      <Header />

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <img
          src={imgFrenteBowe}
          className={styles.heroBg}
          alt="Fachada Bo WeWorking"
        />
        <div className={styles.heroOverlay}>
          <div className={styles.heroContent}>
            <span className={styles.heroBadge}>Recorrido virtual</span>
            <h1 className={styles.heroTitle}>
              Conocé nuestros{" "}
              <span className={styles.heroAccent}>espacios</span>
            </h1>
            <p className={styles.heroSub}>
              Tres pisos, múltiples posibilidades para tu forma de trabajar
            </p>
            <div className={styles.heroFloorBtns}>
              {PISOS.map((p) => (
                <button
                  key={p.id}
                  className={styles.heroFloorBtn}
                  style={{ "--accent": p.accent }}
                  onClick={() => scrollToFloor(p.id)}
                >
                  <span className={styles.heroFloorNum}>{p.numero}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.heroScroll} aria-hidden>
          <span className={styles.heroScrollArrow}>↓</span>
        </div>
      </section>

      {/* ── Sticky floor nav ── */}
      <nav
        className={styles.floorNav}
        ref={navRef}
        aria-label="Navegación de pisos"
      >
        <div className={styles.floorNavInner}>
          {PISOS.map((p) => (
            <button
              key={p.id}
              className={`${styles.floorNavBtn} ${
                activeFloor === p.id ? styles.floorNavActive : ""
              }`}
              style={{ "--accent": p.accent }}
              onClick={() => scrollToFloor(p.id)}
              aria-current={activeFloor === p.id ? "true" : undefined}
            >
              <span className={styles.floorNavNum}>{p.numero}</span>
              <span className={styles.floorNavLabel}>{p.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Floor sections ── */}
      <main className={styles.main}>
        {PISOS.map((piso) => (
          <FloorSection
            key={piso.id}
            piso={piso}
            onOpenLightbox={openLightbox}
          />
        ))}
      </main>

      {/* ── Recursos ── */}
      <section className={styles.recursosSection} data-animate>
        <div className={styles.recursosInner}>
          <h2 className={styles.sectionTitle}>Recursos disponibles</h2>
          <p className={styles.sectionSub}>
            Todo lo que necesitás para trabajar al máximo
          </p>
          <div className={styles.recursosGrid}>
            {RECURSOS.map((r) => (
              <div key={r.nombre} className={styles.recursoCard}>
                <div className={styles.recursoImgWrap}>
                  <img src={r.img} alt={r.nombre} className={styles.recursoImg} />
                  <span className={styles.recursoCount}>{r.count}</span>
                </div>
                <div className={styles.recursoBody}>
                  <span className={styles.recursoIcon}>{r.icon}</span>
                  <h4 className={styles.recursoTitle}>{r.nombre}</h4>
                  <p className={styles.recursoDesc}>{r.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaSection} data-animate>
        <div className={styles.ctaContent}>
          <h2>¿Listo para reservar tu espacio?</h2>
          <p>Elegí el espacio que más te guste y reservalo en minutos.</p>
          <div className={styles.ctaBtns}>
            <Link to="/registro" className={styles.ctaBtnPrimary}>
              Reservar ahora
            </Link>
            <Link to="/asistente" className={styles.ctaBtnSecondary}>
              Consultar con asistente
            </Link>
          </div>
        </div>
      </section>

      {lightbox && (
        <Lightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}

      <Footer />
    </div>
  );
}
