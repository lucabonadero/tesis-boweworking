import React, { useEffect, useRef } from "react";
import styles from "../../styles/public/index.module.css";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import { useNavigate } from "react-router-dom";
import {
  WifiOutlined,
  CoffeeOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  HeartOutlined,
  BulbOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import PaquetesCreditosSection from "../../components/PaquetesCreditosSection.jsx";
import logoFundacion from "../../assets/logo_lacasauni.png";
import imgPlantaBaja from "../../assets/plantabaja.png";
import imgPrimerPiso from "../../assets/primerpiso.png";
import imgTerraza from "../../assets/terrazarda.png";
import imgHero from "../../assets/personaenterraza.png";

export default function Index() {
  const navigate = useNavigate();
  const observerRef = useRef(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll(`.${styles.animateOnScroll}`).forEach((el) => {
      observerRef.current.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div>
      <Header />

      {/* Portada */}
      <section className={styles.hero} style={{ backgroundImage: `url(${imgHero})` }}>
        <div className={styles.heroOverlay}>
          <div className={styles.heroContent}>
            <span className={styles.heroBadge}>
              <EnvironmentOutlined /> Coworking en tu ciudad
            </span>
            <h1 className={styles.heroTitle}>
              Tu espacio ideal para <span className={styles.highlight}>trabajar</span>
            </h1>
            <p className={styles.heroSub}>
              Espacios flexibles, modernos y equipados para que tu productividad no tenga limites.
            </p>
            <div className={styles.heroCtas}>
              <button className={styles.heroBtnPrimary} onClick={() => navigate("/registro")}>
                Reservar ahora <ArrowRightOutlined />
              </button>
              <button className={styles.heroBtnSecondary} onClick={() => navigate("/espacios")}>
                Ver espacios
              </button>
            </div>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <strong>20+</strong>
                <span>Espacios</span>
              </div>
              <div className={styles.heroStatDivider} />
              <div className={styles.heroStat}>
                <strong>3</strong>
                <span>Pisos</span>
              </div>
              <div className={styles.heroStatDivider} />
              <div className={styles.heroStat}>
                <strong>100%</strong>
                <span>Equipado</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className={`${styles.howItWorks} ${styles.animateOnScroll}`}>
        <h2 className={styles.sectionTitle}>Como funciona?</h2>
        <p className={styles.sectionSub}>Reservar tu espacio es muy simple</p>
        <div className={styles.stepsRow}>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>1</div>
            <CalendarOutlined className={styles.stepIcon} />
            <h3>Elegi fecha y hora</h3>
            <p>Selecciona cuando queres venir y por cuanto tiempo.</p>
          </div>
          <div className={styles.stepArrow}><ArrowRightOutlined /></div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>2</div>
            <AppstoreOutlined className={styles.stepIcon} />
            <h3>Elegi tu espacio</h3>
            <p>Te mostramos los espacios disponibles en tiempo real.</p>
          </div>
          <div className={styles.stepArrow}><ArrowRightOutlined /></div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>3</div>
            <CheckCircleOutlined className={styles.stepIcon} />
            <h3>Confirma y listo</h3>
            <p>Reserva confirmada. Paga online o al llegar.</p>
          </div>
        </div>
      </section>

      {/* Espacios */}
      <section className={`${styles.espacios} ${styles.animateOnScroll}`}>
        <h2 className={styles.sectionTitle}>Nuestros espacios</h2>
        <p className={styles.sectionSub}>Tres pisos, multiples posibilidades</p>
        <div className={styles.espaciosCards}>
          <div
            className={styles.spaceCard}
            onClick={() =>
              navigate("/espacios", { state: { scrollTo: "espacio-planta-baja" } })
            }
          >
            <div className={styles.spaceCardImg}>
              <img src={imgPlantaBaja} alt="Planta Baja" />
              <span className={styles.spaceCardBadge}>20 lugares</span>
            </div>
            <div className={styles.spaceCardBody}>
              <h3>Planta Baja</h3>
              <p>Puestos tipo escritorio, sillones y espacio abierto para trabajar con total comodidad.</p>
              <span className={styles.spaceCardLink}>
                Explorar <ArrowRightOutlined />
              </span>
            </div>
          </div>
          <div
            className={styles.spaceCard}
            onClick={() =>
              navigate("/espacios", { state: { scrollTo: "espacio-primer-piso" } })
            }
          >
            <div className={styles.spaceCardImg}>
              <img src={imgPrimerPiso} alt="Primer Piso" />
              <span className={styles.spaceCardBadge}>Oficinas privadas</span>
            </div>
            <div className={styles.spaceCardBody}>
              <h3>Primer Piso</h3>
              <p>Oficina privada con escritorios, sala de conferencias con proyector y TV.</p>
              <span className={styles.spaceCardLink}>
                Explorar <ArrowRightOutlined />
              </span>
            </div>
          </div>
          <div
            className={styles.spaceCard}
            onClick={() =>
              navigate("/espacios", { state: { scrollTo: "espacio-terraza" } })
            }
          >
            <div className={styles.spaceCardImg}>
              <img src={imgTerraza} alt="Terraza" />
              <span className={styles.spaceCardBadge}>Aire libre</span>
            </div>
            <div className={styles.spaceCardBody}>
              <h3>Terraza</h3>
              <p>Espacio al aire libre con mesas, ideal para reuniones informales o descansar.</p>
              <span className={styles.spaceCardLink}>
                Explorar <ArrowRightOutlined />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className={`${styles.beneficios} ${styles.animateOnScroll}`}>
        <h2 className={styles.sectionTitle}>Todo lo que necesitas</h2>
        <p className={styles.sectionSub}>Equipados para que solo te preocupes por trabajar</p>
        <div className={styles.beneficiosGrid}>
          <div className={styles.beneficioCard}>
            <div className={styles.beneficioIcon}><WifiOutlined /></div>
            <h4>Internet de alta velocidad</h4>
            <p>Conexion estable y rapida para que trabajes sin interrupciones.</p>
          </div>
          <div className={styles.beneficioCard}>
            <div className={styles.beneficioIcon}><CoffeeOutlined /></div>
            <h4>Cocina y cafe libre</h4>
            <p>Cocina equipada, cafe, heladera y microondas a tu disposicion.</p>
          </div>
          <div className={styles.beneficioCard}>
            <div className={styles.beneficioIcon}><TeamOutlined /></div>
            <h4>Comunidad</h4>
            <p>Conecta con otros profesionales y amplia tu red de contactos.</p>
          </div>
          <div className={styles.beneficioCard}>
            <div className={styles.beneficioIcon}><ClockCircleOutlined /></div>
            <h4>Horarios flexibles</h4>
            <p>Turnos de 09:00 a 21:00 hs, y packs por semana o mes para oficina privada.</p>
          </div>
        </div>
      </section>

      {/* Identidad institucional — RF24 / RF25 */}
      <section
        id="fundacion"
        className={`${styles.institucional} ${styles.animateOnScroll}`}
        aria-labelledby="fundacion-titulo"
      >
        <div className={styles.institucionalInner}>
          <div className={styles.institucionalMarca}>
            <img
              className={styles.institucionalLogo}
              src={logoFundacion}
              alt="Fundacion La Casa Uni"
            />
            <p className={styles.institucionalMarcaRol}>Fundacion</p>
            {/* TODO: validar nombre legal institucional */}
            <p className={styles.institucionalMarcaNombre}>La Casa Uni</p>
          </div>

          <div>
            <h2 id="fundacion-titulo" className={styles.institucionalTitulo}>
              Bo WeWorking es un proyecto de la <em>Fundacion La Casa Uni</em>
            </h2>
            {/* TODO: validar mision y textos institucionales con la fundacion */}
            <p className={styles.institucionalTexto}>
              Creemos que el trabajo digno necesita un lugar donde suceder. Por eso
              sostenemos un espacio abierto en el corazon de Nueva Cordoba, pensado para
              que estudiantes, emprendedores y profesionales independientes encuentren
              infraestructura real sin barreras de entrada.
            </p>
            <p className={styles.institucionalTexto}>
              Cada reserva sostiene los programas de la fundacion: acompanamiento a
              jovenes universitarios, beneficios para estudiantes y actividades abiertas
              a la comunidad. Trabajar aca es tambien construir algo en comun.
            </p>

            <ul className={styles.institucionalValores}>
              <li className={styles.institucionalValor}>
                <HeartOutlined /> Compromiso social
              </li>
              <li className={styles.institucionalValor}>
                <TeamOutlined /> Comunidad universitaria
              </li>
              <li className={styles.institucionalValor}>
                <BulbOutlined /> Autonomia y desarrollo
              </li>
              <li className={styles.institucionalValor}>
                <SafetyCertificateOutlined /> Acceso equitativo
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Vista previa de packs */}
      <section className={`${styles.packs} ${styles.animateOnScroll}`}>
        <h2 className={styles.sectionTitle}>Packs semanales y mensuales</h2>
        <p className={styles.sectionSub}>Ahorra con nuestros planes extendidos para oficinas privadas</p>
        <div className={styles.packsRow}>
          <div className={styles.packPreview}>
            <div className={styles.packPreviewHeader}>
              <CalendarOutlined />
              <h3>Pack Semanal</h3>
            </div>
            <p>7 dias continuos de uso exclusivo de escritorio u oficina completa.</p>
            <button className={styles.packPreviewBtn} onClick={() => navigate("/registro")}>
              Reservar <ArrowRightOutlined />
            </button>
          </div>
          <div className={styles.packPreview}>
            <div className={styles.packPreviewHeader}>
              <CalendarOutlined />
              <h3>Pack Mensual</h3>
            </div>
            <p>30 dias de acceso a tu espacio privado en el primer piso.</p>
            <button className={styles.packPreviewBtn} onClick={() => navigate("/registro")}>
              Reservar <ArrowRightOutlined />
            </button>
          </div>
        </div>
      </section>

      <PaquetesCreditosSection styles={styles} />

      {/* Cierre + pie de página — mismo gradiente, sin corte */}
      <div className={styles.ctaFooterWrap}>
        <section className={`${styles.ctaFinal} ${styles.animateOnScroll}`}>
          <div className={styles.ctaContent}>
            <h2>Listo para empezar?</h2>
            <p>Reserva tu espacio en minutos y transforma tu manera de trabajar.</p>
            <button className={styles.ctaBtn} onClick={() => navigate("/registro")}>
              Reservar mi espacio <ArrowRightOutlined />
            </button>
          </div>
        </section>

        <Footer className="footer--transparent" />
      </div>
    </div>
  );
}




