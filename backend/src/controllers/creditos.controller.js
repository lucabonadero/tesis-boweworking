import pool from "../config/db.js";
import {
  obtenerSaldo,
  obtenerPesosPorCredito,
  listarMovimientos,
  listarPaquetes,
} from "../repositories/creditos.repository.js";

/** El staff no tiene saldo propio: los créditos son del usuario final. */
function exigirCliente(req, res) {
  if (req.usuario?.tipo !== "cliente") {
    res.status(403).json({
      message: "Los créditos son de las cuentas de usuario, no del personal",
      codigo: "SIN_CUENTA_DE_CREDITOS",
    });
    return false;
  }
  return true;
}

/** GET /api/creditos/saldo (RF10) */
export const obtenerMiSaldo = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const [{ saldo, actualizadoAt }, pesosPorCredito] = await Promise.all([
      obtenerSaldo(pool, req.usuario.id),
      obtenerPesosPorCredito(pool),
    ]);

    res.json({ saldo, pesosPorCredito, actualizadoAt });
  } catch (error) {
    console.error("Error al obtener el saldo de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/creditos/movimientos (RF06) */
export const obtenerMisMovimientos = async (req, res) => {
  if (!exigirCliente(req, res)) return;

  try {
    const { limit, offset } = req.query;
    const { movimientos, total } = await listarMovimientos(pool, req.usuario.id, { limit, offset });

    res.json({ movimientos, total, limit, offset });
  } catch (error) {
    console.error("Error al listar los movimientos de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/creditos/paquetes — los que se ofrecen en el pop-up de compra. */
export const obtenerPaquetesActivos = async (_req, res) => {
  try {
    const paquetes = await listarPaquetes(pool, { soloActivos: true });
    res.json({ paquetes });
  } catch (error) {
    console.error("Error al listar los paquetes de créditos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
