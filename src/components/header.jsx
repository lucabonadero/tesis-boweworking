import React from "react";

export default function Header() {
  return (
    <header>
      <div className="header">
        <a href="/">
          <img className="logo" src="./src/assets/logoblanco.png" alt="Logo" />
        </a>
        <ul className="header__links">
          <li><a href="/">Home</a></li>
          <li><a href="registro">Reservar</a></li>
          <li><a href="espacios">Espacios</a></li>
          <li><a href="">Acerca de Nosotros</a></li>
        </ul>
      </div>
    </header>
  );
}