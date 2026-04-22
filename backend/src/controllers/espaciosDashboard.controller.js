import pool from "../config/db.js";
import PDFDocument from "pdfkit";
import { normalizarHorariosEnDisponibilidadRango } from "../services/horarioReserva.service.js";
import { lateralUltimaTransaccion } from "../services/transaccionUltimaJoin.service.js";

const DATE_OVERLAP_CONDITION = `
  (
    (COALESCE(r."TipoReserva", 'turno') = 'turno' AND r."DiaReserva" >= $1::DATE AND r."DiaReserva" <= $2::DATE)
    OR (r."TipoReserva" = 'semanal' AND r."DiaReserva" <= $2::DATE AND (r."DiaReserva" + 6) >= $1::DATE)
    OR (r."TipoReserva" = 'mensual' AND r."DiaReserva" <= $2::DATE AND (r."DiaReserva" + 29) >= $1::DATE)
  )
`;

export const obtenerDisponibilidadRango = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    if (!fechaDesde || !fechaHasta)
      return res.status(400).json({ message: "fechaDesde y fechaHasta son requeridos" });

    const { rows } = await pool.query(
      `SELECT
         rec."idRecurso",
         rec."idEspacio",
         rec."idRecursoPadre",
         rec."Nombre"       AS recurso_nombre,
         rec."Descripcion",
         rec."esCompleto",
         e."Nombre"         AS espacio_nombre,
         COALESCE(rv.total_reservas, 0)::INT AS total_reservas,
         COALESCE(rv.dias_ocupados, 0)::INT  AS dias_ocupados,
         rv.reservas_detalle
       FROM "Recursos" rec
       JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
       LEFT JOIN (
         SELECT
           r."idRecurso",
           COUNT(*)                       AS total_reservas,
           COUNT(DISTINCT r."DiaReserva") AS dias_ocupados,
           json_agg(json_build_object(
             'idReserva',      r."idReserva",
             'DiaReserva',     r."DiaReserva",
             'HorarioReserva', r."HorarioReserva",
             'HorarioFin',     r."HorarioFin",
             'TipoReserva',    COALESCE(r."TipoReserva", 'turno'),
             'Nombre',         r."Nombre",
             'Monto',          r."Monto"
           ) ORDER BY r."DiaReserva") AS reservas_detalle
         FROM "Reservas" r
         WHERE ${DATE_OVERLAP_CONDITION}
         GROUP BY r."idRecurso"
       ) rv ON rec."idRecurso" = rv."idRecurso"
       ORDER BY rec."idEspacio", rec."idRecursoPadre" NULLS FIRST, rec."idRecurso"`,
      [fechaDesde, fechaHasta]
    );

    normalizarHorariosEnDisponibilidadRango(rows);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener disponibilidad:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerMetricas = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    if (!fechaDesde || !fechaHasta)
      return res.status(400).json({ message: "fechaDesde y fechaHasta son requeridos" });

    const totalDias =
      Math.max(
        1,
        Math.ceil((new Date(fechaHasta) - new Date(fechaDesde)) / 86400000) + 1
      );

    const { rows: recursoStats } = await pool.query(
      `SELECT
         rec."idRecurso",
         rec."Nombre"      AS recurso_nombre,
         rec."esCompleto",
         rec."idRecursoPadre",
         e."Nombre"        AS espacio_nombre,
         e."Espacio"       AS id_espacio,
         COUNT(r."idReserva")              AS total_reservas,
         COALESCE(SUM(r."Monto"), 0)       AS total_montos_reservas,
         COALESCE(
           SUM(CASE WHEN t."EstadoPago" = 'Pagado' THEN r."Monto" ELSE 0 END),
           0
         )                                AS total_cobrado,
         COUNT(DISTINCT r."DiaReserva")    AS dias_ocupados
       FROM "Recursos" rec
       JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
       LEFT JOIN "Reservas" r ON rec."idRecurso" = r."idRecurso"
         AND ${DATE_OVERLAP_CONDITION}
       ${lateralUltimaTransaccion("r", "t")}
       GROUP BY rec."idRecurso", rec."Nombre", rec."esCompleto",
                rec."idRecursoPadre", e."Nombre", e."Espacio"
       ORDER BY total_reservas DESC`,
      [fechaDesde, fechaHasta]
    );

    const bookable = recursoStats.filter(
      (r) => parseInt(r.total_reservas) > 0 ||
             (!r.idRecursoPadre && !r.esCompleto) ||
             r.esCompleto
    );

    const totalReservas = bookable.reduce((s, r) => s + parseInt(r.total_reservas), 0);
    const totalMontosReservas = bookable.reduce((s, r) => s + parseFloat(r.total_montos_reservas), 0);
    const totalCobradoPagado = bookable.reduce((s, r) => s + parseFloat(r.total_cobrado), 0);

    const leafResources = recursoStats.filter((r) => {
      const isGroup = recursoStats.some((c) => c.idRecursoPadre === r.idRecurso);
      return !isGroup;
    });
    const totalLeaf = leafResources.length || 1;
    const sumOcupados = leafResources.reduce((s, r) => s + parseInt(r.dias_ocupados), 0);
    const ocupacionPromedio = Math.round((sumOcupados / (totalLeaf * totalDias)) * 100);

    const espacioMap = {};
    recursoStats.forEach((r) => {
      if (!espacioMap[r.id_espacio]) {
        espacioMap[r.id_espacio] = {
          nombre: r.espacio_nombre,
          totalReservas: 0,
          totalMontosReservas: 0,
          totalCobradoPagado: 0,
          recursosCount: 0,
          diasOcupados: 0,
        };
      }
      const sp = espacioMap[r.id_espacio];
      sp.totalReservas += parseInt(r.total_reservas);
      sp.totalMontosReservas += parseFloat(r.total_montos_reservas);
      sp.totalCobradoPagado += parseFloat(r.total_cobrado);
      const isGroup = recursoStats.some((c) => c.idRecursoPadre === r.idRecurso);
      if (!isGroup) {
        sp.recursosCount++;
        sp.diasOcupados += parseInt(r.dias_ocupados);
      }
    });

    const espacios = Object.entries(espacioMap).map(([id, sp]) => ({
      id: parseInt(id),
      nombre: sp.nombre,
      totalReservas: sp.totalReservas,
      totalMontosReservas: sp.totalMontosReservas,
      totalCobradoPagado: sp.totalCobradoPagado,
      /** @deprecated Usar totalMontosReservas (mismo valor). */
      totalIngresos: sp.totalMontosReservas,
      ocupacion: Math.round(
        (sp.diasOcupados / (Math.max(sp.recursosCount, 1) * totalDias)) * 100
      ),
    }));

    const topUso = leafResources
      .filter((r) => parseInt(r.total_reservas) > 0)
      .sort((a, b) => parseInt(b.total_reservas) - parseInt(a.total_reservas))
      .slice(0, 10)
      .map((r) => ({
        nombre: r.recurso_nombre,
        espacio: r.espacio_nombre,
        reservas: parseInt(r.total_reservas),
      }));

    const topMontosReservas = leafResources
      .filter((r) => parseFloat(r.total_montos_reservas) > 0)
      .sort((a, b) => parseFloat(b.total_montos_reservas) - parseFloat(a.total_montos_reservas))
      .slice(0, 10)
      .map((r) => ({
        nombre: r.recurso_nombre,
        espacio: r.espacio_nombre,
        montoReservas: parseFloat(r.total_montos_reservas),
      }));

    const topCobradoPagado = leafResources
      .filter((r) => parseFloat(r.total_cobrado) > 0)
      .sort((a, b) => parseFloat(b.total_cobrado) - parseFloat(a.total_cobrado))
      .slice(0, 10)
      .map((r) => ({
        nombre: r.recurso_nombre,
        espacio: r.espacio_nombre,
        cobrado: parseFloat(r.total_cobrado),
      }));

    res.json({
      resumen: {
        totalReservas,
        totalMontosReservas,
        totalCobradoPagado,
        /** @deprecated Mismo valor que totalMontosReservas (suma de Monto en reservas del período). */
        totalIngresos: totalMontosReservas,
        ocupacionPromedio,
        totalDias,
        recursosActivos: leafResources.filter((r) => parseInt(r.total_reservas) > 0).length,
        recursosTotal: leafResources.length,
      },
      espacios,
      topUso,
      topMontosReservas,
      topCobradoPagado,
      /** @deprecated Usar topMontosReservas. */
      topIngresos: topMontosReservas.map((x) => ({
        nombre: x.nombre,
        espacio: x.espacio,
        ingresos: x.montoReservas,
      })),
    });
  } catch (error) {
    console.error("Error al obtener métricas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

function drawTableRow(doc, y, cols, values, opts = {}) {
  const { bold, bg, fontSize: fs = 9 } = opts;
  if (bg) {
    doc.rect(cols[0].x - 4, y - 2, 500, 18).fill(bg).fill("#333");
  }
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs);
  cols.forEach((col, i) => {
    doc.text(String(values[i] ?? ""), col.x, y, {
      width: col.w,
      align: col.align || "left",
    });
  });
}

function drawBarChart(doc, startY, items, maxVal, label, color) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#333").text(label, 50, startY);
  let y = startY + 20;
  const barMaxW = 240;

  items.forEach((item) => {
    const pct = maxVal > 0 ? item.value / maxVal : 0;
    doc.font("Helvetica").fontSize(8).fillColor("#555")
      .text(item.label, 50, y, { width: 160, ellipsis: true });
    doc.rect(215, y + 1, barMaxW * pct, 10).fill(color);
    doc.rect(215, y + 1, barMaxW, 10).lineWidth(0.5).stroke("#ddd");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#333")
      .text(String(item.display), 465, y, { width: 60, align: "right" });
    y += 18;
  });
  return y + 5;
}

export const generarReportePDF = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    if (!fechaDesde || !fechaHasta)
      return res.status(400).json({ message: "fechaDesde y fechaHasta son requeridos" });

    const totalDias = Math.max(
      1,
      Math.ceil((new Date(fechaHasta) - new Date(fechaDesde)) / 86400000) + 1
    );

    const { rows: recursos } = await pool.query(
      `SELECT
         rec."idRecurso", rec."Nombre" AS recurso_nombre, rec."esCompleto",
         rec."idRecursoPadre", e."Nombre" AS espacio_nombre, e."Espacio" AS id_espacio,
         COUNT(r."idReserva")           AS total_reservas,
         COALESCE(SUM(r."Monto"), 0)    AS total_montos_reservas,
         COALESCE(
           SUM(CASE WHEN t."EstadoPago" = 'Pagado' THEN r."Monto" ELSE 0 END),
           0
         )                             AS total_cobrado,
         COUNT(DISTINCT r."DiaReserva") AS dias_ocupados
       FROM "Recursos" rec
       JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
       LEFT JOIN "Reservas" r ON rec."idRecurso" = r."idRecurso"
         AND ${DATE_OVERLAP_CONDITION}
       ${lateralUltimaTransaccion("r", "t")}
       GROUP BY rec."idRecurso", rec."Nombre", rec."esCompleto",
                rec."idRecursoPadre", e."Nombre", e."Espacio"
       ORDER BY e."Espacio", rec."idRecursoPadre" NULLS FIRST, rec."idRecurso"`,
      [fechaDesde, fechaHasta]
    );

    const leafResources = recursos.filter((r) => {
      const isGroup = recursos.some((c) => c.idRecursoPadre === r.idRecurso);
      return !isGroup;
    });
    const totalReservas = leafResources.reduce((s, r) => s + parseInt(r.total_reservas), 0);
    const totalMontosReservasPdf = leafResources.reduce((s, r) => s + parseFloat(r.total_montos_reservas), 0);
    const totalCobradoPdf = leafResources.reduce((s, r) => s + parseFloat(r.total_cobrado), 0);
    const totalLeaf = leafResources.length || 1;
    const sumOcup = leafResources.reduce((s, r) => s + parseInt(r.dias_ocupados), 0);
    const ocupacion = Math.round((sumOcup / (totalLeaf * totalDias)) * 100);

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reporte-espacios-${fechaDesde}_${fechaHasta}.pdf`
    );
    doc.pipe(res);

    doc.rect(0, 0, 595.28, 90).fill("#1a1a2e");
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#fff")
      .text("Reporte de Uso de Espacios", 50, 25, { align: "center" });
    doc.font("Helvetica").fontSize(11).fillColor("#ccc")
      .text(`Período: ${fechaDesde}  al  ${fechaHasta}`, 50, 55, { align: "center" });

    doc.fillColor("#333");
    let y = 110;
    const cardW = 93;
    const cards = [
      { label: "Total Reservas", value: String(totalReservas) },
      {
        label: "Montos en reservas",
        value: `$${totalMontosReservasPdf.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      },
      {
        label: "Cobrado confirmado",
        value: `$${totalCobradoPdf.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      },
      { label: "Ocupación", value: `${ocupacion}%` },
      { label: "Días analizados", value: String(totalDias) },
    ];
    cards.forEach((c, i) => {
      const x = 50 + i * (cardW + 6);
      doc.rect(x, y, cardW, 52).lineWidth(0.5).stroke("#ddd");
      doc.font("Helvetica").fontSize(6.5).fillColor("#888").text(c.label, x + 5, y + 6, { width: cardW - 10 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#222").text(c.value, x + 5, y + 22, { width: cardW - 10 });
    });

    y = 188;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1a1a2e").text("Detalle por Recurso", 50, y);
    y += 22;

    const cols = [
      { x: 50, w: 118, align: "left" },
      { x: 172, w: 92, align: "left" },
      { x: 268, w: 52, align: "center" },
      { x: 324, w: 72, align: "right" },
      { x: 400, w: 72, align: "right" },
      { x: 476, w: 52, align: "right" },
    ];
    drawTableRow(doc, y, cols, ["Recurso", "Espacio", "Res.", "Monto res.", "Cobrado", "Ocup."], {
      bold: true,
      bg: "#eef2f7",
      fontSize: 8,
    });
    y += 20;

    let currentEspacio = "";
    for (const r of recursos) {
      const isGroup = recursos.some((c) => c.idRecursoPadre === r.idRecurso);
      if (isGroup) continue;

      if (y > 740) {
        doc.addPage();
        y = 50;
      }

      if (r.espacio_nombre !== currentEspacio) {
        currentEspacio = r.espacio_nombre;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a1a2e")
          .text(currentEspacio, 50, y);
        y += 16;
      }

      const ocup = Math.round((parseInt(r.dias_ocupados) / totalDias) * 100);
      const nombre = r.idRecursoPadre ? `  └ ${r.recurso_nombre}` : r.recurso_nombre;
      drawTableRow(doc, y, cols, [
        nombre,
        "",
        parseInt(r.total_reservas),
        `$${parseFloat(r.total_montos_reservas).toFixed(2)}`,
        `$${parseFloat(r.total_cobrado).toFixed(2)}`,
        `${ocup}%`,
      ]);
      y += 16;
    }

    doc.addPage();
    y = 50;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1a1a2e").text("Gráficos de Uso e Ingresos", 50, y);
    y += 30;

    const topUso = leafResources
      .filter((r) => parseInt(r.total_reservas) > 0)
      .sort((a, b) => parseInt(b.total_reservas) - parseInt(a.total_reservas))
      .slice(0, 8);
    const maxReservas = topUso.length > 0 ? parseInt(topUso[0].total_reservas) : 1;
    y = drawBarChart(
      doc, y,
      topUso.map((r) => ({ label: r.recurso_nombre, value: parseInt(r.total_reservas), display: `${r.total_reservas} res.` })),
      maxReservas,
      "Recursos Más Utilizados",
      "#4e79a7"
    );

    y += 20;
    const topIng = leafResources
      .filter((r) => parseFloat(r.total_montos_reservas) > 0)
      .sort((a, b) => parseFloat(b.total_montos_reservas) - parseFloat(a.total_montos_reservas))
      .slice(0, 8);
    const maxIng = topIng.length > 0 ? parseFloat(topIng[0].total_montos_reservas) : 1;
    drawBarChart(
      doc, y,
      topIng.map((r) => ({
        label: r.recurso_nombre,
        value: parseFloat(r.total_montos_reservas),
        display: `$${parseFloat(r.total_montos_reservas).toFixed(0)}`,
      })),
      maxIng,
      "Mayor monto en reservas (período)",
      "#59a14f"
    );

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#999")
        .text(
          `Bo WeWorking — Generado el ${new Date().toLocaleDateString("es-AR")}  |  Página ${i + 1} de ${pages.count}`,
          50, 780, { align: "center", width: 495 }
        );
    }

    doc.end();
  } catch (error) {
    console.error("Error al generar reporte PDF:", error);
    if (!res.headersSent)
      res.status(500).json({ message: "Error al generar el reporte" });
  }
};
