import { useState, useMemo, useCallback, Fragment } from "react";
import styles from "../styles/admin/gestionDisponibilidad.module.css";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HORA_DESDE = 9;
const HORA_HASTA = 21;
const HORAS = Array.from({ length: HORA_HASTA - HORA_DESDE }, (_, i) => HORA_DESDE + i);

const hhmm = (h) => `${String(h).padStart(2, "0")}:00`;
const clave = (dia, hora) => `${dia}-${hora}`;

/** Franjas disponibles -> Set de celdas CERRADAS (el complemento de la semana). */
function franjasACeldasCerradas(franjas) {
  // Sin franjas el backend abre la ventana global completa: nada cerrado.
  if (!Array.isArray(franjas) || franjas.length === 0) return new Set();

  const abiertas = new Set();
  for (const f of franjas) {
    const desde = Number(String(f.horaInicio).slice(0, 2));
    const hasta = Number(String(f.horaFin).slice(0, 2));
    for (let h = desde; h < hasta; h++) abiertas.add(clave(f.diaSemana, h));
  }

  const cerradas = new Set();
  for (let dia = 0; dia <= 6; dia++) {
    for (const h of HORAS) {
      if (!abiertas.has(clave(dia, h))) cerradas.add(clave(dia, h));
    }
  }
  return cerradas;
}

/**
 * Set de celdas cerradas -> franjas DISPONIBLES para el backend, fusionando
 * horas contiguas del mismo día.
 *
 * Sin nada cerrado devuelve [], que es como el backend representa "abierto
 * siempre": mandar la semana entera guardaría lo mismo con más filas.
 */
function celdasCerradasAFranjas(cerradas) {
  if (cerradas.size === 0) return [];

  const franjas = [];
  for (let dia = 0; dia <= 6; dia++) {
    let inicio = null;
    for (let h = HORA_DESDE; h <= HORA_HASTA; h++) {
      const abierta = h < HORA_HASTA && !cerradas.has(clave(dia, h));
      if (abierta && inicio === null) inicio = h;
      if (!abierta && inicio !== null) {
        franjas.push({ diaSemana: dia, horaInicio: hhmm(inicio), horaFin: hhmm(h) });
        inicio = null;
      }
    }
  }
  return franjas;
}

/**
 * Grilla semanal de horarios. Se pinta lo CERRADO (rojo): todo recurso está
 * habilitado por defecto, así que marcar lo disponible no aportaba información.
 */
export default function GrillaDisponibilidad({ value = [], onChange, bloqueos = [] }) {
  const cerradas = useMemo(() => franjasACeldasCerradas(value), [value]);
  const [pintando, setPintando] = useState(null); // "cerrar" | "abrir" | null

  const bloqueadas = useMemo(() => {
    const set = new Set();
    for (const b of bloqueos) {
      const ini = new Date(b.FechaInicio);
      const fin = new Date(b.FechaFin);
      for (let d = new Date(ini); d < fin; d.setHours(d.getHours() + 1)) {
        set.add(clave(d.getDay(), d.getHours()));
      }
    }
    return set;
  }, [bloqueos]);

  const aplicar = useCallback(
    (dia, hora, modo) => {
      const siguiente = new Set(cerradas);
      if (modo === "cerrar") siguiente.add(clave(dia, hora));
      else siguiente.delete(clave(dia, hora));
      onChange(celdasCerradasAFranjas(siguiente));
    },
    [cerradas, onChange]
  );

  const alPresionar = (dia, hora) => {
    const modo = cerradas.has(clave(dia, hora)) ? "abrir" : "cerrar";
    setPintando(modo);
    aplicar(dia, hora, modo);
  };

  const alEntrar = (dia, hora) => {
    if (pintando) aplicar(dia, hora, pintando);
  };

  const copiarLunesATodos = () => {
    const siguiente = new Set();
    for (let dia = 0; dia <= 6; dia++) {
      for (const h of HORAS) {
        if (cerradas.has(clave(1, h))) siguiente.add(clave(dia, h));
      }
    }
    onChange(celdasCerradasAFranjas(siguiente));
  };

  return (
    <div onMouseUp={() => setPintando(null)} onMouseLeave={() => setPintando(null)}>
      <div className={styles.grillaAcciones}>
        <button type="button" onClick={copiarLunesATodos}>Copiar lunes a toda la semana</button>
        <button type="button" onClick={() => onChange([])}>Abrir todo</button>
      </div>

      <div className={styles.grillaScroll}>
        <div className={styles.grilla}>
          <div className={styles.celdaHeader} />
          {DIAS.map((d) => (
            <div key={d} className={styles.celdaHeader}>{d}</div>
          ))}

          {HORAS.map((h) => (
            <Fragment key={h}>
              <div className={styles.celdaHora}>{hhmm(h)}</div>
              {DIAS.map((_, dia) => {
                const k = clave(dia, h);
                const cerrada = cerradas.has(k);
                const bloqueada = bloqueadas.has(k);
                return (
                  <div
                    key={k}
                    role="gridcell"
                    aria-label={`${DIAS[dia]} ${hhmm(h)}`}
                    aria-selected={cerrada}
                    className={[
                      styles.celda,
                      cerrada ? styles.celdaCerrada : "",
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
      </div>

      <p className={styles.leyenda}>
        Pintá en rojo las horas cerradas. Lo que quede sin pintar está habilitado.
        Arrastrá para marcar varias horas.
      </p>
    </div>
  );
}
