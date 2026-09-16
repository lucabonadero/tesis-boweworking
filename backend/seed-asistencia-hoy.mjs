/**
 * Seed de datos de prueba para el Control de Asistencia.
 *
 * Crea reservas de HOY sobre clientes y recursos que ya existen en la base,
 * cubriendo los estados que muestra el panel: activa (por recepcionar),
 * en_curso, completada y no_asistio.
 *
 * Uso:
 *   node seed-asistencia-hoy.mjs          -> inserta las reservas
 *   node seed-asistencia-hoy.mjs --limpiar -> borra SOLO las que creó este script
 *
 * Las reservas creadas se marcan con Monto terminado en .77 para poder
 * identificarlas y limpiarlas después sin tocar datos reales.
 */
import pool from "./src/config/db.js";

const MARCA = 0.77; // centavos-marca para reconocer las filas de prueba
const LIMPIAR = process.argv.includes("--limpiar");

// El coworking opera de 09:00 a 21:00 (ver src/utils/coworkingHours.js). Los
// horarios se anclan a esa jornada en vez de a "ahora" para que las reservas de
// prueba sean siempre plausibles, aunque el script se corra de madrugada.
const APERTURA = 9;
const CIERRE = 21;

const ahora = new Date();
const horaActual = ahora.getHours() + ahora.getMinutes() / 60;
// Ancla de "presente": dentro de la jornada es la hora real; fuera de ella se
// simula media tarde, así el panel muestra un día de trabajo verosímil.
const ancla = horaActual >= APERTURA + 1 && horaActual <= CIERRE - 1 ? horaActual : 15;

const hhmm = (horaDecimal) => {
  // Se redondea a la media hora y se recorta a la ventana operativa.
  const acotada = Math.min(Math.max(horaDecimal, APERTURA), CIERRE);
  const totalMin = Math.round((acotada * 60) / 30) * 30;
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
};
// Desplazamiento en minutos respecto del ancla.
const desplazar = (minutos) => hhmm(ancla + minutos / 60);

async function main() {
  const client = await pool.connect();
  try {
    if (LIMPIAR) {
      const { rowCount } = await client.query(
        `DELETE FROM "Reservas"
         WHERE "DiaReserva" = CURRENT_DATE
           AND ("Monto"::numeric % 1) = $1`,
        [MARCA]
      );
      console.log(`Listo: ${rowCount} reserva(s) de prueba eliminadas.`);
      return;
    }

    // Se toman clientes y recursos REALES para respetar las FKs.
    const { rows: clientes } = await client.query(
      `SELECT "DNI", "Nombre", "Apellido" FROM "Cliente"
       WHERE "Nombre" IS NOT NULL AND btrim("Nombre") <> ''
       ORDER BY "DNI" LIMIT 8`
    );
    const { rows: recursos } = await client.query(
      `SELECT "idRecurso", "Nombre", "PrecioHora" FROM "Recursos"
       WHERE "Activo" = true AND "EsReservablePorTurno" = true
       ORDER BY "idRecurso" LIMIT 8`
    );

    if (clientes.length < 4 || recursos.length < 4) {
      throw new Error(
        `Datos insuficientes en la base: ${clientes.length} cliente(s), ${recursos.length} recurso(s).`
      );
    }

    const nombreDe = (c) => `${c.Nombre} ${c.Apellido || ""}`.trim();

    // idRecurso distinto por reserva: evita solaparse en el mismo recurso.
    //
    // Ojo con las 'en_curso': sweepEnCursoVencidas() (reservas.controller.js)
    // las pasa a 'completada' en cuanto su HorarioFin queda en el pasado. Por eso
    // su fin se deja cómodamente por delante del ancla.
    const plan = [
      // Por recepcionar (columna izquierda del panel)
      { estado: "activa",     ini: desplazar(60),   fin: desplazar(180) },
      { estado: "activa",     ini: desplazar(90),   fin: desplazar(210) },
      { estado: "activa",     ini: desplazar(120),  fin: desplazar(240) },
      // Recepcionadas (columna derecha), un caso por estado
      { estado: "en_curso",   ini: desplazar(-60),  fin: desplazar(120) },
      { estado: "en_curso",   ini: desplazar(-30),  fin: desplazar(150) },
      { estado: "completada", ini: desplazar(-240), fin: desplazar(-120) },
      { estado: "no_asistio", ini: desplazar(-180), fin: desplazar(-90) },
    ];

    const creadas = [];
    await client.query("BEGIN");

    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const cliente = clientes[i % clientes.length];
      const recurso = recursos[i % recursos.length];

      // Monto plausible según el precio del recurso, con la marca de prueba.
      const precioHora = parseFloat(recurso.PrecioHora) || 2000;
      const monto = Math.round(precioHora * 2) + MARCA;

      const { rows } = await client.query(
        `INSERT INTO "Reservas"
           ("DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva","Estado")
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,'turno',$7)
         RETURNING "idReserva"`,
        [cliente.DNI, nombreDe(cliente), recurso.idRecurso, p.ini, p.fin, monto, p.estado]
      );

      creadas.push({
        id: rows[0].idReserva,
        cliente: nombreDe(cliente),
        recurso: recurso.Nombre,
        horario: `${p.ini}-${p.fin}`,
        estado: p.estado,
      });
    }

    await client.query("COMMIT");

    console.table(creadas);
    console.log(`\n${creadas.length} reservas creadas para hoy.`);
    console.log("Para borrarlas: node seed-asistencia-hoy.mjs --limpiar");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
