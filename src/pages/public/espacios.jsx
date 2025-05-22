import React from "react";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import styles from "../../styles/public/espacios.module.css";
import "../../styles/global.css";
import Carrusel from "../../components/carrusel.jsx";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
  
 export default function Espacios () {
    const location = useLocation();

    useEffect(() => {
    const scrollTo = location.state?.scrollTo;
    if (scrollTo) {
      const element = document.getElementById(scrollTo);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth" });
        }, 300); // Espera un poco por si hay imágenes cargando
      }
    }
  }, [location]);

    return (
        <div>
            <Header />
            <div className={styles.espacios__container}>
                <header className={styles.espacios__header}>
                <h1>Conocé nuestros espacios</h1>
                <p>Elegí el que mejor se adapte a tus necesidades</p>
                </header>
                <Carrusel />
            </div>
            <Footer />
        </div>
    );
};