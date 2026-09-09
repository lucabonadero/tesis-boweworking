import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Layout, Tree, Button, Form, Input, InputNumber, Select, Switch, Modal,
  Space, Tag, message, Popconfirm, Tooltip, Typography, Card, Empty, Spin,
  Badge, Alert,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, SaveOutlined, UndoOutlined,
  AppstoreOutlined, HomeOutlined, GroupOutlined, BlockOutlined,
  WarningOutlined, ReloadOutlined, DragOutlined,
  ThunderboltOutlined, InfoCircleOutlined, GoldOutlined, ReadOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext.jsx";
import { useFijarBeneficioEstudiante } from "../../hooks/useBeneficioEstudiante.js";
import Header from "../../components/header.jsx";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import adminLayout from "../../styles/admin/adminLayout.module.css";
import styles from "../../styles/admin/gestionEstructura.module.css";

const { Text } = Typography;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const TIPO_ESPACIO_OPCIONES = [
  { value: "sector",  label: "Sector"  },
  { value: "area",    label: "Área"    },
  { value: "espacio", label: "Espacio" },
];

// Utilidades: tempIds + clonado profundo + diff de operaciones
let _tempCounter = 0;
const makeTempId = (prefix) => `${prefix}_t${++_tempCounter}`;
const isTempId = (id) => typeof id === "string" && id.includes("_t");
const deepClone = (x) => JSON.parse(JSON.stringify(x));

// Tipos de nodo en el árbol
const NODO_PISO = "piso";
const NODO_ESPACIO = "espacio";
const NODO_RECURSO = "recurso";

// Genera key estable para react-tree
const keyOf = (tipo, id) => `${tipo}:${id}`;

// ID de un nodo según su tipo
const idDe = (tipo, raw) =>
  tipo === NODO_PISO ? raw.idPiso : tipo === NODO_ESPACIO ? raw.Espacio : raw.idRecurso;

// Encuentra el padre directo (en el árbol dado) de un nodo
function encontrarPadre(arbol, tipo, raw) {
  for (const piso of arbol) {
    if (tipo === NODO_ESPACIO) {
      // Espacio directo del piso
      if ((piso.espacios || []).some((e) => e.Espacio === raw.Espacio)) {
        return { tipo: NODO_PISO, id: piso.idPiso };
      }
      // Sub-espacio
      const stack = [...(piso.espacios || [])];
      while (stack.length) {
        const e = stack.shift();
        if ((e.espacios || []).some((s) => s.Espacio === raw.Espacio)) {
          return { tipo: NODO_ESPACIO, id: e.Espacio };
        }
        for (const sub of e.espacios || []) stack.push(sub);
      }
    }
    if (tipo === NODO_RECURSO) {
      const stack = [...(piso.espacios || [])];
      while (stack.length) {
        const e = stack.shift();
        if ((e.recursos || []).some((r) => r.idRecurso === raw.idRecurso)) {
          return { tipo: NODO_ESPACIO, id: e.Espacio };
        }
        for (const sub of e.espacios || []) stack.push(sub);
        // buscar también dentro de recursos anidados
        const rstack = [...(e.recursos || [])];
        while (rstack.length) {
          const r = rstack.shift();
          if ((r.recursos || []).some((s) => s.idRecurso === raw.idRecurso)) {
            return { tipo: NODO_RECURSO, id: r.idRecurso };
          }
          for (const sub of r.recursos || []) rstack.push(sub);
        }
      }
    }
  }
  return null;
}

// Quita un nodo del árbol (mutando)
function quitarDelArbol(arbol, tipo, id) {
  if (tipo === NODO_PISO) {
    const idx = arbol.findIndex((p) => p.idPiso === id);
    if (idx !== -1) arbol.splice(idx, 1);
    return true;
  }
  // Recorrer todo y quitar
  const quitarEspacio = (lista) => {
    const idx = lista.findIndex((e) => e.Espacio === id);
    if (idx !== -1) { lista.splice(idx, 1); return true; }
    for (const e of lista) {
      if (quitarEspacio(e.espacios || [])) return true;
    }
    return false;
  };
  const quitarRecurso = (lista) => {
    const idx = lista.findIndex((r) => r.idRecurso === id);
    if (idx !== -1) { lista.splice(idx, 1); return true; }
    for (const r of lista) {
      if (quitarRecurso(r.recursos || [])) return true;
    }
    return false;
  };
  for (const piso of arbol) {
    if (tipo === NODO_ESPACIO && quitarEspacio(piso.espacios || [])) return true;
    if (tipo === NODO_RECURSO) {
      const stack = [...(piso.espacios || [])];
      while (stack.length) {
        const e = stack.shift();
        if (quitarRecurso(e.recursos || [])) return true;
        for (const sub of e.espacios || []) stack.push(sub);
      }
    }
  }
  return false;
}

// Inserta un nodo en el árbol (mutando)
// nuevoPadreInfo: { tipo, id } | null (null = raíz, solo para Pisos)
// target / dropToGap / posicion ayudan a definir el offset si hay reorder
function insertarEnArbol(arbol, tipo, raw, nuevoPadreInfo, target, dropToGap, posicion) {
  if (tipo === NODO_PISO) {
    // Reorder entre Pisos a nivel raíz
    const targetIdx = arbol.findIndex((p) => p.idPiso === target.raw.idPiso);
    if (targetIdx === -1) { arbol.push(raw); return { ok: true }; }
    const offset = posicion === -1 ? 0 : 1;
    arbol.splice(targetIdx + offset, 0, raw);
    return { ok: true };
  }

  if (!nuevoPadreInfo) return { ok: false, error: "Padre desconocido" };

  // Encontrar el padre
  const buscar = (lista, tipoBus, idBus) => {
    for (const piso of lista) {
      if (tipoBus === NODO_PISO && piso.idPiso === idBus) return piso;
      const stack = [...(piso.espacios || [])];
      while (stack.length) {
        const e = stack.shift();
        if (tipoBus === NODO_ESPACIO && e.Espacio === idBus) return e;
        for (const sub of e.espacios || []) stack.push(sub);
        const rstack = [...(e.recursos || [])];
        while (rstack.length) {
          const r = rstack.shift();
          if (tipoBus === NODO_RECURSO && r.idRecurso === idBus) return r;
          for (const sub of r.recursos || []) rstack.push(sub);
        }
      }
    }
    return null;
  };
  const padre = buscar(arbol, nuevoPadreInfo.tipo, nuevoPadreInfo.id);
  if (!padre) return { ok: false, error: "Padre no encontrado" };

  // Determinar contenedor según tipo movido y tipo del padre
  let contenedor;
  if (tipo === NODO_ESPACIO) {
    if (!Array.isArray(padre.espacios)) padre.espacios = [];
    contenedor = padre.espacios;
    // Heredar idPiso (raw mantiene los suyos pero el backend los recalcula via op)
    if (nuevoPadreInfo.tipo === NODO_PISO) {
      raw.idPiso = padre.idPiso;
      raw.idEspacioPadre = null;
    } else {
      raw.idPiso = padre.idPiso;
      raw.idEspacioPadre = padre.Espacio;
    }
  } else if (tipo === NODO_RECURSO) {
    if (!Array.isArray(padre.recursos)) padre.recursos = [];
    contenedor = padre.recursos;
    if (nuevoPadreInfo.tipo === NODO_ESPACIO) {
      raw.idEspacio = padre.Espacio;
      raw.idRecursoPadre = null;
    } else {
      raw.idEspacio = padre.idEspacio;
      raw.idRecursoPadre = padre.idRecurso;
    }
  }
  if (!contenedor) return { ok: false, error: "Contenedor inválido" };

  // Insertar en la posición correcta
  if (dropToGap && target) {
    const targetId = idDe(target.tipo, target.raw);
    const targetIdx = contenedor.findIndex(
      (n) => (target.tipo === NODO_ESPACIO ? n.Espacio : n.idRecurso) === targetId
    );
    if (targetIdx !== -1) {
      const offset = posicion === -1 ? 0 : 1;
      contenedor.splice(targetIdx + offset, 0, raw);
      return { ok: true };
    }
  }
  contenedor.push(raw);
  return { ok: true };
}

// Fusiona o mete una op de tipo *.mover o *.crear con nuevos datos (sin duplicar)
function mergeOMEterOp(opsRef, tipoOp, id, data) {
  const ops = opsRef.current;
  // Si existe crear o mover/editar para el mismo id, mergear su data
  const ex = ops.find((o) =>
    (o.tipo === tipoOp && (o.id === id || o.tempId === id))
  );
  if (ex) {
    ex.data = { ...(ex.data || {}), ...data };
    return;
  }
  // Si la op es mover pero hay un crear previo del mismo id (tempId), mergear ahí
  const tipoBase = tipoOp.split(".")[0];
  const crear = ops.find((o) => o.tipo === `${tipoBase}.crear` && o.tempId === id);
  if (crear) {
    crear.data = { ...(crear.data || {}), ...data };
    return;
  }
  ops.push({ tipo: tipoOp, id, data });
}

// Re-emite la op de reordenar para los hermanos del nuevo padre
function reordenarHermanosOp(opsRef, arbol, tipoNodo, nuevoPadreInfo) {
  if (!nuevoPadreInfo) return;
  // Solo emitir reordenar para items con ID real (los tempIds aún no existen en BD)
  const buscar = (lista, tipoBus, idBus) => {
    for (const piso of lista) {
      if (tipoBus === NODO_PISO && piso.idPiso === idBus) return piso;
      const stack = [...(piso.espacios || [])];
      while (stack.length) {
        const e = stack.shift();
        if (tipoBus === NODO_ESPACIO && e.Espacio === idBus) return e;
        for (const sub of e.espacios || []) stack.push(sub);
        const rstack = [...(e.recursos || [])];
        while (rstack.length) {
          const r = rstack.shift();
          if (tipoBus === NODO_RECURSO && r.idRecurso === idBus) return r;
          for (const sub of r.recursos || []) rstack.push(sub);
        }
      }
    }
    return null;
  };
  const padre = buscar(arbol, nuevoPadreInfo.tipo, nuevoPadreInfo.id);
  if (!padre) return;
  const hijos = tipoNodo === NODO_ESPACIO ? (padre.espacios || []) : (padre.recursos || []);
  const orden = hijos
    .map((n, i) => ({ id: tipoNodo === NODO_ESPACIO ? n.Espacio : n.idRecurso, orden: i }))
    .filter((x) => !isTempId(x.id));
  if (orden.length === 0) return;
  // Reemplazar reorder previo del mismo scope (último gana)
  opsRef.current = opsRef.current.filter((o) => o.tipo !== `${tipoNodo}.reordenar`);
  opsRef.current.push({ tipo: `${tipoNodo}.reordenar`, orden });
}

// Función de búsqueda compartida
function buscarNodoEn(arbolBase, tipo, id) {
  for (const piso of arbolBase) {
    if (tipo === NODO_PISO && piso.idPiso === id) return { nodo: piso };
    const stackEspacios = [...(piso.espacios || [])];
    while (stackEspacios.length > 0) {
      const esp = stackEspacios.shift();
      if (tipo === NODO_ESPACIO && esp.Espacio === id) return { nodo: esp };
      for (const subEsp of esp.espacios || []) stackEspacios.push(subEsp);
      const stackRec = [...(esp.recursos || [])];
      while (stackRec.length > 0) {
        const rec = stackRec.shift();
        if (tipo === NODO_RECURSO && rec.idRecurso === id) return { nodo: rec };
        for (const sub of rec.recursos || []) stackRec.push(sub);
      }
    }
  }
  return null;
}

// ============================================================
// Componente principal
// ============================================================
export default function GestionEstructura() {
  const { token } = useAuth();
  const [arbol, setArbol] = useState([]);              // árbol editable
  const [arbolOriginal, setArbolOriginal] = useState([]); // snapshot del servidor
  const [tiposRecurso, setTiposRecurso] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);    // { tipo, id, nodo }
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [modalCrear, setModalCrear] = useState(null);  // { tipo, parent? }
  const [formEditar] = Form.useForm();
  const [formCrear] = Form.useForm();
  const opsRef = useRef([]); // operaciones pendientes (no en state para evitar re-renders innecesarios)
  const [opsCount, setOpsCount] = useState(0);
  const [impactoModal, setImpactoModal] = useState(null); // { tipo, id, nombre, impacto }

  const authHeaders = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  // ----------------------------------------------------------
  // Carga inicial
  // ----------------------------------------------------------
  const cargarArbol = useCallback(async () => {
    setLoading(true);
    try {
      const [resArbol, resTipos] = await Promise.all([
        fetch(`${API_URL}/api/admin/estructura`, { headers: authHeaders }),
        fetch(`${API_URL}/api/admin/estructura/tipos-recurso`, { headers: authHeaders }),
      ]);
      if (!resArbol.ok || !resTipos.ok) throw new Error("Error al cargar estructura");
      const [dataArbol, dataTipos] = await Promise.all([resArbol.json(), resTipos.json()]);
      setArbol(dataArbol);
      setArbolOriginal(deepClone(dataArbol));
      setTiposRecurso(dataTipos);
      opsRef.current = [];
      setOpsCount(0);
      // Expandir pisos por defecto
      setExpandedKeys(dataArbol.map((p) => keyOf(NODO_PISO, p.idPiso)));
    } catch (err) {
      message.error(err.message || "No se pudo cargar la estructura");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { cargarArbol(); }, [cargarArbol]);

  // ----------------------------------------------------------
  // Manipulación del árbol local
  // ----------------------------------------------------------
  const addOp = useCallback((op) => {
    opsRef.current.push(op);
    setOpsCount(opsRef.current.length);
  }, []);

  // ----------------------------------------------------------
  // Crear nodo
  // ----------------------------------------------------------
  const abrirCrearPiso = () => {
    formCrear.resetFields();
    setModalCrear({ tipo: NODO_PISO });
  };

  const abrirCrearEspacio = (parent) => {
    formCrear.resetFields();
    // parent puede ser un Piso (root) o un Espacio (sub-espacio)
    setModalCrear({ tipo: NODO_ESPACIO, parent });
  };

  const abrirCrearRecurso = (parent) => {
    formCrear.resetFields();
    // parent puede ser un Espacio (recurso raíz) o un Recurso (sub-recurso)
    setModalCrear({ tipo: NODO_RECURSO, parent });
  };

  const handleCrear = async (values) => {
    const { tipo, parent } = modalCrear;

    if (tipo === NODO_PISO) {
      const tempId = makeTempId("piso");
      const nuevo = {
        idPiso: tempId,
        Nombre: values.Nombre,
        Descripcion: values.Descripcion || null,
        IdealPara: null,
        Amenities: [],
        Imagenes: [],
        Orden: arbol.length,
        Activo: true,
        Icono: null,
        Color: null,
        ImagenUrl: null,
        Publicado: true,
        espacios: [],
        __nuevo: true,
      };
      setArbol((prev) => [...prev, nuevo]);
      setExpandedKeys((prev) => [...prev, keyOf(NODO_PISO, tempId)]);
      addOp({
        tipo: "piso.crear",
        tempId,
        data: {
          Nombre: nuevo.Nombre,
          Descripcion: nuevo.Descripcion,
          Orden: nuevo.Orden,
          Publicado: nuevo.Publicado,
          Amenities: nuevo.Amenities,
          Imagenes: nuevo.Imagenes,
        },
      });
    }

    if (tipo === NODO_ESPACIO) {
      const tempId = makeTempId("esp");
      const esPiso = parent && parent.idPiso !== undefined && parent.Espacio === undefined;
      const idPiso = esPiso ? parent.idPiso : parent.idPiso;
      const idEspacioPadre = esPiso ? null : parent.Espacio;
      const nuevo = {
        Espacio: tempId,
        Nombre: values.Nombre,
        Capacidad: values.Capacidad ?? null,
        Disponible: values.Disponible ?? true,
        Tipo: values.Tipo || "espacio",
        Descripcion: values.Descripcion || null,
        idPiso, idEspacioPadre,
        Orden: 0,
        Activo: true,
        espacios: [],
        recursos: [],
        __nuevo: true,
      };
      setArbol((prev) => {
        const copia = deepClone(prev);
        const res = buscarNodoEn(copia, esPiso ? NODO_PISO : NODO_ESPACIO, esPiso ? idPiso : idEspacioPadre);
        if (res) res.nodo.espacios = [...(res.nodo.espacios || []), nuevo];
        return copia;
      });
      setExpandedKeys((prev) => [...prev, keyOf(esPiso ? NODO_PISO : NODO_ESPACIO, esPiso ? idPiso : idEspacioPadre)]);

      const opData = {
        Nombre: nuevo.Nombre,
        Capacidad: nuevo.Capacidad,
        Disponible: nuevo.Disponible,
        Tipo: nuevo.Tipo,
        Descripcion: nuevo.Descripcion,
        Orden: nuevo.Orden,
      };
      if (isTempId(idPiso)) opData.tempIdPiso = idPiso; else opData.idPiso = idPiso;
      if (idEspacioPadre != null) {
        if (isTempId(idEspacioPadre)) opData.tempIdEspacioPadre = idEspacioPadre;
        else opData.idEspacioPadre = idEspacioPadre;
      }
      addOp({ tipo: "espacio.crear", tempId, data: opData });
    }

    if (tipo === NODO_RECURSO) {
      const tempId = makeTempId("rec");
      const esEspacio = parent && parent.Espacio !== undefined && parent.idRecurso === undefined;
      const idEspacio = esEspacio ? parent.Espacio : parent.idEspacio;
      const idRecursoPadre = esEspacio ? null : parent.idRecurso;
      const nuevo = {
        idRecurso: tempId,
        Nombre: values.Nombre,
        Descripcion: values.Descripcion || null,
        esCompleto: values.esCompleto || false,
        PrecioHora: values.PrecioHora ?? null,
        PrecioSemanal: values.PrecioSemanal ?? null,
        PrecioMensual: values.PrecioMensual ?? null,
        Tipo: values.Tipo || null,
        AceptaPackSemanal: values.AceptaPackSemanal || false,
        AceptaPackMensual: values.AceptaPackMensual || false,
        EsReservablePorTurno: values.EsReservablePorTurno !== undefined ? values.EsReservablePorTurno : true,
        idEspacio, idRecursoPadre,
        Orden: 0,
        Activo: true,
        recursos: [],
        reservasFuturas: 0,
        reservasTotal: 0,
        __nuevo: true,
      };
      setArbol((prev) => {
        const copia = deepClone(prev);
        if (esEspacio) {
          const res = buscarNodoEn(copia, NODO_ESPACIO, idEspacio);
          if (res) res.nodo.recursos = [...(res.nodo.recursos || []), nuevo];
        } else {
          const res = buscarNodoEn(copia, NODO_RECURSO, idRecursoPadre);
          if (res) res.nodo.recursos = [...(res.nodo.recursos || []), nuevo];
        }
        return copia;
      });
      setExpandedKeys((prev) => [...prev, keyOf(esEspacio ? NODO_ESPACIO : NODO_RECURSO, esEspacio ? idEspacio : idRecursoPadre)]);

      const opData = {
        Nombre: nuevo.Nombre,
        Descripcion: nuevo.Descripcion,
        esCompleto: nuevo.esCompleto,
        PrecioHora: nuevo.PrecioHora,
        PrecioSemanal: nuevo.PrecioSemanal,
        PrecioMensual: nuevo.PrecioMensual,
        Tipo: nuevo.Tipo,
        AceptaPackSemanal: nuevo.AceptaPackSemanal,
        AceptaPackMensual: nuevo.AceptaPackMensual,
        EsReservablePorTurno: nuevo.EsReservablePorTurno,
        Orden: nuevo.Orden,
      };
      if (isTempId(idEspacio)) opData.tempIdEspacio = idEspacio; else opData.idEspacio = idEspacio;
      if (idRecursoPadre != null) {
        if (isTempId(idRecursoPadre)) opData.tempIdRecursoPadre = idRecursoPadre;
        else opData.idRecursoPadre = idRecursoPadre;
      }
      addOp({ tipo: "recurso.crear", tempId, data: opData });
    }

    setModalCrear(null);
    message.success("Agregado. Recordá guardar los cambios.");
  };

  // ----------------------------------------------------------
  // Editar nodo
  // ----------------------------------------------------------
  const handleEditarSeleccion = (cambios) => {
    if (!seleccion) return;
    const { tipo, id } = seleccion;

    setArbol((prev) => {
      const copia = deepClone(prev);
      const res = buscarNodoEn(copia, tipo, id);
      if (!res) return prev;
      Object.assign(res.nodo, cambios);
      // Actualizar también seleccion para reflejar en form
      setSeleccion({ tipo, id, nodo: res.nodo });
      return copia;
    });

    // Coalescer en op: si ya hay una op crear o editar del mismo nodo, mergear su data
    const idKey = isTempId(id) ? "tempId" : "id";
    const opTipoCrear = `${tipo}.crear`;
    const opTipoEditar = `${tipo}.editar`;

    const existente = opsRef.current.find(
      (o) => (o.tipo === opTipoCrear && o.tempId === id) ||
             (o.tipo === opTipoEditar && o[idKey] === id)
    );
    if (existente) {
      existente.data = { ...existente.data, ...cambios };
    } else {
      opsRef.current.push({ tipo: opTipoEditar, id, data: cambios });
      setOpsCount(opsRef.current.length);
    }
  };

  // ----------------------------------------------------------
  // Eliminar nodo
  // ----------------------------------------------------------
  const intentarEliminar = async () => {
    if (!seleccion) return;
    const { tipo, id, nodo } = seleccion;

    // Si es un nodo nuevo (tempId), simplemente quitar del árbol + de las ops
    if (isTempId(id)) {
      eliminarLocal(tipo, id);
      // Borrar la op de creación si existe
      opsRef.current = opsRef.current.filter(
        (o) => !((o.tipo === `${tipo}.crear` || o.tipo === `${tipo}.editar`) && (o.tempId === id || o.id === id))
      );
      setOpsCount(opsRef.current.length);
      setSeleccion(null);
      message.info("Borrado local (no se guardó porque era nuevo).");
      return;
    }

    // Para recurso: pedir impacto al servidor (reservas)
    if (tipo === NODO_RECURSO) {
      try {
        const res = await fetch(`${API_URL}/api/admin/estructura/recurso/${id}/impacto`, { headers: authHeaders });
        if (res.ok) {
          const impacto = await res.json();
          setImpactoModal({ tipo, id, nombre: nodo.Nombre, impacto });
          return;
        }
      } catch { /* fallback abajo */ }
    }

    // Para piso/espacio (o si el endpoint falló): confirmación simple
    Modal.confirm({
      title: `¿Eliminar ${tipo} "${nodo.Nombre}"?`,
      content:
        tipo === NODO_PISO
          ? "Se desactivará el piso. Solo es posible si no tiene espacios activos."
          : "Se desactivará el espacio. Solo es posible si no tiene sub-espacios ni recursos activos.",
      okText: "Eliminar",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: () => confirmarEliminar(tipo, id),
    });
  };

  const confirmarEliminar = (tipo, id) => {
    eliminarLocal(tipo, id);
    opsRef.current.push({ tipo: `${tipo}.eliminar`, id });
    setOpsCount(opsRef.current.length);
    setSeleccion(null);
  };

  const eliminarLocal = (tipo, id) => {
    setArbol((prev) => {
      const copia = deepClone(prev);
      if (tipo === NODO_PISO) {
        return copia.filter((p) => p.idPiso !== id);
      }
      // Búsqueda recursiva eliminando del contenedor padre
      const recorrerEspacios = (lista) => {
        const filtrados = lista.filter((e) => !(tipo === NODO_ESPACIO && e.Espacio === id));
        filtrados.forEach((e) => {
          e.espacios = recorrerEspacios(e.espacios || []);
          e.recursos = recorrerRecursos(e.recursos || []);
        });
        return filtrados;
      };
      const recorrerRecursos = (lista) => {
        const filtrados = lista.filter((r) => !(tipo === NODO_RECURSO && r.idRecurso === id));
        filtrados.forEach((r) => { r.recursos = recorrerRecursos(r.recursos || []); });
        return filtrados;
      };
      copia.forEach((p) => { p.espacios = recorrerEspacios(p.espacios || []); });
      return copia;
    });
  };

  // ----------------------------------------------------------
  // Drag & drop
  // ----------------------------------------------------------
  const onDrop = (info) => {
    const { node: target, dragNode: source, dropToGap, dropPosition } = info;
    const sourceTipo = source.tipo;
    const sourceRaw = source.raw;
    const targetTipo = target.tipo;
    const targetRaw = target.raw;

    // Validar compatibilidad de tipos
    // - Piso: solo reorder entre Pisos (gap a nivel raíz)
    // - Espacio: dentro de Piso o de otro Espacio, no de Recurso
    // - Recurso: dentro de Espacio o de otro Recurso, no de Piso
    if (sourceTipo === NODO_PISO) {
      if (targetTipo !== NODO_PISO || !dropToGap) {
        message.warning("Los pisos solo se reordenan entre sí.");
        return;
      }
    }
    if (sourceTipo === NODO_ESPACIO) {
      if (targetTipo === NODO_RECURSO) {
        message.warning("No se puede mover un espacio dentro de un recurso.");
        return;
      }
    }
    if (sourceTipo === NODO_RECURSO) {
      if (targetTipo === NODO_PISO) {
        message.warning("Los recursos van dentro de un espacio.");
        return;
      }
    }

    // 1. Determinar nuevo padre + posición destino
    //    dropToGap=false  → insertar como hijo (al final por defecto, antd usa dropPosition=0)
    //    dropToGap=true   → insertar como hermano del target. dropPosition negativo: antes; positivo: después
    let nuevoPadreInfo;  // { tipo, id } | null si raíz
    let posicionEntreHermanos = null; // -1 = al inicio, null = ignorar

    if (dropToGap) {
      // Hermano: el padre es el padre del target
      if (targetTipo === NODO_PISO) {
        nuevoPadreInfo = null; // raíz
      } else {
        // Buscar el padre real del target en el árbol
        const padre = encontrarPadre(arbol, targetTipo, targetRaw);
        nuevoPadreInfo = padre;
      }
      posicionEntreHermanos = dropPosition; // -1, 0, 1
    } else {
      // Inside del target
      nuevoPadreInfo = { tipo: targetTipo, id: idDe(targetTipo, targetRaw) };
    }

    // 2. Aplicar mutación local + generar ops
    const copia = deepClone(arbol);
    // Remover source
    quitarDelArbol(copia, sourceTipo, idDe(sourceTipo, sourceRaw));
    // Insertar en destino
    const insertado = insertarEnArbol(
      copia, sourceTipo, sourceRaw, nuevoPadreInfo, target, dropToGap, posicionEntreHermanos
    );
    if (!insertado.ok) {
      message.error(insertado.error || "No se pudo mover el elemento.");
      return;
    }

    setArbol(copia);

    // 3. Emitir ops
    const sourceId = idDe(sourceTipo, sourceRaw);
    if (sourceTipo === NODO_PISO) {
      // Reorder de pisos: emitir piso.reordenar con los nuevos órdenes
      const orden = copia.map((p, i) => ({ id: p.idPiso, orden: i }));
      // Eliminar reorder previo de pisos (último gana)
      opsRef.current = opsRef.current.filter((o) => o.tipo !== "piso.reordenar");
      opsRef.current.push({ tipo: "piso.reordenar", orden });
    }
    if (sourceTipo === NODO_ESPACIO) {
      // Mover espacio
      const data = {};
      if (nuevoPadreInfo === null) {
        // No es posible — un espacio siempre necesita piso
        message.error("Un espacio debe estar dentro de un piso.");
        return;
      }
      if (nuevoPadreInfo.tipo === NODO_PISO) {
        data[isTempId(nuevoPadreInfo.id) ? "tempIdPiso" : "idPiso"] = nuevoPadreInfo.id;
        data.idEspacioPadre = null;
      } else {
        // padre es Espacio
        // necesitamos también idPiso (heredado del padre)
        const padreEsp = buscarNodoEn(copia, NODO_ESPACIO, nuevoPadreInfo.id)?.nodo;
        const idPisoHeredado = padreEsp?.idPiso;
        if (idPisoHeredado != null) {
          data[isTempId(idPisoHeredado) ? "tempIdPiso" : "idPiso"] = idPisoHeredado;
        }
        data[isTempId(nuevoPadreInfo.id) ? "tempIdEspacioPadre" : "idEspacioPadre"] = nuevoPadreInfo.id;
      }
      mergeOMEterOp(opsRef, isTempId(sourceId) ? "espacio.crear" : "espacio.mover", sourceId, data);
      // También reordenar los hermanos del nuevo padre
      reordenarHermanosOp(opsRef, copia, NODO_ESPACIO, nuevoPadreInfo);
    }
    if (sourceTipo === NODO_RECURSO) {
      const data = {};
      if (nuevoPadreInfo === null || nuevoPadreInfo.tipo === NODO_PISO) {
        message.error("Un recurso debe estar dentro de un espacio.");
        return;
      }
      if (nuevoPadreInfo.tipo === NODO_ESPACIO) {
        data[isTempId(nuevoPadreInfo.id) ? "tempIdEspacio" : "idEspacio"] = nuevoPadreInfo.id;
        data.idRecursoPadre = null;
      } else {
        // padre es Recurso → necesitamos idEspacio heredado
        const padreRec = buscarNodoEn(copia, NODO_RECURSO, nuevoPadreInfo.id)?.nodo;
        const idEspHeredado = padreRec?.idEspacio;
        if (idEspHeredado != null) {
          data[isTempId(idEspHeredado) ? "tempIdEspacio" : "idEspacio"] = idEspHeredado;
        }
        data[isTempId(nuevoPadreInfo.id) ? "tempIdRecursoPadre" : "idRecursoPadre"] = nuevoPadreInfo.id;
      }
      mergeOMEterOp(opsRef, isTempId(sourceId) ? "recurso.crear" : "recurso.mover", sourceId, data);
      reordenarHermanosOp(opsRef, copia, NODO_RECURSO, nuevoPadreInfo);
    }

    setOpsCount(opsRef.current.length);
    message.success("Movido. Recordá guardar.");
  };

  // ----------------------------------------------------------
  // Guardar (commit batch) / Cancelar
  // ----------------------------------------------------------
  const handleGuardar = async () => {
    if (opsRef.current.length === 0) {
      message.info("No hay cambios pendientes.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/estructura/commit`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ operaciones: opsRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar cambios");
      message.success(`Cambios guardados (${data.cambios} operación(es))`);
      await cargarArbol();
      setSeleccion(null);
    } catch (err) {
      message.error(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleCancelar = () => {
    if (opsRef.current.length === 0) return;
    Modal.confirm({
      title: "¿Descartar los cambios pendientes?",
      content: `Se perderán ${opsRef.current.length} cambio(s) sin guardar.`,
      okText: "Descartar",
      cancelText: "Seguir editando",
      okButtonProps: { danger: true },
      onOk: () => {
        setArbol(deepClone(arbolOriginal));
        opsRef.current = [];
        setOpsCount(0);
        setSeleccion(null);
      },
    });
  };

  // ----------------------------------------------------------
  // Construcción de los datos para Tree de antd
  // ----------------------------------------------------------
  const treeData = useMemo(() => {
    const rotuloTipo = (t) => ({ sector: "Sector", area: "Área", espacio: "Espacio" }[t] || "Espacio");

    const renderRecurso = (r) => ({
      key: keyOf(NODO_RECURSO, r.idRecurso),
      title: (
        <Space size={6}>
          <BlockOutlined style={{ color: "var(--color-info)" }} />
          <span>{r.Nombre}</span>
          {r.Tipo && <Tag style={{ margin: 0 }}>{r.Tipo}</Tag>}
          {r.__nuevo && <Tag color="green" style={{ margin: 0 }}>Nuevo</Tag>}
          {(r.reservasFuturas ?? 0) > 0 && (
            <Tooltip title={`${r.reservasFuturas} reserva(s) futura(s)`}>
              <Tag color="orange" style={{ margin: 0 }}>{r.reservasFuturas} ↗</Tag>
            </Tooltip>
          )}
        </Space>
      ),
      tipo: NODO_RECURSO,
      raw: r,
      children: (r.recursos || []).map(renderRecurso),
    });

    const renderEspacio = (e) => ({
      key: keyOf(NODO_ESPACIO, e.Espacio),
      title: (
        <Space size={6}>
          <GroupOutlined style={{ color: "var(--color-brand-primary-dark)" }} />
          <span>{e.Nombre}</span>
          <Tag style={{ margin: 0 }}>{rotuloTipo(e.Tipo)}</Tag>
          {e.__nuevo && <Tag color="green" style={{ margin: 0 }}>Nuevo</Tag>}
        </Space>
      ),
      tipo: NODO_ESPACIO,
      raw: e,
      children: [
        ...(e.espacios || []).map(renderEspacio),
        ...(e.recursos || []).map(renderRecurso),
      ],
    });

    return arbol.map((p) => ({
      key: keyOf(NODO_PISO, p.idPiso),
      title: (
        <Space size={6}>
          <HomeOutlined style={{ color: "var(--color-brand-primary)" }} />
          <strong>{p.Nombre}</strong>
          {p.__nuevo && <Tag color="green" style={{ margin: 0 }}>Nuevo</Tag>}
        </Space>
      ),
      tipo: NODO_PISO,
      raw: p,
      children: (p.espacios || []).map(renderEspacio),
    }));
  }, [arbol]);

  // ----------------------------------------------------------
  // Selección
  // ----------------------------------------------------------
  const onSelect = (_keys, info) => {
    if (!info.node) { setSeleccion(null); return; }
    const { tipo, raw } = info.node;
    const id = tipo === NODO_PISO ? raw.idPiso : tipo === NODO_ESPACIO ? raw.Espacio : raw.idRecurso;
    setSeleccion({ tipo, id, nodo: raw });
    // Inicializar form de edición
    formEditar.setFieldsValue(raw);
  };

  // Renderizado
  return (
    <div className={adminLayout.layout}>
      <Header />
      <div className={adminLayout.contentWide}>
        <AdminPageHeader
          eyebrow="Configuración"
          icon={<AppstoreOutlined />}
          title="Gestión de Estructura"
          description="Estructura interna usada por el motor de reservas. Creá y reordená pisos, espacios y recursos. Los cambios se aplican al guardar."
          actions={
            <Space wrap>
              <Button
                icon={<ReloadOutlined />}
                onClick={cargarArbol}
                disabled={opsCount > 0 || guardando}
                size="large"
              >
                Recargar
              </Button>
              <Button
                icon={<UndoOutlined />}
                onClick={handleCancelar}
                disabled={opsCount === 0 || guardando}
                size="large"
              >
                Cancelar
              </Button>
              <Badge count={opsCount} offset={[-4, 4]}>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleGuardar}
                  loading={guardando}
                  disabled={opsCount === 0}
                  size="large"
                >
                  Guardar
                </Button>
              </Badge>
            </Space>
          }
        />

        {opsCount > 0 && (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message={`Tenés ${opsCount} cambio(s) sin guardar`}
            description="Los cambios solo se persisten cuando hagas clic en Guardar. Si recargás la página se perderán."
          />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 16,
          }}
        >
          {/* Árbol */}
          <Card
            bordered={false}
            style={{
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              border: "1px solid var(--color-neutral-300)",
            }}
            title={<Space><AppstoreOutlined /> Árbol</Space>}
            extra={
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={abrirCrearPiso}>
                Nuevo piso
              </Button>
            }
            styles={{ body: { minHeight: 500 } }}
          >
            {loading ? (
              <div style={{ textAlign: "center", padding: 48 }}><Spin /></div>
            ) : arbol.length === 0 ? (
              <Empty
                description="No hay pisos creados todavía"
                style={{ marginTop: 60 }}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={abrirCrearPiso}>
                  Crear el primer piso
                </Button>
              </Empty>
            ) : (
              <Tree
                showLine
                blockNode
                draggable={{ icon: <DragOutlined /> }}
                onDrop={onDrop}
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                onSelect={onSelect}
                selectedKeys={seleccion ? [keyOf(seleccion.tipo, seleccion.id)] : []}
                treeData={treeData}
              />
            )}
          </Card>

          {/* DETALLE */}
          <Card
            bordered={false}
            style={{
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              border: "1px solid var(--color-neutral-300)",
            }}
            title={
              seleccion ? (
                <Space size={8}>
                  <span
                    className={`${styles.typeChip} ${
                      seleccion.tipo === NODO_PISO
                        ? styles.chipPiso
                        : seleccion.tipo === NODO_ESPACIO
                        ? styles.chipEspacio
                        : styles.chipRecurso
                    }`}
                  >
                    {seleccion.tipo === NODO_PISO && <HomeOutlined />}
                    {seleccion.tipo === NODO_ESPACIO && <GroupOutlined />}
                    {seleccion.tipo === NODO_RECURSO && <BlockOutlined />}
                    {seleccion.tipo}
                  </span>
                  <span>{seleccion.nodo.Nombre}</span>
                </Space>
              ) : (
                "Detalle"
              )
            }
            styles={{ body: { minHeight: 500 } }}
          >
            {!seleccion ? (
              <Empty description="Seleccioná un nodo del árbol para editarlo" style={{ marginTop: 80 }} />
            ) : (
              <FormularioEdicion
                key={keyOf(seleccion.tipo, seleccion.id)}
                seleccion={seleccion}
                tiposRecurso={tiposRecurso}
                onChange={handleEditarSeleccion}
                onAddSubEspacio={() => abrirCrearEspacio(seleccion.nodo)}
                onAddRecurso={() => abrirCrearRecurso(seleccion.nodo)}
                onAddSubRecurso={() => abrirCrearRecurso(seleccion.nodo)}
                onAddEspacioEnPiso={() => abrirCrearEspacio(seleccion.nodo)}
                onEliminar={intentarEliminar}
              />
            )}
          </Card>
        </div>
      </div>

      {/* MODAL CREAR */}
      <ModalCrear
        modal={modalCrear}
        form={formCrear}
        tiposRecurso={tiposRecurso}
        onCancel={() => setModalCrear(null)}
        onSubmit={handleCrear}
      />

      {/* MODAL IMPACTO (eliminar recurso con reservas) */}
      <ModalImpacto
        impacto={impactoModal}
        onCancel={() => setImpactoModal(null)}
        onConfirm={() => {
          if (impactoModal) confirmarEliminar(impactoModal.tipo, impactoModal.id);
          setImpactoModal(null);
        }}
      />
    </div>
  );
}

// ============================================================
// Formulario de edición (panel derecho)
// ============================================================
function Seccion({ icon, titulo, hint, children }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>{icon}</span>
        <span className={styles.sectionTitle}>{titulo}</span>
        {hint && <span className={styles.sectionHint}>{hint}</span>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function ToggleCard({ label, descripcion, checked, onChange }) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      className={`${styles.toggleCard} ${checked ? styles.toggleCardOn : ""}`}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <div className={styles.toggleTexts}>
        <span className={styles.toggleLabel}>{label}</span>
        {descripcion && <span className={styles.toggleDesc}>{descripcion}</span>}
      </div>
      <Switch size="small" checked={checked} onChange={onChange} />
    </div>
  );
}

// Igual que ToggleCard pero con la firma que inyecta Form.Item (checked/onChange)
function SwitchTarjeta({ label, descripcion, checked, onChange }) {
  return (
    <ToggleCard
      label={label}
      descripcion={descripcion}
      checked={!!checked}
      onChange={(v) => onChange?.(v)}
    />
  );
}

function FormularioEdicion({
  seleccion, tiposRecurso, onChange,
  onAddEspacioEnPiso, onAddSubEspacio, onAddRecurso, onAddSubRecurso, onEliminar,
}) {
  const { tipo, nodo } = seleccion;
  const { token } = useAuth();
  const fijarBeneficio = useFijarBeneficioEstudiante(token);

  if (tipo === NODO_PISO) {
    return (
      <Form layout="vertical" className={styles.panel}>
        <div className={styles.note}>
          <InfoCircleOutlined className={styles.noteIcon} />
          <span>
            Este panel afecta únicamente la lógica de reservas. La página informativa
            «Espacios» tiene su propio contenido y no se modifica desde acá.
          </span>
        </div>

        <Seccion icon={<HomeOutlined />} titulo="Identidad">
          <Form.Item label="Nombre" required>
            <Input
              value={nodo.Nombre}
              onChange={(e) => onChange({ Nombre: e.target.value })}
              placeholder="Ej. Planta baja"
            />
          </Form.Item>
          <Form.Item
            label="Descripción interna"
            tooltip="Solo visible para el staff; no aparece en la web pública."
          >
            <Input.TextArea
              value={nodo.Descripcion || ""}
              onChange={(e) => onChange({ Descripcion: e.target.value })}
              rows={2}
              placeholder="Notas internas sobre el piso"
            />
          </Form.Item>
        </Seccion>

        <div className={styles.footer}>
          <Button type="primary" ghost icon={<PlusOutlined />} onClick={onAddEspacioEnPiso}>
            Agregar espacio
          </Button>
          <span className={styles.footerSpacer} />
          <Popconfirm
            title="¿Eliminar este piso?"
            description="Solo se puede eliminar si no tiene espacios activos."
            onConfirm={onEliminar}
            okText="Eliminar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>Eliminar piso</Button>
          </Popconfirm>
        </div>
      </Form>
    );
  }

  if (tipo === NODO_ESPACIO) {
    return (
      <Form layout="vertical" className={styles.panel}>
        <Seccion icon={<GroupOutlined />} titulo="Identidad">
          <Form.Item label="Nombre" required>
            <Input
              value={nodo.Nombre}
              onChange={(e) => onChange({ Nombre: e.target.value })}
              placeholder="Ej. Sala de reuniones"
            />
          </Form.Item>
          <div className={styles.grid2}>
            <Form.Item label="Tipo">
              <Select
                value={nodo.Tipo || "espacio"}
                onChange={(v) => onChange({ Tipo: v })}
                options={TIPO_ESPACIO_OPCIONES}
              />
            </Form.Item>
            <Form.Item label="Capacidad">
              <InputNumber
                min={0}
                value={nodo.Capacidad}
                onChange={(v) => onChange({ Capacidad: v })}
                style={{ width: "100%" }}
                placeholder="Personas"
              />
            </Form.Item>
          </div>
          <Form.Item label="Descripción">
            <Input.TextArea
              value={nodo.Descripcion || ""}
              onChange={(e) => onChange({ Descripcion: e.target.value })}
              rows={2}
              placeholder="Para qué se usa este espacio"
            />
          </Form.Item>
        </Seccion>

        <Seccion icon={<ThunderboltOutlined />} titulo="Disponibilidad">
          <div className={styles.toggleGrid}>
            <ToggleCard
              label="Disponible"
              descripcion="Se puede reservar desde la web"
              checked={nodo.Disponible !== false}
              onChange={(v) => onChange({ Disponible: v })}
            />
          </div>
        </Seccion>

        <div className={styles.footer}>
          <Button icon={<PlusOutlined />} onClick={onAddSubEspacio}>Sub-espacio</Button>
          <Button icon={<PlusOutlined />} type="primary" ghost onClick={onAddRecurso}>
            Recurso
          </Button>
          <span className={styles.footerSpacer} />
          <Popconfirm
            title="¿Eliminar este espacio?"
            description="Solo se puede eliminar si no tiene sub-espacios ni recursos activos."
            onConfirm={onEliminar}
            okText="Eliminar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>Eliminar</Button>
          </Popconfirm>
        </div>
      </Form>
    );
  }

  // RECURSO
  return (
    <Form layout="vertical" className={styles.panel}>
      <Seccion icon={<BlockOutlined />} titulo="Identidad">
        <Form.Item label="Nombre" required>
          <Input
            value={nodo.Nombre}
            onChange={(e) => onChange({ Nombre: e.target.value })}
            placeholder="Ej. Banco 2"
          />
        </Form.Item>
        <Form.Item label="Tipo de recurso">
          <Select
            allowClear
            value={nodo.Tipo || undefined}
            onChange={(v) => onChange({ Tipo: v || null })}
            placeholder="Sin tipo (ej. banco, escritorio, oficina)"
            options={tiposRecurso.map((t) => ({ value: t.clave, label: t.label }))}
          />
        </Form.Item>
        <Form.Item label="Descripción">
          <Input.TextArea
            value={nodo.Descripcion || ""}
            onChange={(e) => onChange({ Descripcion: e.target.value })}
            rows={2}
            placeholder="Cómo es y para qué sirve este recurso"
          />
        </Form.Item>
      </Seccion>

      <Seccion icon={<GoldOutlined />} titulo="Créditos" hint="Dejá vacío si no aplica">
        <div className={styles.grid3}>
          <Form.Item label="Por hora">
            <InputNumber
              min={0}
              step={1}
              precision={0}
              style={{ width: "100%" }}
              placeholder="0"
              value={nodo.PrecioHora}
              onChange={(v) => onChange({ PrecioHora: v })}
            />
          </Form.Item>
          <Form.Item label="Semanal">
            <InputNumber
              min={0}
              step={1}
              precision={0}
              style={{ width: "100%" }}
              placeholder="0"
              value={nodo.PrecioSemanal}
              onChange={(v) => onChange({ PrecioSemanal: v })}
            />
          </Form.Item>
          <Form.Item label="Mensual">
            <InputNumber
              min={0}
              step={1}
              precision={0}
              style={{ width: "100%" }}
              placeholder="0"
              value={nodo.PrecioMensual}
              onChange={(v) => onChange({ PrecioMensual: v })}
            />
          </Form.Item>
        </div>
      </Seccion>

      <Seccion icon={<ThunderboltOutlined />} titulo="Modalidad de reserva">
        <div className={styles.toggleGrid}>
          <ToggleCard
            label="Es completo"
            descripcion="Contenedor de sub-recursos"
            checked={!!nodo.esCompleto}
            onChange={(v) => onChange({ esCompleto: v })}
          />
          <ToggleCard
            label="Reservable por turno"
            descripcion="Se reserva por bloques horarios"
            checked={nodo.EsReservablePorTurno !== false}
            onChange={(v) => onChange({ EsReservablePorTurno: v })}
          />
          <ToggleCard
            label="Pack semanal"
            descripcion="Acepta abonos por semana"
            checked={!!nodo.AceptaPackSemanal}
            onChange={(v) => onChange({ AceptaPackSemanal: v })}
          />
          <ToggleCard
            label="Pack mensual"
            descripcion="Acepta abonos por mes"
            checked={!!nodo.AceptaPackMensual}
            onChange={(v) => onChange({ AceptaPackMensual: v })}
          />
        </div>
      </Seccion>

      <Seccion icon={<ReadOutlined />} titulo="Beneficios">
        <div className={styles.toggleGrid}>
          <ToggleCard
            label="Gratuito para estudiantes"
            descripcion={
              isTempId(seleccion.id)
                ? "Guardá el recurso antes de activar este beneficio"
                : "Las cuentas verificadas como estudiante reservan este recurso por turno sin consumir créditos"
            }
            checked={nodo.beneficioEstudiante === true}
            onChange={(v) => {
              if (isTempId(seleccion.id)) return;
              fijarBeneficio.mutate(
                { idRecurso: nodo.idRecurso, habilitado: v },
                {
                  onSuccess: () => {
                    onChange({ beneficioEstudiante: v });
                    message.success(v ? "Recurso marcado como gratuito para estudiantes." : "Beneficio desactivado.");
                  },
                  onError: (err) => message.error(err.message || "No se pudo guardar el beneficio."),
                }
              );
            }}
          />
        </div>
      </Seccion>

      <div className={styles.footer}>
        <Button icon={<PlusOutlined />} onClick={onAddSubRecurso}>Sub-recurso</Button>
        <span className={styles.footerSpacer} />
        <Popconfirm
          title="¿Eliminar este recurso?"
          description="No se puede eliminar si tiene reservas futuras o sub-recursos activos."
          onConfirm={onEliminar}
          okText="Eliminar"
          cancelText="Cancelar"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />}>Eliminar</Button>
        </Popconfirm>
      </div>
    </Form>
  );
}

// ============================================================
// Modal de creación
// ============================================================
function ModalCrear({ modal, form, tiposRecurso, onCancel, onSubmit }) {
  if (!modal) return null;
  const { tipo, parent } = modal;
  const titulos = { piso: "Nuevo piso", espacio: "Nuevo espacio", recurso: "Nuevo recurso" };
  const padreNombre = parent?.Nombre;

  return (
    <Modal
      open
      title={titulos[tipo]}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="Agregar"
      cancelText="Cancelar"
      destroyOnClose
      width={600}
    >
      {padreNombre && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Dentro de: ${padreNombre}`}
        />
      )}
      <Form form={form} layout="vertical" onFinish={onSubmit} className={styles.panel}>
        <Form.Item name="Nombre" label="Nombre" rules={[{ required: true, message: "Nombre requerido" }]}>
          <Input autoFocus placeholder="Nombre visible en el árbol" />
        </Form.Item>

        {tipo === NODO_ESPACIO && (
          <>
            <div className={styles.grid2}>
              <Form.Item name="Tipo" label="Tipo" initialValue="espacio">
                <Select options={TIPO_ESPACIO_OPCIONES} />
              </Form.Item>
              <Form.Item name="Capacidad" label="Capacidad">
                <InputNumber min={0} style={{ width: "100%" }} placeholder="Personas" />
              </Form.Item>
            </div>
            <Form.Item name="Disponible" valuePropName="checked" initialValue={true} noStyle>
              <SwitchTarjeta
                label="Disponible"
                descripcion="Se puede reservar desde la web"
              />
            </Form.Item>
          </>
        )}

        {tipo === NODO_RECURSO && (
          <>
            <Form.Item name="Tipo" label="Tipo de recurso">
              <Select
                allowClear
                placeholder="Banco, escritorio, oficina..."
                options={tiposRecurso.map((t) => ({ value: t.clave, label: t.label }))}
              />
            </Form.Item>
            <Seccion icon={<GoldOutlined />} titulo="Créditos" hint="Dejá vacío si no aplica">
              <div className={styles.grid3}>
                <Form.Item name="PrecioHora" label="Por hora">
                  <InputNumber min={0} step={1} precision={0} style={{ width: "100%" }} placeholder="0" />
                </Form.Item>
                <Form.Item name="PrecioSemanal" label="Semanal">
                  <InputNumber min={0} step={1} precision={0} style={{ width: "100%" }} placeholder="0" />
                </Form.Item>
                <Form.Item name="PrecioMensual" label="Mensual">
                  <InputNumber min={0} step={1} precision={0} style={{ width: "100%" }} placeholder="0" />
                </Form.Item>
              </div>
            </Seccion>
            <Seccion icon={<ThunderboltOutlined />} titulo="Modalidad de reserva">
              <div className={styles.toggleGrid}>
                <Form.Item name="esCompleto" valuePropName="checked" initialValue={false} noStyle>
                  <SwitchTarjeta label="Es completo" descripcion="Contenedor de sub-recursos" />
                </Form.Item>
                <Form.Item name="EsReservablePorTurno" valuePropName="checked" initialValue={true} noStyle>
                  <SwitchTarjeta label="Reservable por turno" descripcion="Se reserva por bloques horarios" />
                </Form.Item>
                <Form.Item name="AceptaPackSemanal" valuePropName="checked" initialValue={false} noStyle>
                  <SwitchTarjeta label="Pack semanal" descripcion="Acepta abonos por semana" />
                </Form.Item>
                <Form.Item name="AceptaPackMensual" valuePropName="checked" initialValue={false} noStyle>
                  <SwitchTarjeta label="Pack mensual" descripcion="Acepta abonos por mes" />
                </Form.Item>
              </div>
            </Seccion>
          </>
        )}

        <Form.Item name="Descripcion" label="Descripción">
          <Input.TextArea rows={2} placeholder="Opcional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================
// Modal de impacto (al borrar recurso)
// ============================================================
function ModalImpacto({ impacto, onCancel, onConfirm }) {
  if (!impacto) return null;
  const { nombre, impacto: data } = impacto;
  const bloqueado = data.futuras > 0;
  return (
    <Modal
      open
      title={<Space><WarningOutlined style={{ color: "var(--color-warning)" }} /> Eliminar recurso</Space>}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="Eliminar igualmente"
      cancelText="Cancelar"
      okButtonProps={{ danger: true, disabled: bloqueado }}
    >
      <Typography.Paragraph>
        El recurso <strong>{nombre}</strong> tiene:
      </Typography.Paragraph>
      <ul>
        <li><strong>{data.futuras}</strong> reserva(s) futura(s)</li>
        <li><strong>{data.pasadas}</strong> reserva(s) pasada(s)</li>
        <li><strong>{data.total}</strong> reserva(s) en total</li>
      </ul>
      {bloqueado ? (
        <Alert
          type="error"
          showIcon
          message="No se puede eliminar"
          description="Tiene reservas futuras. Cancelalas primero o esperá a que pasen."
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Se hará una eliminación lógica (soft delete)"
          description="El recurso se ocultará pero las reservas históricas se mantienen para los reportes."
        />
      )}
    </Modal>
  );
}
