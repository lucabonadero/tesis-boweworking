import React from "react";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import AsistenteReservasPanel from "../../components/AsistenteReservasPanel.jsx";
import "../../styles/global.css";
import styles from "../../styles/public/asistenteReservas.module.css";

export default function AsistenteReservas() {
  return (
    <div>
      <Header />
      <main className={`${styles.wrap} ${styles.pageShell}`}>
        <AsistenteReservasPanel autoPromptLogin showPageHeading />
      </main>
      <Footer />
    </div>
  );
}
