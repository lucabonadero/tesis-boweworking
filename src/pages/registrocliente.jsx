import "../styles/registrocliente.css";
import React from "react";

const RegistroCliente = () => {
    return (
<div>
      <header>
        <div className="header">
          <a href="/"><img className="logo" src="src/assets/logoblanco.png" alt="Logo" /></a>
          <ul className="header__links">
            <li><a href="/">Home</a></li>
            <li><a href="/reservar">Reservar</a></li>
            <li><a href="/espacios">Espacios</a></li>
            <li><a href="/nosotros">Acerca de Nosotros</a></li>
          </ul>
        </div>
      </header>

      <main className="main">
        <div className="form-container"></div>
        <h1 className="main__header">
          Reserva tu <span className="text__espacio">Espacio</span>
        </h1>

        <div className="form-and-carousel">
          <div className="container__form">
            <form id="reservaForm">
              <div className="form__group">
                <label htmlFor="nombre">Nombre:</label>
                <input type="text" id="nombre" name="nombre" required />
              </div>

              <div className="form__group">
                <label htmlFor="apellido">Apellido:</label>
                <input type="text" id="apellido" name="apellido" required />
              </div>

              <div className="form__group">
                <label htmlFor="email">Correo Electrónico:</label>
                <input type="email" id="email" name="email" required />
              </div>

              <div className="form__group">
                <label htmlFor="espacio">Espacio a reservar:</label>
                <select id="espacio" name="espacio">
                  <option value="oficina-pequeña">Oficina pequeña</option>
                  <option value="oficina-mediana">Oficina mediana</option>
                  <option value="oficina-grande">Oficina grande</option>
                </select>
              </div>

              <div className="form__group">
                <label htmlFor="fecha">Fecha y Hora de la Visita:</label>
                <input type="datetime-local" id="fecha" name="fecha" required />
              </div>

              <div className="form__group">
                <label htmlFor="tiempo">Tiempo de la Reserva:</label>
                <select id="tiempo" name="tiempo">
                  <option value="una-hora">1hs</option>
                  <option value="dos-horas">2hs</option>
                  <option value="tres-horas">3hs</option>
                </select>
              </div>

              <div className="form__group">
                <label htmlFor="business">Empresa:</label>
                <div className="business__container">
                  <label className="business__label" htmlFor="mayor">
                    La reserva es para una Empresa?
                  </label>
                  <input
                    className="business__checkbox"
                    type="checkbox"
                    id="mayor"
                    name="edad"
                    value="mayor"
                  />
                </div>
              </div>

              <div className="form__group">
                <input type="submit" value="Reservar" />
              </div>
            </form>
            <p id="mensaje"></p>
          </div>

          <div className="image__carousel">
            <button className="carousel__btn">❮</button>
            <img src="src/assets/frentebowe.jpg" alt="Bo WeWorking" />
            <button className="carousel__btn">❯</button>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer__cont">
          <h3>Contacto</h3>
          <p>Email: </p>
          <p>Teléfono: (123) 456-7890</p>
        </div>
        <div className="footer__info">
          <h3>Información</h3>
          <p>Dirección: Calle Principal, Ciudad</p>
          <p>Horario: Lunes a Viernes, 10:00 AM - 6:00 PM</p>
        </div>
        <div className="footer__links">
          <h3>Vínculos de Ayuda</h3>
          <ul>
            <li><a href="/">Preguntas Frecuentes</a></li>
            <li><a href="/">Política de Privacidad</a></li>
            <li><a href="/">Luca Bonadero  DJ</a></li>
          </ul>
        </div>
      </footer>

      <div id="modal" className="modal">
        <div className="modal-content">
          <span className="close">&times;</span>
          <p id="modal-message"></p>
        </div>
      </div>
    </div>

  );
};

export default RegistroCliente;