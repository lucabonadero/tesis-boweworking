import Slider from "react-slick";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../styles/public/espacios.module.css";
import img1 from "../assets/espacios_sillas.png";
import img2 from "../assets/espacios_sillones.png";
import img3 from "../assets/oficina_individual.png";
import img4 from "../assets/salareuniones.png";
import img5 from "../assets/terrazarda.png";
import img6 from "../assets/espacios_plantabaja.png";
import imgPlantaMitad from "../assets/plantabajamitad.png";
import imgPasilloPiso from "../assets/pasillosegundopiso.png";
import imgTerrazaPersona from "../assets/personaenterraza.png";

const slug = (titulo) => `espacio-${titulo.toLowerCase().replace(/\s+/g, "-")}`;

const pisos = [
  {
    titulo: "Planta Baja",
    descripcion:
      "Zona social y de trabajo abierto: ideal para concentrarte, cruzarte con otros miembros o una reunión rápida sin reservar sala.",
    idealPara: "Jornadas largas, llamadas con auriculares y encuentros informales entre equipos.",
    amenities: ["Wi‑Fi de alta velocidad", "Cocina y espacio para almorzar", "Impresora compartida", "Iluminación natural"],
    imagenes: [
      { src: img6, caption: "Ingreso y circulación principal", alt: "Planta baja — hall y coworking" },
      { src: imgPlantaMitad, caption: "Vista amplia del espacio común", alt: "Planta baja — espacio de coworking" },
      { src: img1, caption: "Puestos tipo hot desk", alt: "Planta baja — mesas compartidas con sillas" },
      { src: img2, caption: "Rincón con sillones para pausas", alt: "Planta baja — zona de descanso con sillones" },
    ],
  },
  {
    titulo: "Primer Piso",
    descripcion:
      "Privacidad cuando la necesitás: oficinas y salas cerradas con buena acústica para reuniones formales o trabajo enfocado.",
    idealPara: "Reuniones con cliente, entrevistas, sesiones en equipo y trabajo sin interrupciones.",
    amenities: ["Salas equipadas para videollamada", "Pizarras / soporte para presentar", "Climatización", "Enchufes en cada puesto"],
    imagenes: [
      { src: img3, caption: "Oficina individual", alt: "Primer piso — oficina cerrada" },
      { src: imgPasilloPiso, caption: "Pasillo y acceso a espacios", alt: "Primer piso — pasillo" },
      { src: img4, caption: "Sala de reuniones", alt: "Primer piso — sala de reuniones con mesa" },
      { src: img5, caption: "Espacios con luz natural", alt: "Primer piso — ambiente luminoso" },
    ],
  },
  {
    titulo: "Terraza",
    descripcion:
      "Aire libre para desconectar cinco minutos o charlar con calma; complementa perfecto una jornada en planta baja o primer piso.",
    idealPara: "Breaks, llamadas breves al aire libre y momentos informales entre colegas.",
    amenities: ["Mobiliario de exterior", "Vistas despejadas", "Uso según clima", "Conexión Wi‑Fi desde interior cercano"],
    imagenes: [
      { src: img2, caption: "Sillones bajo techo o sombra", alt: "Terraza — sillones" },
      { src: imgTerrazaPersona, caption: "Trabajo y pausa al aire libre", alt: "Terraza — persona en espacio exterior" },
      { src: img5, caption: "Vista y ambiente relajado", alt: "Terraza — espacio al aire libre" },
      { src: img1, caption: "Alternativa de asientos", alt: "Terraza — zona de asientos" },
    ],
  },
];

const ESPACIOS_NAV = pisos.map((p) => ({
  id: slug(p.titulo),
  label: p.titulo,
}));

function SliderArrow({ className, style, onClick, direction }) {
  return (
    <button
      type="button"
      className={`${styles.sliderArrow} ${direction === "prev" ? styles.sliderArrowPrev : styles.sliderArrowNext} ${className || ""}`}
      style={{ ...style }}
      onClick={onClick}
      aria-label={direction === "prev" ? "Foto anterior" : "Foto siguiente"}
    >
      <span className={styles.sliderArrowIcon} aria-hidden>
        {direction === "prev" ? "‹" : "›"}
      </span>
    </button>
  );
}

function FloorSection({ piso }) {
  const sliderSettings = useMemo(
    () => ({
      infinite: true,
      speed: 600,
      slidesToShow: 3,
      slidesToScroll: 1,
      autoplay: true,
      autoplaySpeed: 4500,
      pauseOnHover: true,
      centerMode: true,
      centerPadding: "0px",
      dots: false,
      arrows: true,
      prevArrow: <SliderArrow direction="prev" />,
      nextArrow: <SliderArrow direction="next" />,
      responsive: [
        {
          breakpoint: 900,
          settings: {
            slidesToShow: 2,
            centerMode: true,
            centerPadding: "12px",
            arrows: true,
            dots: true,
          },
        },
        {
          breakpoint: 560,
          settings: {
            slidesToShow: 1,
            centerMode: true,
            centerPadding: "24px",
            arrows: true,
            dots: true,
          },
        },
      ],
    }),
    []
  );

  const sectionId = slug(piso.titulo);

  return (
    <section
      id={sectionId}
      className={styles.carruselWrapper}
      data-espacio-section
      aria-labelledby={`heading-${sectionId}`}
    >
      <div className={styles.floorCard}>
        <h2 className={styles.titulo} id={`heading-${sectionId}`}>
          {piso.titulo}
        </h2>
        <p className={styles.descripcion}>{piso.descripcion}</p>
        <p className={styles.idealMuted}>{piso.idealPara}</p>

        <ul className={styles.amenityListInline} aria-label="Incluye">
          {piso.amenities.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>

        <p className={styles.floorActions}>
          <Link to="/registro" className={styles.floorLink}>
            Reservar turno
          </Link>
          <span className={styles.floorActionsSep} aria-hidden>
            ·
          </span>
          <Link to="/asistente" className={styles.floorLink}>
            Asistente de reservas
          </Link>
        </p>
      </div>

      <div className={styles.sliderOuter}>
        <Slider {...sliderSettings}>
          {piso.imagenes.map((slide, i) => (
            <div key={i} className={styles.slide}>
              <figure className={styles.slideFigure}>
                <img src={slide.src} alt={slide.alt} loading={i === 0 ? "eager" : "lazy"} />
                <figcaption className={styles.slideCaption}>{slide.caption}</figcaption>
              </figure>
            </div>
          ))}
        </Slider>
      </div>
    </section>
  );
}

export default function CarruselEdificio() {
  const [activeSection, setActiveSection] = useState(ESPACIOS_NAV[0]?.id ?? "");
  const observerRef = useRef(null);

  const scrollToId = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll("[data-espacio-section]");
    if (!nodes.length) return undefined;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (visible?.target?.id) {
          setActiveSection(visible.target.id);
        }
      },
      { root: null, rootMargin: "-38% 0px -38% 0px", threshold: [0.15, 0.3, 0.5] }
    );

    nodes.forEach((n) => observerRef.current?.observe(n));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className={styles.container}>
      <nav className={styles.sectionNav} aria-label="Ir a una zona del edificio">
        <div className={styles.sectionNavInner}>
          {ESPACIOS_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.sectionNavBtn} ${activeSection === item.id ? styles.sectionNavBtnActive : ""}`}
              onClick={() => scrollToId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {pisos.map((piso) => (
        <FloorSection key={slug(piso.titulo)} piso={piso} />
      ))}
    </div>
  );
}
