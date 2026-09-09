import pool from "../config/db.js";

// Devuelve el árbol completo: Pisos → Espacios (recursivos) → Recursos (recursivos).
// Con ?incluirInactivos=true también trae los desactivados.
export const obtenerEstructura = async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true";
  const filtroPiso = incluirInactivos ? "" : 'WHERE "Activo" = true';
  const filtroEsp = incluirInactivos ? "" : 'WHERE "Activo" = true';
  const filtroRec = incluirInactivos ? "" : 'WHERE "Activo" = true';

  try {
    const [pisos, espacios, recursos, conteoReservas] = await Promise.all([
      pool.query(`SELECT * FROM "Pisos" ${filtroPiso} ORDER BY "Orden", "idPiso"`),
      pool.query(`SELECT * FROM "Espacios" ${filtroEsp} ORDER BY "Orden", "Espacio"`),
      pool.query(`SELECT r.*, t.label AS tipo_label,
                         COALESCE(b."habilitado", false) AS "beneficioEstudiante"
                  FROM "Recursos" r
                  LEFT JOIN "TiposRecurso" t ON r."Tipo" = t.clave
                  LEFT JOIN "RecursoBeneficioEstudiante" b ON b."idRecurso" = r."idRecurso"
                  ${filtroRec}
                  ORDER BY "Orden", "idRecurso"`),
      pool.query(`
        SELECT "idRecurso",
               COUNT(*) FILTER (WHERE "DiaReserva" >= CURRENT_DATE) AS futuras,
               COUNT(*) AS total
        FROM "Reservas"
        GROUP BY "idRecurso"
      `),
    ]);

    const reservasPorRecurso = new Map(
      conteoReservas.rows.map((r) => [
        r.idRecurso,
        { futuras: Number(r.futuras), total: Number(r.total) },
      ])
    );

    // Indexar recursos por padre y por espacio
    const recursosPorPadre = new Map();
    const recursosPorEspacio = new Map();
    for (const r of recursos.rows) {
      const conteo = reservasPorRecurso.get(r.idRecurso) || { futuras: 0, total: 0 };
      const enriquecido = {
        ...r,
        reservasFuturas: conteo.futuras,
        reservasTotal: conteo.total,
        recursos: [],
      };
      if (r.idRecursoPadre != null) {
        if (!recursosPorPadre.has(r.idRecursoPadre)) recursosPorPadre.set(r.idRecursoPadre, []);
        recursosPorPadre.get(r.idRecursoPadre).push(enriquecido);
      } else {
        if (!recursosPorEspacio.has(r.idEspacio)) recursosPorEspacio.set(r.idEspacio, []);
        recursosPorEspacio.get(r.idEspacio).push(enriquecido);
      }
    }
    // Adjuntar sub-recursos
    for (const r of recursos.rows) {
      const hijos = recursosPorPadre.get(r.idRecurso);
      if (hijos) {
        // Buscar el recurso ya enriquecido dentro de su contenedor
        const contenedores = [
          ...(r.idRecursoPadre != null
            ? recursosPorPadre.get(r.idRecursoPadre) || []
            : recursosPorEspacio.get(r.idEspacio) || []),
        ];
        const propio = contenedores.find((x) => x.idRecurso === r.idRecurso);
        if (propio) propio.recursos = hijos;
      }
    }

    // Indexar espacios por padre y por piso
    const espaciosPorPadre = new Map();
    const espaciosPorPiso = new Map();
    for (const e of espacios.rows) {
      const enriquecido = {
        ...e,
        recursos: recursosPorEspacio.get(e.Espacio) || [],
        espacios: [],
      };
      if (e.idEspacioPadre != null) {
        if (!espaciosPorPadre.has(e.idEspacioPadre)) espaciosPorPadre.set(e.idEspacioPadre, []);
        espaciosPorPadre.get(e.idEspacioPadre).push(enriquecido);
      } else {
        if (!espaciosPorPiso.has(e.idPiso)) espaciosPorPiso.set(e.idPiso, []);
        espaciosPorPiso.get(e.idPiso).push(enriquecido);
      }
    }
    // Adjuntar sub-espacios
    for (const e of espacios.rows) {
      const hijos = espaciosPorPadre.get(e.Espacio);
      if (hijos) {
        const contenedores = [
          ...(e.idEspacioPadre != null
            ? espaciosPorPadre.get(e.idEspacioPadre) || []
            : espaciosPorPiso.get(e.idPiso) || []),
        ];
        const propio = contenedores.find((x) => x.Espacio === e.Espacio);
        if (propio) propio.espacios = hijos;
      }
    }

    const arbol = pisos.rows.map((p) => ({
      ...p,
      espacios: espaciosPorPiso.get(p.idPiso) || [],
    }));

    res.json(arbol);
  } catch (err) {
    console.error("Error al obtener estructura:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerTiposRecurso = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT clave, label, icono FROM "TiposRecurso" ORDER BY label'
    );
    res.json(rows);
  } catch (err) {
    console.error("Error al obtener tipos de recurso:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Aplica en una sola transacción todas las operaciones del árbol (crear/editar/mover/eliminar/reordenar
// pisos, espacios y recursos). El tempId permite referenciar entidades aún no creadas dentro del mismo lote.
export const commitEstructura = async (req, res) => {
  const { operaciones } = req.body;

  if (!Array.isArray(operaciones)) {
    return res.status(400).json({ message: "operaciones debe ser un array" });
  }
  if (operaciones.length === 0) {
    return res.json({ ok: true, cambios: 0, mapaTempIds: {} });
  }
  if (operaciones.length > 500) {
    return res.status(400).json({ message: "Demasiadas operaciones en un solo commit (max 500)" });
  }

  const client = await pool.connect();
  // Mapas tempId → id real (para piso, espacio, recurso)
  const mapaPiso = new Map();
  const mapaEspacio = new Map();
  const mapaRecurso = new Map();

  const resolverIdPiso = (op) => {
    if (op.data?.idPiso != null) return op.data.idPiso;
    if (op.data?.tempIdPiso != null && mapaPiso.has(op.data.tempIdPiso))
      return mapaPiso.get(op.data.tempIdPiso);
    return null;
  };
  const resolverIdEspacioPadre = (op) => {
    if (op.data?.idEspacioPadre !== undefined) return op.data.idEspacioPadre; // puede ser null explícito
    if (op.data?.tempIdEspacioPadre != null && mapaEspacio.has(op.data.tempIdEspacioPadre))
      return mapaEspacio.get(op.data.tempIdEspacioPadre);
    return null;
  };
  const resolverIdEspacio = (op) => {
    if (op.data?.idEspacio != null) return op.data.idEspacio;
    if (op.data?.tempIdEspacio != null && mapaEspacio.has(op.data.tempIdEspacio))
      return mapaEspacio.get(op.data.tempIdEspacio);
    return null;
  };
  const resolverIdRecursoPadre = (op) => {
    if (op.data?.idRecursoPadre !== undefined) return op.data.idRecursoPadre;
    if (op.data?.tempIdRecursoPadre != null && mapaRecurso.has(op.data.tempIdRecursoPadre))
      return mapaRecurso.get(op.data.tempIdRecursoPadre);
    return null;
  };

  try {
    await client.query("BEGIN");

    for (let i = 0; i < operaciones.length; i++) {
      const op = operaciones[i];
      const ctx = `op #${i} (${op.tipo})`;

      switch (op.tipo) {
        // Pisos
        case "piso.crear": {
          const d = op.data || {};
          if (!d.Nombre) throw new Error(`${ctx}: Nombre requerido`);
          const { rows } = await client.query(
            `INSERT INTO "Pisos"
             ("Nombre","Descripcion","Orden","Icono","Color","ImagenUrl",
              "IdealPara","Amenities","Imagenes","Publicado")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING "idPiso"`,
            [
              d.Nombre, d.Descripcion || null, d.Orden ?? 0,
              d.Icono || null, d.Color || null, d.ImagenUrl || null,
              d.IdealPara || null,
              Array.isArray(d.Amenities) ? d.Amenities : [],
              d.Imagenes ? JSON.stringify(d.Imagenes) : "[]",
              d.Publicado !== undefined ? d.Publicado : true,
            ]
          );
          if (op.tempId) mapaPiso.set(op.tempId, rows[0].idPiso);
          break;
        }
        case "piso.editar": {
          const d = op.data || {};
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          const result = await client.query(
            `UPDATE "Pisos"
             SET "Nombre"=COALESCE($1,"Nombre"),
                 "Descripcion"=COALESCE($2,"Descripcion"),
                 "Orden"=COALESCE($3,"Orden"),
                 "Icono"=COALESCE($4,"Icono"),
                 "Color"=COALESCE($5,"Color"),
                 "ImagenUrl"=COALESCE($6,"ImagenUrl"),
                 "IdealPara"=COALESCE($7,"IdealPara"),
                 "Amenities"=COALESCE($8::TEXT[],"Amenities"),
                 "Imagenes"=COALESCE($9::JSONB,"Imagenes"),
                 "Publicado"=COALESCE($10,"Publicado")
             WHERE "idPiso"=$11`,
            [
              d.Nombre ?? null, d.Descripcion ?? null, d.Orden ?? null,
              d.Icono ?? null, d.Color ?? null, d.ImagenUrl ?? null,
              d.IdealPara ?? null,
              Array.isArray(d.Amenities) ? d.Amenities : null,
              d.Imagenes != null ? JSON.stringify(d.Imagenes) : null,
              d.Publicado ?? null,
              op.id,
            ]
          );
          if (result.rowCount === 0) throw new Error(`${ctx}: piso ${op.id} no encontrado`);
          break;
        }
        case "piso.eliminar": {
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          // Validar que no tenga espacios activos
          const { rows: hijos } = await client.query(
            `SELECT COUNT(*) AS n FROM "Espacios" WHERE "idPiso"=$1 AND "Activo"=true`,
            [op.id]
          );
          if (Number(hijos[0].n) > 0) {
            throw new Error(`${ctx}: el piso tiene ${hijos[0].n} espacios activos. Movelos o desactivalos antes.`);
          }
          await client.query(`UPDATE "Pisos" SET "Activo"=false WHERE "idPiso"=$1`, [op.id]);
          break;
        }
        case "piso.reordenar": {
          if (!Array.isArray(op.orden)) throw new Error(`${ctx}: orden debe ser array`);
          for (const item of op.orden) {
            await client.query(`UPDATE "Pisos" SET "Orden"=$1 WHERE "idPiso"=$2`, [item.orden, item.id]);
          }
          break;
        }

        // Espacios
        case "espacio.crear": {
          const d = op.data || {};
          if (!d.Nombre) throw new Error(`${ctx}: Nombre requerido`);
          const tipoValido = ["sector", "area", "espacio"];
          const tipo = d.Tipo || "espacio";
          if (!tipoValido.includes(tipo)) throw new Error(`${ctx}: Tipo inválido (${tipo})`);
          const idPiso = resolverIdPiso(op);
          if (!idPiso) throw new Error(`${ctx}: idPiso requerido`);
          const idEspacioPadre = resolverIdEspacioPadre(op);
          const { rows } = await client.query(
            `INSERT INTO "Espacios" ("Nombre","Capacidad","Disponible","idPiso","idEspacioPadre","Tipo","Orden","Descripcion","Activo")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING "Espacio"`,
            [d.Nombre, d.Capacidad ?? null, d.Disponible ?? true, idPiso, idEspacioPadre, tipo, d.Orden ?? 0, d.Descripcion || null]
          );
          if (op.tempId) mapaEspacio.set(op.tempId, rows[0].Espacio);
          break;
        }
        case "espacio.editar": {
          const d = op.data || {};
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          if (d.Tipo && !["sector", "area", "espacio"].includes(d.Tipo)) {
            throw new Error(`${ctx}: Tipo inválido (${d.Tipo})`);
          }
          const result = await client.query(
            `UPDATE "Espacios"
             SET "Nombre"=COALESCE($1,"Nombre"),
                 "Capacidad"=COALESCE($2,"Capacidad"),
                 "Disponible"=COALESCE($3,"Disponible"),
                 "Tipo"=COALESCE($4,"Tipo"),
                 "Orden"=COALESCE($5,"Orden"),
                 "Descripcion"=COALESCE($6,"Descripcion")
             WHERE "Espacio"=$7`,
            [d.Nombre ?? null, d.Capacidad ?? null, d.Disponible ?? null, d.Tipo ?? null, d.Orden ?? null, d.Descripcion ?? null, op.id]
          );
          if (result.rowCount === 0) throw new Error(`${ctx}: espacio ${op.id} no encontrado`);
          break;
        }
        case "espacio.mover": {
          const d = op.data || {};
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          const nuevoPiso = d.idPiso !== undefined || d.tempIdPiso !== undefined ? resolverIdPiso(op) : undefined;
          const nuevoPadre = (d.idEspacioPadre !== undefined || d.tempIdEspacioPadre !== undefined)
            ? resolverIdEspacioPadre(op)
            : undefined;

          // Anti-ciclo: si se asigna padre, recorrer la cadena hacia arriba
          if (nuevoPadre != null) {
            if (Number(nuevoPadre) === Number(op.id)) {
              throw new Error(`${ctx}: no se puede asignar como padre a sí mismo`);
            }
            const { rows: ancestros } = await client.query(
              `WITH RECURSIVE up AS (
                 SELECT "Espacio","idEspacioPadre" FROM "Espacios" WHERE "Espacio"=$1
                 UNION ALL
                 SELECT e."Espacio", e."idEspacioPadre"
                 FROM "Espacios" e
                 JOIN up ON up."idEspacioPadre" = e."Espacio"
               )
               SELECT "Espacio" FROM up WHERE "Espacio"=$2`,
              [nuevoPadre, op.id]
            );
            if (ancestros.length > 0) {
              throw new Error(`${ctx}: el movimiento crearía un ciclo`);
            }
          }

          const updates = [];
          const values = [];
          let i2 = 1;
          if (nuevoPiso !== undefined) { updates.push(`"idPiso"=$${i2++}`); values.push(nuevoPiso); }
          if (nuevoPadre !== undefined) { updates.push(`"idEspacioPadre"=$${i2++}`); values.push(nuevoPadre); }
          if (d.Orden !== undefined) { updates.push(`"Orden"=$${i2++}`); values.push(d.Orden); }
          if (updates.length === 0) break;
          values.push(op.id);
          const result = await client.query(
            `UPDATE "Espacios" SET ${updates.join(", ")} WHERE "Espacio"=$${i2}`,
            values
          );
          if (result.rowCount === 0) throw new Error(`${ctx}: espacio ${op.id} no encontrado`);
          break;
        }
        case "espacio.eliminar": {
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          // No permitir si tiene sub-espacios activos
          const { rows: subs } = await client.query(
            `SELECT COUNT(*) AS n FROM "Espacios" WHERE "idEspacioPadre"=$1 AND "Activo"=true`,
            [op.id]
          );
          if (Number(subs[0].n) > 0) {
            throw new Error(`${ctx}: el espacio tiene ${subs[0].n} sub-espacios activos. Movelos o desactivalos antes.`);
          }
          // No permitir si tiene recursos activos
          const { rows: rec } = await client.query(
            `SELECT COUNT(*) AS n FROM "Recursos" WHERE "idEspacio"=$1 AND "Activo"=true`,
            [op.id]
          );
          if (Number(rec[0].n) > 0) {
            throw new Error(`${ctx}: el espacio tiene ${rec[0].n} recursos activos. Movelos o desactivalos antes.`);
          }
          await client.query(`UPDATE "Espacios" SET "Activo"=false WHERE "Espacio"=$1`, [op.id]);
          break;
        }
        case "espacio.reordenar": {
          if (!Array.isArray(op.orden)) throw new Error(`${ctx}: orden debe ser array`);
          for (const item of op.orden) {
            await client.query(`UPDATE "Espacios" SET "Orden"=$1 WHERE "Espacio"=$2`, [item.orden, item.id]);
          }
          break;
        }

        // Recursos
        case "recurso.crear": {
          const d = op.data || {};
          if (!d.Nombre) throw new Error(`${ctx}: Nombre requerido`);
          const idEspacio = resolverIdEspacio(op);
          if (!idEspacio) throw new Error(`${ctx}: idEspacio requerido`);
          const idRecursoPadre = resolverIdRecursoPadre(op);
          const { rows } = await client.query(
            `INSERT INTO "Recursos"
             ("idEspacio","idRecursoPadre","Nombre","Descripcion","esCompleto",
              "PrecioHora","PrecioSemanal","PrecioMensual",
              "Tipo","Orden","Activo","AceptaPackSemanal","AceptaPackMensual","EsReservablePorTurno")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)
             RETURNING "idRecurso"`,
            [
              idEspacio, idRecursoPadre, d.Nombre, d.Descripcion || null, d.esCompleto || false,
              d.PrecioHora ?? null, d.PrecioSemanal ?? null, d.PrecioMensual ?? null,
              d.Tipo || null, d.Orden ?? 0,
              d.AceptaPackSemanal || false, d.AceptaPackMensual || false,
              d.EsReservablePorTurno !== undefined ? d.EsReservablePorTurno : true,
            ]
          );
          if (op.tempId) mapaRecurso.set(op.tempId, rows[0].idRecurso);
          break;
        }
        case "recurso.editar": {
          const d = op.data || {};
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          const result = await client.query(
            `UPDATE "Recursos"
             SET "Nombre"=COALESCE($1,"Nombre"),
                 "Descripcion"=COALESCE($2,"Descripcion"),
                 "esCompleto"=COALESCE($3,"esCompleto"),
                 "PrecioHora"=COALESCE($4,"PrecioHora"),
                 "PrecioSemanal"=COALESCE($5,"PrecioSemanal"),
                 "PrecioMensual"=COALESCE($6,"PrecioMensual"),
                 "Tipo"=COALESCE($7,"Tipo"),
                 "Orden"=COALESCE($8,"Orden"),
                 "AceptaPackSemanal"=COALESCE($9,"AceptaPackSemanal"),
                 "AceptaPackMensual"=COALESCE($10,"AceptaPackMensual"),
                 "EsReservablePorTurno"=COALESCE($11,"EsReservablePorTurno")
             WHERE "idRecurso"=$12`,
            [
              d.Nombre ?? null, d.Descripcion ?? null, d.esCompleto ?? null,
              d.PrecioHora ?? null, d.PrecioSemanal ?? null, d.PrecioMensual ?? null,
              d.Tipo ?? null, d.Orden ?? null,
              d.AceptaPackSemanal ?? null, d.AceptaPackMensual ?? null,
              d.EsReservablePorTurno ?? null,
              op.id,
            ]
          );
          if (result.rowCount === 0) throw new Error(`${ctx}: recurso ${op.id} no encontrado`);
          break;
        }
        case "recurso.mover": {
          const d = op.data || {};
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          const nuevoEspacio = (d.idEspacio !== undefined || d.tempIdEspacio !== undefined)
            ? resolverIdEspacio(op)
            : undefined;
          const nuevoPadre = (d.idRecursoPadre !== undefined || d.tempIdRecursoPadre !== undefined)
            ? resolverIdRecursoPadre(op)
            : undefined;

          if (nuevoPadre != null) {
            if (Number(nuevoPadre) === Number(op.id)) {
              throw new Error(`${ctx}: no se puede asignar como padre a sí mismo`);
            }
            const { rows: ancestros } = await client.query(
              `WITH RECURSIVE up AS (
                 SELECT "idRecurso","idRecursoPadre" FROM "Recursos" WHERE "idRecurso"=$1
                 UNION ALL
                 SELECT r."idRecurso", r."idRecursoPadre"
                 FROM "Recursos" r
                 JOIN up ON up."idRecursoPadre" = r."idRecurso"
               )
               SELECT "idRecurso" FROM up WHERE "idRecurso"=$2`,
              [nuevoPadre, op.id]
            );
            if (ancestros.length > 0) {
              throw new Error(`${ctx}: el movimiento crearía un ciclo`);
            }
          }

          const updates = [];
          const values = [];
          let i2 = 1;
          if (nuevoEspacio !== undefined) { updates.push(`"idEspacio"=$${i2++}`); values.push(nuevoEspacio); }
          if (nuevoPadre !== undefined) { updates.push(`"idRecursoPadre"=$${i2++}`); values.push(nuevoPadre); }
          if (d.Orden !== undefined) { updates.push(`"Orden"=$${i2++}`); values.push(d.Orden); }
          if (updates.length === 0) break;
          values.push(op.id);
          const result = await client.query(
            `UPDATE "Recursos" SET ${updates.join(", ")} WHERE "idRecurso"=$${i2}`,
            values
          );
          if (result.rowCount === 0) throw new Error(`${ctx}: recurso ${op.id} no encontrado`);
          break;
        }
        case "recurso.eliminar": {
          if (!op.id) throw new Error(`${ctx}: id requerido`);
          // Bloquear si tiene reservas futuras
          const { rows: rsv } = await client.query(
            `SELECT COUNT(*) AS n FROM "Reservas"
             WHERE "idRecurso"=$1 AND "DiaReserva" >= CURRENT_DATE`,
            [op.id]
          );
          if (Number(rsv[0].n) > 0) {
            throw new Error(`${ctx}: el recurso tiene ${rsv[0].n} reserva(s) futura(s). Cancelalas o esperá a que pasen.`);
          }
          // Sub-recursos activos: bloquear
          const { rows: subs } = await client.query(
            `SELECT COUNT(*) AS n FROM "Recursos" WHERE "idRecursoPadre"=$1 AND "Activo"=true`,
            [op.id]
          );
          if (Number(subs[0].n) > 0) {
            throw new Error(`${ctx}: el recurso tiene ${subs[0].n} sub-recurso(s) activos. Eliminalos primero.`);
          }
          await client.query(`UPDATE "Recursos" SET "Activo"=false WHERE "idRecurso"=$1`, [op.id]);
          break;
        }
        case "recurso.reordenar": {
          if (!Array.isArray(op.orden)) throw new Error(`${ctx}: orden debe ser array`);
          for (const item of op.orden) {
            await client.query(`UPDATE "Recursos" SET "Orden"=$1 WHERE "idRecurso"=$2`, [item.orden, item.id]);
          }
          break;
        }

        default:
          throw new Error(`${ctx}: tipo de operación desconocido`);
      }
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      cambios: operaciones.length,
      mapaTempIds: {
        pisos: Object.fromEntries(mapaPiso),
        espacios: Object.fromEntries(mapaEspacio),
        recursos: Object.fromEntries(mapaRecurso),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error al hacer commit de estructura:", err);
    res.status(400).json({ message: err.message || "Error al aplicar los cambios" });
  } finally {
    client.release();
  }
};

// Cuántas reservas (futuras, pasadas, totales) tiene un recurso. Se consulta antes de eliminar.
export const obtenerImpactoRecurso = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE "DiaReserva" >= CURRENT_DATE) AS futuras,
         COUNT(*) FILTER (WHERE "DiaReserva" < CURRENT_DATE)  AS pasadas,
         COUNT(*) AS total
       FROM "Reservas"
       WHERE "idRecurso"=$1`,
      [req.params.id]
    );
    res.json({
      futuras: Number(rows[0].futuras),
      pasadas: Number(rows[0].pasadas),
      total: Number(rows[0].total),
    });
  } catch (err) {
    console.error("Error obteniendo impacto:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
