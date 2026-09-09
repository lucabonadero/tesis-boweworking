import pool from "../config/db.js";
import { evaluarAjusteManual, normalizarPaquete } from "../services/creditos.service.js";
import {
  obtenerSaldo,
  bloquearSaldo,
  aplicarMovimiento,
  listarMovimientos,
  listarPaquetes,
  crearPaquete,
  actualizarPaquete,
  desactivarPaquete,
} from "../repositories/creditos.repository.js";

function estadoHttpPara(codigo) {
  switch (codigo) {
    case "NO_ENCONTRADO":
      return 404;
    case "SALDO_NEGATIVO_NO_AUTORIZADO":
      return 409;
    default:
      return 400;
  }
}

/** GET /api/admin/creditos/usuarios/:id */
export const obtenerCreditosDeUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'SELECT id, nombre, apellido, email FROM "ClienteUsuario" WHERE id = $1',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado", codigo: "NO_ENCONTRADO" });
    }

    const { saldo, actualizadoAt } = await obtenerSaldo(pool, id);
    const { movimientos, total } = await listarMovimientos(pool, id, { limit: 20, offset: 0 });

    res.json({ usuario: rows[0], saldo, actualizadoAt, movimientos, total });
  } catch (error) {
    console.error("Error al obtener los créditos del usuario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * POST /api/admin/creditos/usuarios/:id/ajuste (RF08)
 *
 * Transaccional con el saldo bloqueado: un ajuste no puede pisar el descuento
 * de una reserva que el usuario esté confirmando en el mismo instante.
 */
export const ajustarCreditosDeUsuario = async (req, res) => {
  const { id } = req.params;
  const { cantidad, motivo, permitirNegativo } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: usuarios } = await client.query(
      'SELECT id FROM "ClienteUsuario" WHERE id = $1',
      [id]
    );
    if (usuarios.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado", codigo: "NO_ENCONTRADO" });
    }

    const saldoActual = await bloquearSaldo(client, id);
    const decision = evaluarAjusteManual({ saldoActual, cantidad, motivo, permitirNegativo });

    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res
        .status(estadoHttpPara(decision.codigo))
        .json({ message: decision.mensaje, codigo: decision.codigo });
    }

    const movimiento = await aplicarMovimiento(client, {
      clienteUsuarioId: Number(id),
      tipo: "ajuste_admin",
      cantidad: decision.cantidad,
      saldoPosterior: decision.saldoPosterior,
      motivo: decision.motivo,
      adminUsuarioId: req.usuario.id,
    });

    await client.query("COMMIT");
    res.status(201).json({ saldo: decision.saldoPosterior, movimiento });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la transacción ya estaba cerrada */
    }
    console.error("Error al ajustar los créditos del usuario:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/** GET /api/admin/creditos/paquetes — incluye los dados de baja. */
export const listarPaquetesAdmin = async (_req, res) => {
  try {
    const paquetes = await listarPaquetes(pool, { soloActivos: false });
    res.json({ paquetes });
  } catch (error) {
    console.error("Error al listar los paquetes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** POST /api/admin/creditos/paquetes (RF09) */
export const crearPaqueteAdmin = async (req, res) => {
  try {
    const decision = normalizarPaquete(req.body);
    if (!decision.ok) {
      return res.status(400).json({ message: decision.mensaje, codigo: decision.codigo });
    }

    const paquete = await crearPaquete(pool, decision.paquete);
    res.status(201).json(paquete);
  } catch (error) {
    console.error("Error al crear el paquete:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** PUT /api/admin/creditos/paquetes/:id (RF09) */
export const actualizarPaqueteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const decision = normalizarPaquete(req.body);
    if (!decision.ok) {
      return res.status(400).json({ message: decision.mensaje, codigo: decision.codigo });
    }

    const paquete = await actualizarPaquete(pool, id, {
      ...decision.paquete,
      activo: req.body.activo,
    });
    if (!paquete) {
      return res.status(404).json({ message: "Paquete no encontrado", codigo: "NO_ENCONTRADO" });
    }

    res.json(paquete);
  } catch (error) {
    console.error("Error al actualizar el paquete:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** DELETE /api/admin/creditos/paquetes/:id — baja lógica. */
export const eliminarPaqueteAdmin = async (req, res) => {
  try {
    const paquete = await desactivarPaquete(pool, req.params.id);
    if (!paquete) {
      return res.status(404).json({ message: "Paquete no encontrado", codigo: "NO_ENCONTRADO" });
    }
    res.json({ message: "Paquete dado de baja", paquete });
  } catch (error) {
    console.error("Error al dar de baja el paquete:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
