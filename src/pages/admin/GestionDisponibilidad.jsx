import { useState, useMemo } from "react";
import { Cascader, Tabs, DatePicker, Input, Button, List, Popconfirm, message, Empty, Badge } from "antd";
import { useQuery } from "@tanstack/react-query";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import Header from "../../components/header.jsx";
import { BuildOutlined } from "@ant-design/icons";
import GrillaDisponibilidad from "../../components/GrillaDisponibilidad.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  useBloqueos,
  useCrearBloqueo,
  useEliminarBloqueo,
  useDisponibilidadRecurso,
  useGuardarDisponibilidad,
} from "../../hooks/useDisponibilidad.js";
import adminLayout from "../../styles/admin/adminLayout.module.css";
import styles from "../../styles/admin/gestionDisponibilidad.module.css";

const { RangePicker } = DatePicker;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Arma las opciones del Cascader recorriendo espacios de forma recursiva:
 * un espacio puede tener tanto `recursos` como sub-`espacios` anidados. */
function espacioAOpcion(espacio) {
  const hijos = espacio.espacios || [];
  return {
    value: `espacio-${espacio.Espacio}`,
    label: espacio.Nombre,
    recursos: espacio.recursos || [],
    children: hijos.length ? hijos.map(espacioAOpcion) : undefined,
  };
}

export default function GestionDisponibilidad() {
  const { token } = useAuth();
  const [rutaEspacio, setRutaEspacio] = useState([]);
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null);
  const [idRecurso, setIdRecurso] = useState(null);
  const [franjas, setFranjas] = useState([]);
  const [franjasTocadas, setFranjasTocadas] = useState(false);
  const [rango, setRango] = useState(null);
  const [motivo, setMotivo] = useState("");

  const { data: estructura = [] } = useQuery({
    queryKey: ["admin", "estructura"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/admin/estructura`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("No se pudo cargar la estructura.");
      return res.json();
    },
    enabled: Boolean(token),
  });

  const opcionesCascader = useMemo(
    () =>
      (estructura || []).map((piso) => ({
        value: `piso-${piso.idPiso}`,
        label: piso.Nombre,
        children: (piso.espacios || []).map(espacioAOpcion),
      })),
    [estructura]
  );

  const { data: franjasGuardadas } = useDisponibilidadRecurso(idRecurso, token);
  const { data: bloqueos = [] } = useBloqueos(idRecurso, token);
  const guardar = useGuardarDisponibilidad(token);
  const crear = useCrearBloqueo(token);
  const eliminar = useEliminarBloqueo(token);

  const elegirRecurso = (rec) => {
    setIdRecurso(rec.idRecurso);
    setFranjas([]);
    setFranjasTocadas(false);
  };

  // Al llegar del servidor, se normaliza { DiaSemana, HoraInicio, HoraFin } al shape de la grilla.
  // `franjasTocadas` (no franjas.length) distingue "sin editar" de "editado a vacío" (ej. Limpiar).
  const franjasVigentes = franjasTocadas
    ? franjas
    : (franjasGuardadas || []).map((f) => ({
        diaSemana: f.DiaSemana,
        horaInicio: String(f.HoraInicio).slice(0, 5),
        horaFin: String(f.HoraFin).slice(0, 5),
      }));

  const onGuardar = () => {
    guardar.mutate(
      { idRecurso, franjas: franjasVigentes },
      {
        onSuccess: () => {
          message.success("Disponibilidad guardada.");
          setFranjas([]);
          setFranjasTocadas(false);
        },
        onError: (e) => message.error(e.message),
      }
    );
  };

  const onCrearBloqueo = () => {
    if (!rango || !idRecurso) return message.warning("Elegí un recurso y un rango de fechas.");
    crear.mutate(
      {
        idRecurso,
        fechaInicio: rango[0].format("YYYY-MM-DDTHH:mm:00"),
        fechaFin: rango[1].format("YYYY-MM-DDTHH:mm:00"),
        motivo: motivo || null,
      },
      {
        onSuccess: (data) => {
          const n = data.reservasAfectadas?.length ?? 0;
          message.success(
            n > 0 ? `Bloqueo creado. Atención: ${n} reserva(s) ya existente(s) caen en ese rango.` : "Bloqueo creado."
          );
          setRango(null);
          setMotivo("");
        },
        onError: (e) => message.error(e.message),
      }
    );
  };

  return (
    <div className={adminLayout.layout}>
      <Header />
      <div className={adminLayout.contentWide}>
        <AdminPageHeader
          eyebrow="Administración"
          icon={<BuildOutlined />}
          title="Gestión de disponibilidad"
          description="Configurá el horario semanal de cada recurso y creá bloqueos temporales."
        />

        <div className={styles.panelDisponibilidad}>
          <aside>
            <h3>Recurso</h3>
            <Cascader
              options={opcionesCascader}
              value={rutaEspacio}
              onChange={(v, selectedOptions) => {
                setRutaEspacio(v || []);
                setNodoSeleccionado(selectedOptions?.[selectedOptions.length - 1] ?? null);
                setIdRecurso(null);
                setFranjas([]);
                setFranjasTocadas(false);
              }}
              changeOnSelect
              placeholder="Piso / Espacio"
              style={{ width: "100%" }}
            />

            <div className={styles.tarjetasRecurso}>
              {(nodoSeleccionado?.recursos ?? []).map((rec) => (
                <div
                  key={rec.idRecurso}
                  className={[styles.tarjetaRecurso, idRecurso === rec.idRecurso ? styles.tarjetaActiva : ""].join(" ")}
                  onClick={() => elegirRecurso(rec)}
                >
                  <div style={{ fontSize: "1.6rem" }}>{rec.Tipo === "sala" ? "🚪" : "🪑"}</div>
                  <div>{rec.Nombre}</div>
                </div>
              ))}
            </div>
          </aside>

          <section>
            {!idRecurso ? (
              <Empty description="Elegí un espacio y después un recurso para configurar su disponibilidad." />
            ) : (
              <Tabs
                items={[
                  {
                    key: "horarios",
                    label: "Horarios",
                    children: (
                      <>
                        <GrillaDisponibilidad
                          value={franjasVigentes}
                          onChange={(f) => {
                            setFranjas(f);
                            setFranjasTocadas(true);
                          }}
                          bloqueos={bloqueos}
                        />
                        <Button type="primary" loading={guardar.isPending} onClick={onGuardar} style={{ marginTop: 16 }}>
                          Guardar horarios
                        </Button>
                      </>
                    ),
                  },
                  {
                    key: "bloqueos",
                    label: (
                      <Badge count={bloqueos.length} offset={[10, 0]}>
                        Bloqueos
                      </Badge>
                    ),
                    children: (
                      <>
                        <RangePicker showTime format="DD/MM/YYYY HH:mm" value={rango} onChange={setRango} />
                        <Input
                          placeholder="Motivo (opcional)"
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          maxLength={300}
                          style={{ margin: "12px 0" }}
                        />
                        <Button type="primary" loading={crear.isPending} onClick={onCrearBloqueo}>
                          Crear bloqueo
                        </Button>

                        <List
                          style={{ marginTop: 20 }}
                          dataSource={bloqueos}
                          locale={{ emptyText: "Sin bloqueos para este recurso." }}
                          renderItem={(b) => (
                            <List.Item
                              actions={[
                                <Popconfirm
                                  key="del"
                                  title="¿Eliminar este bloqueo?"
                                  onConfirm={() => eliminar.mutate(b.idBloqueo)}
                                >
                                  <Button danger size="small">
                                    Eliminar
                                  </Button>
                                </Popconfirm>,
                              ]}
                            >
                              <List.Item.Meta
                                title={`${new Date(b.FechaInicio).toLocaleString("es-AR")} → ${new Date(b.FechaFin).toLocaleString("es-AR")}`}
                                description={b.Motivo || "Sin motivo"}
                              />
                            </List.Item>
                          )}
                        />
                      </>
                    ),
                  },
                ]}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
