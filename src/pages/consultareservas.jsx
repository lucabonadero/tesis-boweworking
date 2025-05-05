import React from "react";
import Header from "../components/header.jsx";
import Footer from "../components/footer.jsx";
import styles from "../styles/consultareservas.module.css";
import "../styles/global.css";
import Tabla from "../components/tabla.jsx";

export default function ControlReservas() {
    return (
        <div>
            <Header isEmpleado={true} />

            <main className={styles.main}>
                    <h1 className={styles.header}>
                        Control de Reservas
                    </h1>


                {/* Nuevo contenedor flex para tabla y formulario */}
                <div className={styles.reservasWrapper}>
                    <div className={styles.tablaContainer}>
                        <Tabla className={styles.tabla} />
                    </div>

                    <div className={styles.containerFormulario}>
                        <h2 className={styles.formulario__header}>Alta/Baja/Modificacion de Reserva</h2>
                        <form action="/formulario.html" method="POST">
                            <div className={styles.form__group}>
                                <label htmlFor="nombre">Nombre:</label>
                                <input type="text" id="nombre" name="nombre" required />
                            </div>
                            <div className={styles.form__group}>
                                <label htmlFor="apellido">Apellido:</label>
                                <input type="text" id="apellido" name="apellido" required />
                            </div>
                            <div className={styles.form__group}>
                                <label htmlFor="email">Correo Electrónico:</label>
                                <input type="email" id="email" name="email" required />
                            </div>
                            <div className={styles.form__group}>
                                <label htmlFor="space">Espacio a reservar:</label>
                                <select id="space" name="space">
                                    <option value="planta-baja">Planta Baja</option>
                                    <option value="oficina-individual">Oficina Individual</option>
                                    <option value="sala-de-reuniones">Sala de Reuniones</option>
                                    <option value="terraza">Terraza</option>
                                </select>
                            </div>
                            <div className={styles.form__group}>
                                <label htmlFor="fecha">Fecha y Hora de la Visita:</label>
                                <input type="datetime-local" id="fecha" name="fecha" required />
                            </div>

                            <div className={styles.formButtons}>
                                <button type="reset" className={styles.buttonSecundario}>Limpiar</button>
                                <button type="button" className={styles.buttonEliminar}>Eliminar</button>
                                <button type="submit" className={styles.buttonPrincipal}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </main>
            
            <Footer />
        </div>
    );
}