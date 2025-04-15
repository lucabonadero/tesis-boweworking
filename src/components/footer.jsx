import React from "react";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__top">
        <div className="footer__info">
          <div className="footer__bo">
            <h3>Bo WeWorking</h3>
            <p>
              ¡Es el lugar! Vení a conocernos, estamos ubicados en Buenos Aires 1120,
              Nueva Córdoba
            </p>
          </div>
          <div className="footer__contacts">
            <div className="footer__social">
              <i className="fab fa-instagram"></i>
              <i className="fab fa-dribbble"></i>
              <i className="fab fa-twitter"></i>
              <i className="fab fa-youtube"></i>
            </div>
            
            <div className="footer__links">
              <a href="#">Home</a>
              <a href="#">Servicios</a>
              <a href="#">Espacios</a>
              <a href="#">Acerca de nosotros</a>
            </div>
          </div>
        </div>

        <div className="footer__cards">
          <div className="footer__card">
            <h4>Contáctanos</h4>
            <p>Consulta por WhatsApp</p>
            <a href="#">Click acá →</a>
          </div>
          <div className="footer__card">
            <h4>Hace tu reserva</h4>
            <p>Nuestro apartado de reservas web</p>
            <a href="#">Click acá →</a>
          </div>
        </div>
      </div>
    </footer>
  );
}