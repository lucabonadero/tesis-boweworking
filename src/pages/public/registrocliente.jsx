import styles from "../../styles/public/registrocliente.module.css";
import Header from "../../components/header.jsx";
import React from "react";
import Footer from "../../components/footer.jsx";
import Carousel from '../../components/carrusel.jsx';
import "../../styles/global.css";


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

            
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}


/* import img1 from '../../assets/espacios_sillas.png';
import img2 from '../../assets/espacios_sillones.png';
import img3 from '../../assets/oficina_individual.png';
import img4 from '../../assets/salareuniones.png';
import img5 from '../../assets/terrazarda.png';
import img6 from '../../assets/espacios_plantabaja.png'; */


/* const espacios = [
    {
        titulo: 'Bancos',
        imagen: img1,
        caracteristicas: [
          'Individual',
          'Espacio',
          'Proyector y pantalla',
          'Escritorios ergonómicos',
        ],
    },
    {
      titulo: 'Sillones',
      imagen: img2,
      caracteristicas: [
        'Individual',
        'WiFi de alta velocidad',
        'Puerto USB',
        'Acceso 24hs',
      ],
    },
    {
      titulo: 'Oficina',
      imagen: img3,
      caracteristicas: [
        'Individual, se comparte con otras 3 personas',
        'TV Smart y Pizarra',
        'Vista al frente',
        'Ambiente silencioso',
      ],
    },
    {
      titulo: 'Sala de Reuniones',
      imagen: img4,
      caracteristicas: [
        'Capacidad hasta 8 personas',
        'Salón privado',
        'Proyector y pantalla',
        'Escritorios ergonómicos',
      ],
    },
    {
      titulo: 'Terraza',
      imagen: img5,
      caracteristicas: [
        'Capacidad hasta 20 personas',
        'Salón privado',
        'Proyector y pantalla',
        'Escritorios ergonómicos',
      ],
    },
    {
      titulo: 'Planta Baja Completa',
      imagen: img6,
      caracteristicas: [
        'Capacidad hasta 20 personas',
        'Salón privado',
        'Proyector y pantalla',
        'Ideal para Clases',
      ],
    },
  ]; 
  
<main className={styles.espacios__grid}>
  {espacios.map((espacio, index) => (
    <div key={index} className={styles.espacios__card}>
        <img src={espacio.imagen} alt={espacio.titulo} />
        <h2>{espacio.titulo}</h2>
        <ul>
          {espacio.caracteristicas.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
    </div>
  ))}
</main> */