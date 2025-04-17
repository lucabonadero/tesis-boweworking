import styles from "../styles/registrocliente.module.css";
import Header from "../components/header.jsx";
import React from "react";
import Footer from "../components/footer.jsx";
import Carousel from '../components/carrusel.jsx';
import "../styles/global.css";

export default function RegistroCliente() {
  return (
    <div>
      <Header />

      <main className={styles.main}>
        <div className={styles.formContainer}>
          <h1 className={styles.main__header}>
            Reserva tu&nbsp;<span className={styles.text__espacio}>Espacio</span>
          </h1>
          <div className={styles.formAndCarousel}>
            <div className={styles.container__form}>
              <form action="/formulario.html" method="POST">
                <div className={styles.form__group}>
                  <label htmlFor="nombre">Nombre:</label>
                  <input type="text" id="nombre" name="nombre" required />
                </div>
                <div className={styles.form__group}>
                  <label htmlFor="apellido">Apellido:</label>
                  <input type="text" id="apellido" name="apellido" required />
                </div>
                <div className={styles.form__group}>
                  <label htmlFor="email">Correo Electrónico:</label>
                  <input type="email" id="email" name="email" required />
                </div>
                <div className={styles.form__group}>
                  <label htmlFor="space">Espacio a reservar:</label>
                  <select id="space" name="space">
                    <option value="planta-baja">Planta Baja</option>
                    <option value="oficina-individual">Oficina Individual</option>
                    <option value="sala-de-reuniones">Sala de Reuniones</option>
                    <option value="terraza">Terraza</option>
                  </select>
                </div>
                <div className={styles.form__group}>
                  <label htmlFor="fecha">Fecha y Hora de la Visita:</label>
                  <input type="datetime-local" id="fecha" name="fecha" required />
                </div>
                <div className={styles.form__group__horizontal}>
                  <div className={styles.form__group}>
                    <label htmlFor="duracion">Tiempo de la Reserva:</label>
                    <select id="duracion" name="duracion">
                      <option value="one-hour">1hs</option>
                      <option value="two-hours">2hs</option>
                      <option value="three-hours">3hs</option>
                    </select>
                  </div>

                  <div className={styles.form__group}>
                    <label htmlFor="cantidad">Cantidad de personas:</label>
                    <input
                      type="number"
                      id="cantidad"
                      name="cantidad"
                      min="1"
                      defaultValue="1"
                      required
                    />
                  </div>
                </div>

                <div className={styles.form__group}>
                  <input type="submit" value="Reservar" />
                </div>
              </form>
            </div>

            <Carousel />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}