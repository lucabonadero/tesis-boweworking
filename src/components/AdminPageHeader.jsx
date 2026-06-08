import React from "react";
import BotonVolverPanel from "./BotonVolverPanel.jsx";
import styles from "../styles/components/adminPageHeader.module.css";

// Encabezado unificado de las páginas administrativas: botón de volver + hero con
// título, descripción, meta y un espacio para acciones a la derecha.
export default function AdminPageHeader({
  eyebrow,
  icon,
  title,
  description,
  meta,
  actions,
  showBackButton = true,
}) {
  return (
    <>
      {showBackButton && (
        <div className={styles.backWrap}>
          <BotonVolverPanel />
        </div>
      )}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>
            {icon && <span className={styles.titleIcon}>{icon}</span>}
            <span>{title}</span>
          </h1>
          {description && <p className={styles.desc}>{description}</p>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </section>
    </>
  );
}
