/**
 * Rutas del panel administrativo, cargadas bajo demanda.
 *
 * Antes todo el panel viajaba en el bundle inicial: quien entraba a la landing
 * descargaba la gestión de estructura, el dashboard de espacios y el control de
 * reservas sin poder abrirlos nunca. Con el import dinámico Vite los emite como
 * chunks aparte y el navegador los pide recién cuando hacen falta.
 *
 * Cada entrada guarda su `cargar` para poder precargarla desde el panel una vez
 * que se sabe que la persona es del personal (ver `usePrecargaPanel`).
 * `permiso` replica el que exige la ruta en App.jsx: sin eso la precarga
 * bajaría chunks de secciones que el usuario tiene bloqueadas.
 */

export const RUTAS_ADMIN = [
  { cargar: () => import("./pages/admin/PanelAdmin.jsx"), permiso: null },
  { cargar: () => import("./pages/admin/consultareservas.jsx"), permiso: null },
  { cargar: () => import("./pages/admin/altas.jsx"), permiso: null },
  { cargar: () => import("./pages/admin/espaciosdashboard.jsx"), permiso: null },
  { cargar: () => import("./pages/admin/Gestionfinanciera.jsx"), permiso: "ver_financiero" },
  { cargar: () => import("./pages/admin/GestionUsuarios.jsx"), permiso: "gestionar_usuarios" },
  { cargar: () => import("./pages/admin/GestionEstructura.jsx"), permiso: "gestionar_estructura" },
  { cargar: () => import("./pages/admin/GestionCreditos.jsx"), permiso: "gestionar_creditos" },
  { cargar: () => import("./pages/admin/GestionDisponibilidad.jsx"), permiso: "gestionar_estructura" },
];
