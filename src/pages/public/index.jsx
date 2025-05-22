import React from "react";
import styles from "../../styles/public/index.module.css";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import { useNavigate } from "react-router-dom";

export default function Index() {
  const navigate = useNavigate();

  const handleVerMas = (seccionId) => {
    navigate("/espacios", { state: { scrollTo: seccionId } });
  };
  
  return (
    <div>
      <Header />

      {/* HERO SECTION */}
      <section className={styles.hero}>
        <div className={styles.hero__overlay}>
          <div className={styles.hero__content}>
            <h1>
              Encontrá el mejor<br /> lugar para <span className={styles.highlight}>Trabajar</span>
            </h1>
            <div className={styles.hero__box}>
              <p>
                Su productividad está influenciada por el lugar donde trabaja.<br />
                ¡Busque el mejor lugar para trabajar!
              </p>
              <button className={styles.hero__button}>Buscar</button>
            </div>
          </div>
        </div>
      </section>

      {/* ESPACIOS DISPONIBLES */}
      <section className={styles.espacios}>
        <h2>Nuestros espacios.</h2>
        <p>Te mostramos imágenes de los diferentes espacios con los que contamos.</p>
        <div className={styles.espacios__cards}>
          <div className={styles.card}>
            <img src="./src/assets/plantabaja.png" alt="Planta Baja" />
            <h3>Planta Baja</h3>
            <p>Escritorios individuales, espacio para eventos, reuniones, clases.</p>
            <div className={styles.spaceLink}>
              <a href="/espacios">
                Ver más
              </a>
              </div>
          </div>
          <div className={styles.card}>
            <img src="./src/assets/primerpiso.png" alt="Primer Piso" />
            <h3>Primer Piso</h3>
            <p>Oficinas y sala para reuniones, con opción de alquiler mensual.</p>
            <div className={styles.spaceLink}>
              <a href="/espacios">
                Ver más
              </a>
            </div>
          </div>
          <div className={styles.card}>
            <img src="./src/assets/terrazarda.png" alt="Terraza" />
            <h3>Terraza</h3>
            <p>Espacio libre, coworking.</p>
            <div className={styles.spaceLink}>
              <a href="/espacios">
                Ver más
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFICIOS / INFO */}
      <section className={styles.beneficios}>
        <h2>Queremos lo mejor para nuestros clientes.</h2>
        <p>Disponemos de los mejores beneficios para que puedas disfrutar de tu espacio de trabajo.</p>
        <div className={styles.beneficios__grid}>
          <div className={styles.beneficio}>
            <img src="./src/assets/internet.png" alt="Icono 1" />
            <h4>Internet de alta velocidad</h4>
            <p>Contamos con la mejor velocidad de internet para que puedas navegar tranquilo.</p>
          </div>
          <div className={`${styles.beneficio} ${styles.destacado}`}>
            <img src="./src/assets/serviciosvarios.png" alt="Icono 2" />
            <h4>Servicios varios</h4>
            <p>Contamos con cocina, café, heladera, microondas y otros servicios a tu disponibilidad para mayor comodidad.</p>
          </div>
          <div className={styles.beneficio}>
            <img src="./src/assets/masveinte.png" alt="Icono 3" />
            <h4>20+ Espacios disponibles</h4>
            <p>Existen varias disposiciones de espacios en el lugar.</p>
          </div>
        </div>
      </section>

      {/* IMAGEN DESTACADA */}
      <section className={styles.imagen__destacada}>
        <img src="./src/assets/personaenterraza.png" alt="Persona en coworking" />
      </section>

      <section className={styles.cta__final}>
        <div className={styles.cta__finalWrapper}>
          <h2>
            Sentite libre de<br />
            consultar por el<br />
            espacio de tu interés.
          </h2>
          <div className={styles.cta__finalParrafo}>
            <p>
              Para cualquier consulta, escribinos por nuestros medios o acercate. ¡Te esperamos!
            </p>
            <div className={styles.cta__finalUnderline}></div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}




