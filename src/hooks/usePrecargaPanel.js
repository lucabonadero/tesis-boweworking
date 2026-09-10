import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { RUTAS_ADMIN } from "../rutasAdmin.js";

/**
 * Baja los chunks del panel administrativo apenas se confirma que la persona
 * es del personal.
 *
 * El staff entra al panel y salta entre secciones toda la sesión, así que
 * esperar al click para empezar a descargar solo agrega un spinner en cada
 * navegación. Precargando acá, para cuando termina de mirar el panel inicial el
 * resto ya está en caché y no vuelve a ver una pantalla de carga, venga por
 * donde venga (menú, URL directa o botón atrás).
 *
 * Corre en el tiempo ocioso del navegador: el panel está pidiendo sus datos en
 * ese momento y esos chunks no deben competir por el ancho de banda. Si
 * `requestIdleCallback` no existe (Safari), un timeout cumple el mismo rol.
 */
export function usePrecargaPanel() {
  const { isStaff, hasPermission } = useAuth();

  useEffect(() => {
    if (!isStaff) return;

    // Solo lo que la persona puede abrir: precargar una sección bloqueada
    // gastaría datos en un chunk que nunca se va a renderizar.
    const pendientes = RUTAS_ADMIN.filter(
      (ruta) => !ruta.permiso || hasPermission(ruta.permiso)
    );

    let cancelado = false;
    const precargar = () => {
      if (cancelado) return;
      // Un chunk que falla (se cayó la red, hubo un deploy) no debe romper
      // nada: la navegación real lo vuelve a pedir y ahí sí se ve el error.
      pendientes.forEach((ruta) => ruta.cargar().catch(() => {}));
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(precargar, { timeout: 3000 });
      return () => {
        cancelado = true;
        window.cancelIdleCallback?.(id);
      };
    }

    const id = setTimeout(precargar, 1500);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [isStaff, hasPermission]);
}
