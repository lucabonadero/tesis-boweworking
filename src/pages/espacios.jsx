import React from "react";
import Header from "../components/header.jsx";
import Footer from "../components/footer.jsx";
import "../styles/espacios.css";

import imgprimerpiso from '../assets/primerpiso.png';
import imgsalareuniones from '../assets/salareuniones.png';
import imgterraza from '../assets/terrazarda.png';
import imgplanta from '../assets/plantabaja.png';

const espacios = [
    {
        titulo: 'Oficina Grande',
        imagen: imgplanta,
        caracteristicas: [
          'Capacidad hasta 8 personas',
          'Salón privado',
          'Proyector y pantalla',
          'Escritorios ergonómicos',
        ],
    },
    {
      titulo: 'Oficina Pequeña',
      imagen: imgprimerpiso,
      caracteristicas: [
        'Ideal para 1 o 2 personas',
        'WiFi de alta velocidad',
        'Climatización',
        'Acceso 24hs',
      ],
    },
    {
      titulo: 'Oficina Mediana',
      imagen: imgsalareuniones,
      caracteristicas: [
        'Para equipos de hasta 4 personas',
        'TV Smart y Pizarra',
        'Vista al frente',
        'Ambiente silencioso',
      ],
    },
    {
      titulo: 'Oficina Grande',
      imagen: imgterraza,
      caracteristicas: [
        'Capacidad hasta 8 personas',
        'Salón privado',
        'Proyector y pantalla',
        'Escritorios ergonómicos',
      ],
    },
  ];
  
 export default function Espacios () {
    return (
        <div>
            <Header />
            <div className="espacios__container">
                <header className="espacios__header">
                <h1>Conocé nuestros espacios</h1>
                <p>Elegí el que mejor se adapte a tus necesidades</p>
                </header>
        
                <main className="espacios__grid">
                {espacios.map((espacio, index) => (
                    <div key={index} className="espacio__card">
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