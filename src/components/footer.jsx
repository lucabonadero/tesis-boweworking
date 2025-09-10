import React from "react";

export default function Footer() {
  return (
    <footer className="footer" id="footer">
      <div className="footer__top">
        <div className="footer__info">
          <div className="footer__bo">
            <h3>Bo WeWorking</h3>
            <p>
              ¡Es el lugar! Vení a conocernos, estamos ubicados en Buenos Aires 1120,
              Nueva Córdoba.
            </p>
            <p>Contacto: +54 9 351 8522482</p>
          </div>
          <div className="footer__contacts">
            <div className="footer__social">
              <a className="fab fa-instagram" href="https://www.instagram.com/bo.weworking/" target="_blank"></a>
              <a class="fa fa-image" href="https://boweworking.pixieset.com/boweworking/" target="_blank"></a>
              
            </div>
            <div className="footer__links">
              <a href="/">Home</a>
              <a href="/registro">Reservar</a>
              <a href="/espacios">Espacios</a>
            </div> 
          </div>
        </div>

        <div className="footer__cards">
          <div className="footer__card">
            <h4>Contáctanos</h4>
            <p>Consulta por WhatsApp</p>
            <a href="https://api.whatsapp.com/send/?phone=5493518522482&text&type=phone_number&app_absent=0" target="_blank">Click acá →</a>
          </div>
          <div className="footer__card">
            <h4>Hace tu reserva</h4>
            <p>Nuestro apartado de reservas web</p>
            <a href="/registro">Click acá →</a>
          </div>
          <div className="footer__card">
            <h4>Ubicación</h4>
            <div style={{ width: '100%', height: '150px' }}>
              <iframe
                title="Ubicación Bo WeWorking"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3439.517747003803!2d-64.18820848487016!3d-31.426031903303956!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9432a28f6b0b2e0d%3A0x3621131f652a160f!2sBuenos%20Aires%201120%2C%20X5000IMT%20C%C3%B3rdoba!5e0!3m2!1ses!2sar!4v1682043233170!5m2!1ses!2sar"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
