import React from "react";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import styles from "../../styles/public/espacios.module.css";
import "../../styles/global.css";

import img1 from '../../assets/espacios_sillas.png';
import img2 from '../../assets/espacios_sillones.png';
import img3 from '../../assets/oficina_individual.png';
import img4 from '../../assets/salareuniones.png';
import img5 from '../../assets/terrazarda.png';
import img6 from '../../assets/espacios_plantabaja.png';


const espacios = [
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
  
 export default function Espacios () {
    return (
        <div>
            <Header />
            <div className={styles.espacios__container}>
                <header className={styles.espacios__header}>
                <h1>Conocé nuestros espacios</h1>
                <p>Elegí el que mejor se adapte a tus necesidades</p>
                </header>
        
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
                </main>
            </div>
            <Footer />
        </div>
    );
};