import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const beneficioEstudianteKeys = {
  all: ["admin", "beneficios-estudiante"],
};

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data ?? {};
    this.codigo = data?.codigo;
  }
}

async function pedir(url, { token, ...init } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ApiError(data?.message || "Error al comunicarse con el servidor", res.status, data);
  }
  return data;
}

export function useBeneficiosEstudiante(token) {
  return useQuery({
    queryKey: beneficioEstudianteKeys.all,
    queryFn: () => pedir(`${API_URL}/api/admin/beneficios-estudiante`, { token }),
    enabled: Boolean(token),
  });
}

export function useFijarBeneficioEstudiante(token) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idRecurso, habilitado }) =>
      pedir(`${API_URL}/api/admin/beneficios-estudiante/${idRecurso}`, {
        token,
        method: "PUT",
        body: JSON.stringify({ habilitado }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: beneficioEstudianteKeys.all }),
  });
}
