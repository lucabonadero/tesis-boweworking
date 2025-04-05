import React from "react";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__cont">
        <h3>Bo WeWorking</h3>
        <p>
          ¡Es el lugar! Vení a conocernos, estamos ubicados en Buenos Aires 1120,
          Nueva Córdoba
        </p>
      </div>
      <div className="footer__links">
        <h3>Información</h3>
        <p>Dirección: Calle Principal, Ciudad</p>
        <p>Horario: Lunes a Viernes, 10:00 AM - 6:00 PM</p>
      </div>
      <div className="footer__help">
        <h3>Vínculos de Ayuda</h3>
        <ul>
          <li><a href="">Preguntas Frecuentes</a></li>
          <li><a href="">Política de Privacidad</a></li>
          <li><a href="">Términos y Condiciones</a></li>
        </ul>
      </div>
    </footer>
  );
}