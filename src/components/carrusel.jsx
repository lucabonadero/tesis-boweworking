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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const slug = (titulo) => `espacio-${String(titulo).toLowerCase().replace(/\s+/g, "-")}`;

// ----------------------------------------------------------------------------
// Fallbacks: imágenes locales por nombre de piso (matching difuso por ILIKE).
// Si el admin no carga "Imagenes" en el panel, mostramos estas como respaldo.
// ----------------------------------------------------------------------------
const GALERIAS_FALLBACK = [
  {
    coincidencia: /planta\s*baja/i,
    imagenes: [
      { src: img6, caption: "Ingreso y circulación principal", alt: "Planta baja — hall y coworking" },
      { src: imgPlantaMitad, caption: "Vista amplia del espacio común", alt: "Planta baja — espacio de coworking" },
      { src: img1, caption: "Puestos tipo hot desk", alt: "Planta baja — mesas compartidas con sillas" },
      { src: img2, caption: "Rincón con sillones para pausas", alt: "Planta baja — zona de descanso con sillones" },
    ],
  },
  {
    coincidencia: /primer\s*piso|segundo\s*piso/i,
    imagenes: [
      { src: img3, caption: "Oficina individual", alt: "Primer piso — oficina cerrada" },
      { src: imgPasilloPiso, caption: "Pasillo y acceso a espacios", alt: "Primer piso — pasillo" },
      { src: img4, caption: "Sala de reuniones", alt: "Primer piso — sala de reuniones con mesa" },
      { src: img5, caption: "Espacios con luz natural", alt: "Primer piso — ambiente luminoso" },
    ],
  },
  {
    coincidencia: /terraza|patio|exterior/i,
    imagenes: [
      { src: img2, caption: "Sillones bajo techo o sombra", alt: "Terraza — sillones" },
      { src: imgTerrazaPersona, caption: "Trabajo y pausa al aire libre", alt: "Terraza — persona en espacio exterior" },
      { src: img5, caption: "Vista y ambiente relajado", alt: "Terraza — espacio al aire libre" },
      { src: img1, caption: "Alternativa de asientos", alt: "Terraza — zona de asientos" },
    ],
  },
];

const GALERIA_GENERICA = [
  { src: img6, caption: "Vista del espacio", alt: "Espacio del coworking" },
  { src: img1, caption: "Zona de trabajo", alt: "Zona de trabajo" },
  { src: img2, caption: "Sillones y descanso", alt: "Sillones y descanso" },
];

const AMENITIES_FALLBACK = [
  "Wi-Fi de alta velocidad",
  "Iluminación natural",
  "Climatización",
];

function resolverGaleriaFallback(nombre) {
  const match = GALERIAS_FALLBACK.find((g) => g.coincidencia.test(nombre || ""));
  return match ? match.imagenes : GALERIA_GENERICA;
}

function normalizarImagenesPiso(piso) {
  // 1. Si el admin cargó imágenes via panel, usar esas
  if (Array.isArray(piso.Imagenes) && piso.Imagenes.length > 0) {
    return piso.Imagenes
      .filter((img) => img && img.url)
      .map((img) => ({
        src: img.url,
        alt: img.alt || piso.Nombre,
        caption: img.caption || "",
      }));
  }
  // 2. Si tiene ImagenUrl, usar esa como hero único
  if (piso.ImagenUrl) {
    return [{ src: piso.ImagenUrl, alt: piso.Nombre, caption: piso.Nombre }];
  }
  // 3. Fallback por matching de nombre
  return resolverGaleriaFallback(piso.Nombre);
}

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
        {piso.descripcion && (
          <p className={styles.descripcion}>{piso.descripcion}</p>
        )}
        {piso.idealPara && (
          <p className={styles.idealMuted}>{piso.idealPara}</p>
        )}

        {Array.isArray(piso.amenities) && piso.amenities.length > 0 && (
          <ul className={styles.amenityListInline} aria-label="Incluye">
            {piso.amenities.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}

        <p className={styles.floorActions}>
          <Link to="/registro" className={styles.floorLink}>
            Reservar turno
          </Link>
          <span className={styles.floorActionsSep} aria-hidden>·</span>
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
                {slide.caption && (
                  <figcaption className={styles.slideCaption}>{slide.caption}</figcaption>
                )}
              </figure>
            </div>
          ))}
        </Slider>
      </div>
    </section>
  );
}

export default function CarruselEdificio() {
  const [pisos, setPisos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const observerRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    fetch(`${API_URL}/api/pisos/publicos`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows) => {
        if (cancel) return;
        const mapped = rows.map((p) => ({
          titulo: p.Nombre,
          descripcion: p.Descripcion || "",
          idealPara: p.IdealPara || "",
          amenities: Array.isArray(p.Amenities) && p.Amenities.length > 0
            ? p.Amenities
            : AMENITIES_FALLBACK,
          imagenes: normalizarImagenesPiso(p),
        }));
        setPisos(mapped);
        setActiveSection(mapped[0] ? slug(mapped[0].titulo) : "");
        setLoaded(true);
      })
      .catch(() => {
        if (cancel) return;
        // Fallback total: sin red, mostrar 3 pisos hardcodeados antiguos
        const fallback = [
          { Nombre: "Planta Baja", Descripcion: "", IdealPara: "" },
          { Nombre: "Primer Piso", Descripcion: "", IdealPara: "" },
          { Nombre: "Terraza",     Descripcion: "", IdealPara: "" },
        ].map((p) => ({
          titulo: p.Nombre,
          descripcion: p.Descripcion,
          idealPara: p.IdealPara,
          amenities: AMENITIES_FALLBACK,
          imagenes: resolverGaleriaFallback(p.Nombre),
        }));
        setPisos(fallback);
        setActiveSection(slug(fallback[0].titulo));
        setLoaded(true);
      });
    return () => { cancel = true; };
  }, []);

  const navItems = useMemo(
    () => pisos.map((p) => ({ id: slug(p.titulo), label: p.titulo })),
    [pisos]
  );

  const scrollToId = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (pisos.length === 0) return undefined;
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
  }, [pisos]);

  if (!loaded) {
    return (
      <div className={styles.container}>
        <p style={{ textAlign: "center", padding: 40, color: "#888" }}>
          Cargando espacios...
        </p>
      </div>
    );
  }

  if (pisos.length === 0) {
    return (
      <div className={styles.container}>
        <p style={{ textAlign: "center", padding: 40, color: "#888" }}>
          No hay espacios publicados por el momento.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav className={styles.sectionNav} aria-label="Ir a una zona del edificio">
        <div className={styles.sectionNavInner}>
          {navItems.map((item) => (
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
