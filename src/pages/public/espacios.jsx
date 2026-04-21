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
    window.scrollTo(0, 0);
    const scrollTo = location.state?.scrollTo;
    if (!scrollTo) return undefined;
    const t = window.setTimeout(() => {
      const element = document.getElementById(scrollTo);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.key, location.state?.scrollTo]);

    return (
        <div>
            <Header />
            <div className={styles.espacios__container}>
                <header className={styles.espacios__header}>
                <h1>Conocé nuestros espacios</h1>
                <p>Elegí el que mejor se adapte a tus necesidades</p>
                <p className={styles.espacios__subhint}>
                  Más abajo podés saltar entre planta baja, primer piso y terraza.
                </p>
                </header>
                <Carrusel />
            </div>
            <Footer />
        </div>
    );
};