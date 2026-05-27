import React from "react";
import BotonVolverPanel from "./BotonVolverPanel.jsx";
import styles from "../styles/components/adminPageHeader.module.css";

/**
 * Header unificado para todas las páginas administrativas.
 * Render: BotonVolverPanel + hero dark navy con eyebrow / título / descripción / meta + slot de acciones.
 *
 * Props:
 *  - eyebrow:     string         — kicker arriba del título (ej. "Análisis operativo").
 *  - icon:        ReactNode      — icono a la izquierda del título.
 *  - title:       string|ReactNode — título grande (obligatorio).
 *  - description: string|ReactNode — copy de apoyo bajo el título.
 *  - meta:        ReactNode      — fila extra debajo (período, fecha, contadores...).
 *  - actions:     ReactNode      — slot a la derecha (botones, datepicker...).
 *  - showBackButton: boolean     — default true, oculta BotonVolverPanel cuando es false.
 */
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
