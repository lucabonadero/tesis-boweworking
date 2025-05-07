import React from "react";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import TablaFinanciera from "../../components/tablafinanciera.jsx";

import styles from "../../styles/admin/gestionfinanciera.module.css";

export default function GestionFinanciera() {
    return (
        <div>
            <Header isEmpleado={true} />
            <main className={styles.main}>
  <h1 className={styles.header}>Gestión Financiera</h1>

  {/* Contenedor horizontal */}
  <div className={styles.reservasWrapper}>
    <div className={styles.tablaContainer}>
      <TablaFinanciera />
    </div>
    <div className={styles.formularioWrapper}>
    <form action="/formulario.html" method="POST">
    <div className={styles.form__group}>
      <label htmlFor="cliente">Cliente:</label>
      <select id="cliente" name="cliente" required>
        <option value="">Seleccionar cliente</option>
        <option value="cliente1">Matías Dutto</option>
        <option value="cliente2">Esteban Belcuore</option>
      </select>
    </div>

    <div className={styles.form__group}>
      <label htmlFor="monto">Monto:</label>
      <input type="number" id="monto" name="monto" required />
    </div>

    <div className={styles.form__group}>
      <label htmlFor="metodo">Método de pago:</label>
      <select id="metodo" name="metodo" required>
        <option value="">Seleccionar</option>
        <option value="qr">QR</option>
        <option value="efectivo">Efectivo</option>
        <option value="tarjeta">Tarjeta</option>
      </select>
    </div>

    <div className={styles.form__group}>
      <label>Estado del pago:</label>
      <div className={styles.radioGroup}>
        <label>
          <input type="radio" name="estado" value="pagado" required />
          <span className={styles.radioPagado}>Pagado</span>
        </label>
        <label>
          <input type="radio" name="estado" value="pendiente" />
          <span className={styles.radioPendiente}>Pendiente</span>
        </label>
      </div>
    </div>

    <div className={styles.formButtons}>
      <button type="submit" className={styles.buttonPrimario}>
        Registrar Pago
      </button>
    </div>
  </form>
    </div>
  </div>

  {/* Barra de datos resumen */}
  <div className={styles.resumenFinanciero}>
    <div className={styles.resumenBox}>
      <div className={styles.iconoWrapper}>
        💰
      </div>
      <div>
        <p>Total Ingresos</p>
        <h3>$5,423</h3>
        <span className={styles.subida}>▲ 16% este mes</span>
      </div>
    </div>
    <div className={styles.resumenBox}>
      <div className={styles.iconoWrapper}>
        🔄
      </div>
      <div>
        <p>Balance</p>
        <h3>$1,893</h3>
        <span className={styles.bajada}>▼ 1% este mes</span>
      </div>
    </div>
    <div className={styles.resumenBox}>
      <div className={styles.iconoWrapper}>
        👛
      </div>
      <div>
        <p>Pagos pendientes</p>
        <h3>16</h3>
      </div>
    </div>
  </div>
</main>
            <Footer isEmpleado={true} />

        </div>
    );
}