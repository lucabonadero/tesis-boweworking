import React from "react";
import "../styles/index.css";
import Header from "../components/header.jsx";
import Footer from "../components/footer.jsx";


export default function Index () {
    return (
    <div>
      <Header />
      {/* HERO SECTION */}
      <section className="hero">
  <div className="hero__overlay">
    <div className="hero__content">
      <h1>
        Encontrá el mejor lugar para <span className="highlight">Trabajar</span>
      </h1>
      <div className="hero__box">
        <p>Su productividad  está influenciada por el lugar donde trabaja.<br />
        ¡Busque el mejor lugar para trabajar!</p>
        <button className="hero__button">Buscar</button>
      </div>
    </div>
  </div>
</section>



      {/* ESPACIOS DISPONIBLES */}
      <section className="espacios">
        <h2>Nuestros espacios.</h2>
        <p>Te mostramos imágenes de los diferentes espacios con los que contamos.</p>
        <div className="espacios__cards">
          <div className="card">
            <img src="./src/assets/plantabaja.png" alt="Planta Baja" />
            <h3>Planta Baja</h3>
            <p>Escritorios individuales, espacio para eventos, reuniones, clases</p>
            <div className="space-link">
              <a href="#">Ver más</a>
              <span className="arrow">➔</span>
            </div>
          </div>
          <div className="card">
            <img src="./src/assets/primerpiso.png" alt="Primer Piso" />
            <h3>Primer Piso</h3>
            <p>Oficina equipada para reuniones, con proyector disponible y opción de alquiler mensual.</p>
            <div className="space-link">
              <a href="#">Ver más</a>
              <span className="arrow">➔</span>
            </div>
          </div>
          <div className="card">
            <img src="./src/assets/terrazarda.png" alt="Terraza" />
            <h3>Terraza</h3>
            <p>Espacio libre, coworking</p>
            <div className="space-link">
              <a href="#">Ver más</a>
              <span className="arrow">➔</span>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFICIOS / INFO */}
      <section className="beneficios">
        <h2>Queremos lo mejor para nuestros clientes.</h2>
        <p>Disponemos de los mejores beneficios para que puedas disfrutar de tu espacio de trabajo.</p>
        <div className="beneficios__grid">
          <div className="beneficio">
            <img src="./src/assets/internet.png" alt="Icono 1" />
            <h4>Internet de alta velocidad</h4>
            <p>Contamos con la mejor velocidad de internet para que puedas navegar tranquilo.</p>
          </div>
          <div className="beneficio destacado">
            <img src="./src/assets/serviciosvarios.png" alt="Icono 2" />
            <h4>Servicios varios</h4>
            <p>Contamos con cocina, café, heladera, microondas y otros servicios a tu disponibilidad para mayor comodidad.</p>
          </div>
          <div className="beneficio">
            <img src="./src/assets/masveinte.png" alt="Icono 3" />
            <h4>20+ Espacios disponibles</h4>
            <p>Existen varias disposiciones de espacios en el lugar.</p>
          </div>
        </div>
      </section>

      {/* IMAGEN DESTACADA */}
      <section className="imagen__destacada">
        <img src="./src/assets/personaenterraza.png" alt="Persona en coworking" />
      </section>

      <section className="cta__final">
  <div className="cta__final-wrapper">
    <h2>
      Sentite libre de<br />
      consultar por el<br />
      espacio de tu interés.
    </h2>
    <div className="cta__final-parrafo">
      <p>
      Para cualquier consulta, escribinos por nuestros medios o acercate. ¡Te esperamos!
      </p>
      <div className="cta__final-underline"></div>
    </div>
  </div>
</section>


      <Footer />
    </div>

  );
};



