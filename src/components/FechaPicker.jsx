import React, { useState, useEffect, useCallback } from "react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { CalendarOutlined } from "@ant-design/icons";
import styles from "../styles/components/fechaPicker.module.css";

const MOBILE_QUERY = "(max-width: 768px)";

/**
 * Selector de fecha con dos caras: en escritorio mantiene el DatePicker de AntD
 * (ya integrado con los estilos del formulario) y en mobile abre una hoja
 * inferior con react-day-picker, que tiene celdas táctiles grandes.
 *
 * El contrato hacia afuera es el mismo que el del DatePicker de AntD:
 * `value`/`onChange` hablan en dayjs y `disabledDate` recibe un dayjs.
 */
export default function FechaPicker({
  id,
  value,
  onChange,
  disabledDate,
  placeholder = "Seleccioná el día",
}) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onMqChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onMqChange);
    return () => mql.removeEventListener("change", onMqChange);
  }, []);

  // Al cerrarse la hoja hay que devolver el scroll al body, incluso si el
  // componente se desmonta con el panel todavía abierto.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, cerrar]);

  if (!isMobile) {
    return (
      <DatePicker
        id={id}
        format="DD/MM/YYYY"
        className={styles.desktopPicker}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabledDate={disabledDate}
        getPopupContainer={() => document.body}
        popupClassName={styles.desktopPopup}
      />
    );
  }

  const seleccionada = value ? value.toDate() : undefined;
  // react-day-picker entrega Date nativo; el resto de la app razona en dayjs.
  const matcherDeshabilitado = disabledDate
    ? (date) => disabledDate(dayjs(date))
    : undefined;

  return (
    <>
      <button
        id={id}
        type="button"
        className={[styles.trigger, value ? styles.triggerFilled : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setAbierto(true)}
      >
        <CalendarOutlined className={styles.triggerIcon} aria-hidden />
        <span className={styles.triggerText}>
          {value ? value.locale("es").format("dddd D [de] MMMM") : placeholder}
        </span>
      </button>

      {abierto && (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Seleccionar fecha"
          >
            <div className={styles.sheetHandle} aria-hidden />
            <div className={styles.sheetHeader}>
              <span className={styles.sheetTitle}>Elegí una fecha</span>
              <button type="button" className={styles.sheetClose} onClick={cerrar}>
                Cerrar
              </button>
            </div>

            <DayPicker
              mode="single"
              locale={es}
              weekStartsOn={1}
              selected={seleccionada}
              defaultMonth={seleccionada ?? new Date()}
              disabled={matcherDeshabilitado}
              startMonth={new Date()}
              showOutsideDays={false}
              className={styles.dayPicker}
              onSelect={(date) => {
                if (!date) return;
                onChange(dayjs(date));
                cerrar();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
