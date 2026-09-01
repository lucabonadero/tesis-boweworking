import { useState, useMemo, useCallback, Fragment } from "react";
import styles from "../styles/admin/gestionDisponibilidad.module.css";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HORA_DESDE = 9;
const HORA_HASTA = 21;
const HORAS = Array.from({ length: HORA_HASTA - HORA_DESDE }, (_, i) => HORA_DESDE + i);

const hhmm = (h) => `${String(h).padStart(2, "0")}:00`;

/** Franjas -> Set de celdas "dia-hora" para pintar rápido. */
function franjasACeldas(franjas) {
  const celdas = new Set();
  for (const f of franjas) {
    const desde = Number(String(f.horaInicio).slice(0, 2));
    const hasta = Number(String(f.horaFin).slice(0, 2));
    for (let h = desde; h < hasta; h++) celdas.add(`${f.diaSemana}-${h}`);
  }
  return celdas;
}

/** Celdas -> franjas, fusionando horas contiguas del mismo día. */
function celdasAFranjas(celdas) {
  const franjas = [];
  for (let dia = 0; dia <= 6; dia++) {
    let inicio = null;
    for (let h = HORA_DESDE; h <= HORA_HASTA; h++) {
      const activa = h < HORA_HASTA && celdas.has(`${dia}-${h}`);
      if (activa && inicio === null) inicio = h;
      if (!activa && inicio !== null) {
        franjas.push({ diaSemana: dia, horaInicio: hhmm(inicio), horaFin: hhmm(h) });
        inicio = null;
      }
    }
  }
  return franjas;
}

export default function GrillaDisponibilidad({ value = [], onChange, bloqueos = [] }) {
  const celdas = useMemo(() => franjasACeldas(value), [value]);
  const [pintando, setPintando] = useState(null); // "activar" | "desactivar" | null

  const bloqueadas = useMemo(() => {
    const set = new Set();
    for (const b of bloqueos) {
      const ini = new Date(b.FechaInicio);
      const fin = new Date(b.FechaFin);
      for (let d = new Date(ini); d < fin; d.setHours(d.getHours() + 1)) {
        set.add(`${d.getDay()}-${d.getHours()}`);
      }
    }
    return set;
  }, [bloqueos]);

  const aplicar = useCallback(
    (dia, hora, modo) => {
      const clave = `${dia}-${hora}`;
      const siguiente = new Set(celdas);
      if (modo === "activar") siguiente.add(clave);
      else siguiente.delete(clave);
      onChange(celdasAFranjas(siguiente));
    },
    [celdas, onChange]
  );

  const alPresionar = (dia, hora) => {
    const modo = celdas.has(`${dia}-${hora}`) ? "desactivar" : "activar";
    setPintando(modo);
    aplicar(dia, hora, modo);
  };

  const alEntrar = (dia, hora) => {
    if (pintando) aplicar(dia, hora, pintando);
  };

  const copiarLunesATodos = () => {
    const delLunes = value.filter((f) => f.diaSemana === 1);
    const nuevas = [];
    for (let dia = 0; dia <= 6; dia++) {
      for (const f of delLunes) nuevas.push({ ...f, diaSemana: dia });
    }
    onChange(nuevas);
  };

  return (
    <div onMouseUp={() => setPintando(null)} onMouseLeave={() => setPintando(null)}>
      <div className={styles.grillaAcciones}>
        <button type="button" onClick={copiarLunesATodos}>Copiar lunes a toda la semana</button>
        <button type="button" onClick={() => onChange([])}>Limpiar</button>
      </div>

      <div className={styles.grilla}>
        <div className={styles.celdaHeader} />
        {DIAS.map((d) => (
          <div key={d} className={styles.celdaHeader}>{d}</div>
        ))}

        {HORAS.map((h) => (
          <Fragment key={h}>
            <div className={styles.celdaHora}>{hhmm(h)}</div>
            {DIAS.map((_, dia) => {
              const clave = `${dia}-${h}`;
              const bloqueada = bloqueadas.has(clave);
              const activa = celdas.has(clave);
              return (
                <div
                  key={clave}
                  role="gridcell"
                  aria-label={`${DIAS[dia]} ${hhmm(h)}`}
                  aria-selected={activa}
                  className={[
                    styles.celda,
                    activa ? styles.celdaActiva : "",
                    bloqueada ? styles.celdaBloqueada : "",
                  ].join(" ")}
                  onMouseDown={() => alPresionar(dia, h)}
                  onMouseEnter={() => alEntrar(dia, h)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <p className={styles.leyenda}>
        Verde: disponible. Rojo: bloqueado. Arrastrá para pintar varias horas.
      </p>
    </div>
  );
}
