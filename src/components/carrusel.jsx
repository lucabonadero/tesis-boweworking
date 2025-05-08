import Slider from "react-slick";
import React from "react";
import styles from "../styles/public/espacios.module.css";
import img1 from '../assets/espacios_sillas.png';
import img2 from '../assets/espacios_sillones.png';
import img3 from '../assets/oficina_individual.png';
import img4 from '../assets/salareuniones.png';
import img5 from '../assets/terrazarda.png';
import img6 from '../assets/espacios_plantabaja.png';

const pisos = [
  {
    titulo: "Planta Baja",
    descripcion: "Espacios abiertos ideales para coworking y reuniones informales.",
    imagenes: [img6, img1, img2],
  },
  {
    titulo: "Primer Piso",
    descripcion: "Oficinas individuales y salas de reuniones totalmente equipadas.",
    imagenes: [img3, img4, img5],
  },
  {
    titulo: "Terraza",
    descripcion: "Un ambiente relajado con sillones y vistas al exterior.",
    imagenes: [img2, img5, img1],
  },
];

const settings = {
  infinite: true,
  speed: 1000,
  slidesToShow: 3,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 4000,
  centerMode: true,
  centerPadding: "0px",
  arrows: false,
};

export default function CarruselEdificio() {
  return (
    <div className={styles.container}>
      {pisos.map((piso, index) => (
        <div key={index} className={styles.carruselWrapper}>
          <div className={styles.textContainer}>
            <h2 className={styles.titulo}>{piso.titulo}</h2>
            <p className={styles.descripcion}>{piso.descripcion}</p>
          </div>
          <Slider {...settings}>
            {piso.imagenes.map((img, i) => (
              <div key={i} className={styles.slide}>
                <img src={img} alt={`${piso.titulo} - Imagen ${i + 1}`} />
              </div>
            ))}
          </Slider>
        </div>
      ))}
    </div>
  );
}