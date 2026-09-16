--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_touch_updatedat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_touch_updatedat() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: BloqueosRecurso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BloqueosRecurso" (
    "idBloqueo" integer NOT NULL,
    "idRecurso" integer NOT NULL,
    "FechaInicio" timestamp without time zone NOT NULL,
    "FechaFin" timestamp without time zone NOT NULL,
    "Motivo" character varying(300),
    "creadoPor" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT bloqueo_rango_valido CHECK (("FechaInicio" < "FechaFin"))
);


--
-- Name: BloqueosRecurso_idBloqueo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."BloqueosRecurso_idBloqueo_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: BloqueosRecurso_idBloqueo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."BloqueosRecurso_idBloqueo_seq" OWNED BY public."BloqueosRecurso"."idBloqueo";


--
-- Name: Cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Cliente" (
    "DNI" character varying(8) NOT NULL,
    "Nombre" character varying,
    "Apellido" character varying,
    "Email" character varying,
    "idEmpresa" integer
);


--
-- Name: ClienteUsuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClienteUsuario" (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    google_id character varying(255),
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    dni character varying(20),
    telefono character varying(30),
    perfil_completo boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    rol character varying(20) DEFAULT 'usuario'::character varying NOT NULL,
    estado_verificacion_estudiante character varying(20) DEFAULT 'no_solicitado'::character varying NOT NULL,
    estado_cuenta character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    institucion_estudiante character varying(160),
    comprobante_estudiante text,
    solicitud_estudiante_at timestamp without time zone,
    resolucion_estudiante_at timestamp without time zone,
    motivo_rechazo_estudiante text,
    resuelto_por_usuario_id integer,
    bloqueado_at timestamp without time zone,
    motivo_bloqueo text,
    bloqueado_por_usuario_id integer,
    CONSTRAINT clienteusuario_estado_cuenta_check CHECK (((estado_cuenta)::text = ANY ((ARRAY['activo'::character varying, 'bloqueado'::character varying])::text[]))),
    CONSTRAINT clienteusuario_rol_check CHECK (((rol)::text = ANY ((ARRAY['usuario'::character varying, 'estudiante'::character varying])::text[]))),
    CONSTRAINT clienteusuario_verif_estudiante_check CHECK (((estado_verificacion_estudiante)::text = ANY ((ARRAY['no_solicitado'::character varying, 'pendiente'::character varying, 'aprobado'::character varying, 'rechazado'::character varying])::text[])))
);


--
-- Name: ClienteUsuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ClienteUsuario_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ClienteUsuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ClienteUsuario_id_seq" OWNED BY public."ClienteUsuario".id;


--
-- Name: DisponibilidadRecurso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DisponibilidadRecurso" (
    "idDisponibilidad" integer NOT NULL,
    "idRecurso" integer NOT NULL,
    "DiaSemana" smallint NOT NULL,
    "HoraInicio" time without time zone NOT NULL,
    "HoraFin" time without time zone NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "DisponibilidadRecurso_DiaSemana_check" CHECK ((("DiaSemana" >= 0) AND ("DiaSemana" <= 6))),
    CONSTRAINT disponibilidad_rango_valido CHECK (("HoraInicio" < "HoraFin"))
);


--
-- Name: COLUMN "DisponibilidadRecurso"."DiaSemana"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."DisponibilidadRecurso"."DiaSemana" IS '0=domingo, 1=lunes, ... 6=sábado (igual que Date.getUTCDay)';


--
-- Name: DisponibilidadRecurso_idDisponibilidad_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."DisponibilidadRecurso_idDisponibilidad_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: DisponibilidadRecurso_idDisponibilidad_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."DisponibilidadRecurso_idDisponibilidad_seq" OWNED BY public."DisponibilidadRecurso"."idDisponibilidad";


--
-- Name: Empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Empresa" (
    "idEmpresa" integer NOT NULL,
    "Nombre" character varying,
    "Asistente" character varying
);


--
-- Name: Espacios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Espacios" (
    "Espacio" integer NOT NULL,
    "Nombre" character varying,
    "Capacidad" integer,
    "Disponible" boolean,
    "idPiso" integer,
    "idEspacioPadre" integer,
    "Tipo" character varying(20) DEFAULT 'espacio'::character varying NOT NULL,
    "Orden" integer DEFAULT 0 NOT NULL,
    "Activo" boolean DEFAULT true NOT NULL,
    "Descripcion" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT espacios_tipo_check CHECK ((("Tipo")::text = ANY (ARRAY[('sector'::character varying)::text, ('area'::character varying)::text, ('espacio'::character varying)::text])))
);


--
-- Name: Pisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Pisos" (
    "idPiso" integer NOT NULL,
    "Nombre" character varying(120) NOT NULL,
    "Descripcion" text,
    "Orden" integer DEFAULT 0 NOT NULL,
    "Activo" boolean DEFAULT true NOT NULL,
    "Icono" character varying(50),
    "Color" character varying(20),
    "ImagenUrl" character varying(500),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "IdealPara" text,
    "Amenities" text[] DEFAULT ARRAY[]::text[],
    "Imagenes" jsonb DEFAULT '[]'::jsonb,
    "Publicado" boolean DEFAULT true NOT NULL
);


--
-- Name: COLUMN "Pisos"."Amenities"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Pisos"."Amenities" IS 'Lista de comodidades del piso (ej. {"Wi-Fi","Cocina","Impresora"})';


--
-- Name: COLUMN "Pisos"."Imagenes"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Pisos"."Imagenes" IS 'JSON array: [{ "url": string, "alt": string, "caption"?: string }]. Url puede ser absoluta o /assets/...';


--
-- Name: Pisos_idPiso_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Pisos_idPiso_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Pisos_idPiso_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Pisos_idPiso_seq" OWNED BY public."Pisos"."idPiso";


--
-- Name: RecursoBeneficioEstudiante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecursoBeneficioEstudiante" (
    "idRecurso" integer NOT NULL,
    habilitado boolean DEFAULT true NOT NULL,
    actualizado_at timestamp without time zone DEFAULT now() NOT NULL,
    actualizado_por integer
);


--
-- Name: Recursos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Recursos" (
    "idRecurso" integer NOT NULL,
    "idEspacio" integer NOT NULL,
    "Nombre" character varying(255) NOT NULL,
    "Descripcion" character varying(500),
    "idRecursoPadre" integer,
    "esCompleto" boolean DEFAULT false,
    "PrecioHora" numeric(10,2),
    "PrecioSemanal" numeric(10,2),
    "PrecioMensual" numeric(10,2),
    "Tipo" character varying(40),
    "Orden" integer DEFAULT 0 NOT NULL,
    "Activo" boolean DEFAULT true NOT NULL,
    "AceptaPackSemanal" boolean DEFAULT false NOT NULL,
    "AceptaPackMensual" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "EsReservablePorTurno" boolean DEFAULT true NOT NULL
);


--
-- Name: Recursos_idRecurso_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Recursos_idRecurso_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Recursos_idRecurso_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Recursos_idRecurso_seq" OWNED BY public."Recursos"."idRecurso";


--
-- Name: ReservaExtension; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReservaExtension" (
    "idExtension" integer NOT NULL,
    "idReserva" integer NOT NULL,
    "Veces" integer DEFAULT 1 NOT NULL,
    "HorarioFinOriginal" time without time zone NOT NULL,
    "HorarioFinActual" time without time zone NOT NULL,
    "MinutosExtension" integer DEFAULT 0 NOT NULL,
    "Fracciones" integer DEFAULT 0 NOT NULL,
    "PrecioFraccion" numeric(12,2) DEFAULT 0 NOT NULL,
    "Monto" numeric(12,2) DEFAULT 0 NOT NULL,
    "Finalizada" boolean DEFAULT false NOT NULL,
    "CreadaPor" character varying(120),
    "CreadaEn" timestamp with time zone DEFAULT now() NOT NULL,
    "ActualizadaEn" timestamp with time zone DEFAULT now() NOT NULL,
    "CreditosDescontados" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "ReservaExtension_CreditosDescontados_check" CHECK (("CreditosDescontados" >= 0)),
    CONSTRAINT "ReservaExtension_Veces_check" CHECK (("Veces" > 0))
);


--
-- Name: ReservaExtension_idExtension_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ReservaExtension_idExtension_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ReservaExtension_idExtension_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ReservaExtension_idExtension_seq" OWNED BY public."ReservaExtension"."idExtension";


--
-- Name: ReservaSerie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReservaSerie" (
    "idSerie" integer NOT NULL,
    "DNI" character varying(20) NOT NULL,
    "Nombre" character varying(255),
    "idRecurso" integer NOT NULL,
    anio integer,
    mes integer,
    "diaSemana" integer NOT NULL,
    "HorarioReserva" time without time zone NOT NULL,
    "HorarioFin" time without time zone NOT NULL,
    "descuentoAplicado" numeric(6,4) DEFAULT 0 NOT NULL,
    "precioListaTotal" numeric(12,2) NOT NULL,
    "precioFinalTotal" numeric(12,2) NOT NULL,
    "nOcurrencias" integer NOT NULL,
    "Estado" character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    "periodoDesde" date,
    "periodoHasta" date,
    CONSTRAINT "ReservaSerie_Estado_check" CHECK ((("Estado")::text = ANY (ARRAY[('activa'::character varying)::text, ('cancelada'::character varying)::text]))),
    CONSTRAINT "ReservaSerie_diaSemana_check" CHECK ((("diaSemana" >= 1) AND ("diaSemana" <= 7))),
    CONSTRAINT "ReservaSerie_mes_check" CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: ReservaSerie_idSerie_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ReservaSerie_idSerie_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ReservaSerie_idSerie_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ReservaSerie_idSerie_seq" OWNED BY public."ReservaSerie"."idSerie";


--
-- Name: Reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Reservas" (
    "idReserva" integer NOT NULL,
    "DNI" character varying(8),
    "Nombre" character varying,
    "HorarioReserva" character varying,
    "Monto" numeric,
    "DiaReserva" date,
    "idRecurso" integer,
    "HorarioFin" character varying(255),
    "TipoReserva" character varying(20) DEFAULT 'turno'::character varying,
    "idSerie" integer,
    "Estado" character varying(20) DEFAULT 'activa'::character varying,
    "idReservaGrupo" integer,
    "RecepcionadaEn" timestamp with time zone,
    "HorarioFinOriginal" time without time zone,
    CONSTRAINT "Reservas_Estado_check" CHECK ((("Estado")::text = ANY (ARRAY[('activa'::character varying)::text, ('en_curso'::character varying)::text, ('completada'::character varying)::text, ('no_asistio'::character varying)::text, ('cancelada'::character varying)::text])))
);


--
-- Name: Reservas_idReserva_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Reservas_idReserva_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Reservas_idReserva_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Reservas_idReserva_seq" OWNED BY public."Reservas"."idReserva";


--
-- Name: TiposRecurso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TiposRecurso" (
    clave character varying(40) NOT NULL,
    label character varying(120) NOT NULL,
    icono character varying(50)
);


--
-- Name: Transaccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transaccion" (
    "idTransaccion" integer NOT NULL,
    "idReserva" integer,
    "MetodoPago" character varying,
    "EstadoPago" character varying,
    "TipoPago" character varying(20) DEFAULT 'presencial'::character varying,
    mp_preference_id character varying(255),
    mp_payment_id character varying(255),
    "ClasificacionPago" character varying(32),
    "idExtension" integer
);


--
-- Name: TransaccionReserva; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransaccionReserva" (
    "idTransaccion" integer NOT NULL,
    "idReserva" integer NOT NULL
);


--
-- Name: Transaccion_idTransaccion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Transaccion_idTransaccion_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Transaccion_idTransaccion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Transaccion_idTransaccion_seq" OWNED BY public."Transaccion"."idTransaccion";


--
-- Name: creditos_compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creditos_compra (
    id integer NOT NULL,
    cliente_usuario_id integer NOT NULL,
    paquete_id integer,
    creditos integer NOT NULL,
    precio numeric(10,2) NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    mp_preference_id character varying(120),
    mp_payment_id character varying(120),
    acreditada_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    origen character varying(20) DEFAULT 'mercadopago'::character varying NOT NULL,
    metodo_pago character varying(30),
    registrada_por_usuario_id integer,
    anulada_at timestamp without time zone,
    anulada_por_usuario_id integer,
    CONSTRAINT creditos_compra_creditos_check CHECK ((creditos > 0)),
    CONSTRAINT creditos_compra_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'acreditada'::character varying, 'rechazada'::character varying, 'anulada'::character varying])::text[]))),
    CONSTRAINT creditos_compra_origen_check CHECK (((origen)::text = ANY ((ARRAY['mercadopago'::character varying, 'presencial'::character varying])::text[]))),
    CONSTRAINT creditos_compra_precio_check CHECK ((precio >= (0)::numeric))
);


--
-- Name: creditos_compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creditos_compra_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creditos_compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creditos_compra_id_seq OWNED BY public.creditos_compra.id;


--
-- Name: creditos_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creditos_config (
    id integer NOT NULL,
    pesos_por_credito numeric(10,2) DEFAULT 100.00 NOT NULL,
    CONSTRAINT creditos_config_id_check CHECK ((id = 1)),
    CONSTRAINT creditos_config_pesos_por_credito_check CHECK ((pesos_por_credito > (0)::numeric))
);


--
-- Name: creditos_movimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creditos_movimiento (
    id integer NOT NULL,
    cliente_usuario_id integer NOT NULL,
    tipo character varying(30) NOT NULL,
    cantidad integer NOT NULL,
    saldo_posterior integer NOT NULL,
    motivo text,
    id_reserva integer,
    compra_id integer,
    admin_usuario_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT creditos_movimiento_cantidad_check CHECK ((cantidad <> 0)),
    CONSTRAINT creditos_movimiento_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['descuento_reserva'::character varying, 'ajuste_admin'::character varying, 'compra_paquete'::character varying, 'reintegro_cancelacion'::character varying])::text[])))
);


--
-- Name: creditos_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creditos_movimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creditos_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creditos_movimiento_id_seq OWNED BY public.creditos_movimiento.id;


--
-- Name: creditos_paquete; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creditos_paquete (
    id integer NOT NULL,
    nombre character varying(120) NOT NULL,
    creditos integer NOT NULL,
    precio numeric(10,2) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    actualizado_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT creditos_paquete_creditos_check CHECK ((creditos > 0)),
    CONSTRAINT creditos_paquete_precio_check CHECK ((precio >= (0)::numeric))
);


--
-- Name: creditos_paquete_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creditos_paquete_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creditos_paquete_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creditos_paquete_id_seq OWNED BY public.creditos_paquete.id;


--
-- Name: creditos_saldo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creditos_saldo (
    cliente_usuario_id integer NOT NULL,
    saldo integer DEFAULT 0 NOT NULL,
    actualizado_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos (
    clave character varying(50) NOT NULL,
    descripcion text NOT NULL,
    modulo character varying(50) NOT NULL
);


--
-- Name: usuario_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_permisos (
    usuario_id integer NOT NULL,
    permiso_clave character varying(50) NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    rol character varying(20) DEFAULT 'empleado'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY (ARRAY[('admin'::character varying)::text, ('empleado'::character varying)::text, ('staff'::character varying)::text])))
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: BloqueosRecurso idBloqueo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueosRecurso" ALTER COLUMN "idBloqueo" SET DEFAULT nextval('public."BloqueosRecurso_idBloqueo_seq"'::regclass);


--
-- Name: ClienteUsuario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario" ALTER COLUMN id SET DEFAULT nextval('public."ClienteUsuario_id_seq"'::regclass);


--
-- Name: DisponibilidadRecurso idDisponibilidad; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DisponibilidadRecurso" ALTER COLUMN "idDisponibilidad" SET DEFAULT nextval('public."DisponibilidadRecurso_idDisponibilidad_seq"'::regclass);


--
-- Name: Pisos idPiso; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pisos" ALTER COLUMN "idPiso" SET DEFAULT nextval('public."Pisos_idPiso_seq"'::regclass);


--
-- Name: Recursos idRecurso; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Recursos" ALTER COLUMN "idRecurso" SET DEFAULT nextval('public."Recursos_idRecurso_seq"'::regclass);


--
-- Name: ReservaExtension idExtension; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaExtension" ALTER COLUMN "idExtension" SET DEFAULT nextval('public."ReservaExtension_idExtension_seq"'::regclass);


--
-- Name: ReservaSerie idSerie; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaSerie" ALTER COLUMN "idSerie" SET DEFAULT nextval('public."ReservaSerie_idSerie_seq"'::regclass);


--
-- Name: Reservas idReserva; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reservas" ALTER COLUMN "idReserva" SET DEFAULT nextval('public."Reservas_idReserva_seq"'::regclass);


--
-- Name: Transaccion idTransaccion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaccion" ALTER COLUMN "idTransaccion" SET DEFAULT nextval('public."Transaccion_idTransaccion_seq"'::regclass);


--
-- Name: creditos_compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra ALTER COLUMN id SET DEFAULT nextval('public.creditos_compra_id_seq'::regclass);


--
-- Name: creditos_movimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_movimiento ALTER COLUMN id SET DEFAULT nextval('public.creditos_movimiento_id_seq'::regclass);


--
-- Name: creditos_paquete id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_paquete ALTER COLUMN id SET DEFAULT nextval('public.creditos_paquete_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: BloqueosRecurso BloqueosRecurso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueosRecurso"
    ADD CONSTRAINT "BloqueosRecurso_pkey" PRIMARY KEY ("idBloqueo");


--
-- Name: ClienteUsuario ClienteUsuario_dni_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario"
    ADD CONSTRAINT "ClienteUsuario_dni_key" UNIQUE (dni);


--
-- Name: ClienteUsuario ClienteUsuario_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario"
    ADD CONSTRAINT "ClienteUsuario_email_key" UNIQUE (email);


--
-- Name: ClienteUsuario ClienteUsuario_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario"
    ADD CONSTRAINT "ClienteUsuario_google_id_key" UNIQUE (google_id);


--
-- Name: ClienteUsuario ClienteUsuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario"
    ADD CONSTRAINT "ClienteUsuario_pkey" PRIMARY KEY (id);


--
-- Name: Cliente Cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY ("DNI");


--
-- Name: DisponibilidadRecurso DisponibilidadRecurso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DisponibilidadRecurso"
    ADD CONSTRAINT "DisponibilidadRecurso_pkey" PRIMARY KEY ("idDisponibilidad");


--
-- Name: Empresa Empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Empresa"
    ADD CONSTRAINT "Empresa_pkey" PRIMARY KEY ("idEmpresa");


--
-- Name: Espacios Espacios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Espacios"
    ADD CONSTRAINT "Espacios_pkey" PRIMARY KEY ("Espacio");


--
-- Name: Pisos Pisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pisos"
    ADD CONSTRAINT "Pisos_pkey" PRIMARY KEY ("idPiso");


--
-- Name: RecursoBeneficioEstudiante RecursoBeneficioEstudiante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecursoBeneficioEstudiante"
    ADD CONSTRAINT "RecursoBeneficioEstudiante_pkey" PRIMARY KEY ("idRecurso");


--
-- Name: Recursos Recursos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Recursos"
    ADD CONSTRAINT "Recursos_pkey" PRIMARY KEY ("idRecurso");


--
-- Name: ReservaExtension ReservaExtension_idReserva_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaExtension"
    ADD CONSTRAINT "ReservaExtension_idReserva_key" UNIQUE ("idReserva");


--
-- Name: ReservaExtension ReservaExtension_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaExtension"
    ADD CONSTRAINT "ReservaExtension_pkey" PRIMARY KEY ("idExtension");


--
-- Name: ReservaSerie ReservaSerie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaSerie"
    ADD CONSTRAINT "ReservaSerie_pkey" PRIMARY KEY ("idSerie");


--
-- Name: Reservas Reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reservas"
    ADD CONSTRAINT "Reservas_pkey" PRIMARY KEY ("idReserva");


--
-- Name: TiposRecurso TiposRecurso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TiposRecurso"
    ADD CONSTRAINT "TiposRecurso_pkey" PRIMARY KEY (clave);


--
-- Name: TransaccionReserva TransaccionReserva_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransaccionReserva"
    ADD CONSTRAINT "TransaccionReserva_pkey" PRIMARY KEY ("idTransaccion", "idReserva");


--
-- Name: Transaccion Transaccion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaccion"
    ADD CONSTRAINT "Transaccion_pkey" PRIMARY KEY ("idTransaccion");


--
-- Name: creditos_compra creditos_compra_mp_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra
    ADD CONSTRAINT creditos_compra_mp_payment_id_key UNIQUE (mp_payment_id);


--
-- Name: creditos_compra creditos_compra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra
    ADD CONSTRAINT creditos_compra_pkey PRIMARY KEY (id);


--
-- Name: creditos_config creditos_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_config
    ADD CONSTRAINT creditos_config_pkey PRIMARY KEY (id);


--
-- Name: creditos_movimiento creditos_movimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_movimiento
    ADD CONSTRAINT creditos_movimiento_pkey PRIMARY KEY (id);


--
-- Name: creditos_paquete creditos_paquete_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_paquete
    ADD CONSTRAINT creditos_paquete_pkey PRIMARY KEY (id);


--
-- Name: creditos_saldo creditos_saldo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_saldo
    ADD CONSTRAINT creditos_saldo_pkey PRIMARY KEY (cliente_usuario_id);


--
-- Name: permisos permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permisos_pkey PRIMARY KEY (clave);


--
-- Name: usuario_permisos usuario_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permisos
    ADD CONSTRAINT usuario_permisos_pkey PRIMARY KEY (usuario_id, permiso_clave);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_beneficio_estudiante_habilitado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficio_estudiante_habilitado ON public."RecursoBeneficioEstudiante" USING btree ("idRecurso") WHERE (habilitado = true);


--
-- Name: idx_bloq_recurso_rango; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bloq_recurso_rango ON public."BloqueosRecurso" USING btree ("idRecurso", "FechaInicio", "FechaFin");


--
-- Name: idx_clienteusuario_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clienteusuario_email_lower ON public."ClienteUsuario" USING btree (lower(TRIM(BOTH FROM email)));


--
-- Name: idx_clienteusuario_estado_cuenta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clienteusuario_estado_cuenta ON public."ClienteUsuario" USING btree (estado_cuenta);


--
-- Name: idx_clienteusuario_rol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clienteusuario_rol ON public."ClienteUsuario" USING btree (rol);


--
-- Name: idx_clienteusuario_verif_estudiante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clienteusuario_verif_estudiante ON public."ClienteUsuario" USING btree (estado_verificacion_estudiante) WHERE ((estado_verificacion_estudiante)::text = 'pendiente'::text);


--
-- Name: idx_creditos_compra_acreditada_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_compra_acreditada_at ON public.creditos_compra USING btree (acreditada_at);


--
-- Name: idx_creditos_compra_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_compra_origen ON public.creditos_compra USING btree (origen);


--
-- Name: idx_creditos_compra_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_compra_usuario ON public.creditos_compra USING btree (cliente_usuario_id, created_at DESC);


--
-- Name: idx_creditos_movimiento_usuario_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_movimiento_usuario_fecha ON public.creditos_movimiento USING btree (cliente_usuario_id, created_at DESC);


--
-- Name: idx_creditos_paquete_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_paquete_activo ON public.creditos_paquete USING btree (activo) WHERE (activo = true);


--
-- Name: idx_disp_recurso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disp_recurso ON public."DisponibilidadRecurso" USING btree ("idRecurso", "DiaSemana");


--
-- Name: idx_espacios_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacios_orden ON public."Espacios" USING btree ("idPiso", "idEspacioPadre", "Orden");


--
-- Name: idx_espacios_padre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacios_padre ON public."Espacios" USING btree ("idEspacioPadre") WHERE ("Activo" = true);


--
-- Name: idx_espacios_piso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacios_piso ON public."Espacios" USING btree ("idPiso") WHERE ("Activo" = true);


--
-- Name: idx_pisos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pisos_orden ON public."Pisos" USING btree ("Orden") WHERE ("Activo" = true);


--
-- Name: idx_recursos_espacio_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recursos_espacio_activo ON public."Recursos" USING btree ("idEspacio") WHERE ("Activo" = true);


--
-- Name: idx_recursos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recursos_orden ON public."Recursos" USING btree ("idEspacio", "idRecursoPadre", "Orden");


--
-- Name: idx_recursos_padre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recursos_padre ON public."Recursos" USING btree ("idRecursoPadre");


--
-- Name: idx_reserva_extension_reserva; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reserva_extension_reserva ON public."ReservaExtension" USING btree ("idReserva");


--
-- Name: idx_reserva_serie_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reserva_serie_cliente ON public."ReservaSerie" USING btree ("DNI");


--
-- Name: idx_reserva_serie_recurso_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reserva_serie_recurso_periodo ON public."ReservaSerie" USING btree ("idRecurso", anio, mes);


--
-- Name: idx_reservas_en_curso_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_en_curso_dia ON public."Reservas" USING btree ("DiaReserva") WHERE (("Estado")::text = 'en_curso'::text);


--
-- Name: idx_reservas_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_grupo ON public."Reservas" USING btree ("idReservaGrupo") WHERE ("idReservaGrupo" IS NOT NULL);


--
-- Name: idx_reservas_idserie; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_idserie ON public."Reservas" USING btree ("idSerie") WHERE ("idSerie" IS NOT NULL);


--
-- Name: idx_transaccion_extension; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaccion_extension ON public."Transaccion" USING btree ("idExtension");


--
-- Name: idx_transaccion_reserva_reserva; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaccion_reserva_reserva ON public."TransaccionReserva" USING btree ("idReserva");


--
-- Name: Espacios trg_espacios_updatedat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_espacios_updatedat BEFORE UPDATE ON public."Espacios" FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updatedat();


--
-- Name: Pisos trg_pisos_updatedat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pisos_updatedat BEFORE UPDATE ON public."Pisos" FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updatedat();


--
-- Name: Recursos trg_recursos_updatedat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recursos_updatedat BEFORE UPDATE ON public."Recursos" FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updatedat();


--
-- Name: BloqueosRecurso BloqueosRecurso_creadoPor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueosRecurso"
    ADD CONSTRAINT "BloqueosRecurso_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: BloqueosRecurso BloqueosRecurso_idRecurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BloqueosRecurso"
    ADD CONSTRAINT "BloqueosRecurso_idRecurso_fkey" FOREIGN KEY ("idRecurso") REFERENCES public."Recursos"("idRecurso") ON DELETE CASCADE;


--
-- Name: ClienteUsuario ClienteUsuario_bloqueado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario"
    ADD CONSTRAINT "ClienteUsuario_bloqueado_por_usuario_id_fkey" FOREIGN KEY (bloqueado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: ClienteUsuario ClienteUsuario_resuelto_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClienteUsuario"
    ADD CONSTRAINT "ClienteUsuario_resuelto_por_usuario_id_fkey" FOREIGN KEY (resuelto_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: Cliente Cliente_idEmpresa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES public."Empresa"("idEmpresa") DEFERRABLE;


--
-- Name: Cliente Cliente_idEmpresa_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_idEmpresa_fkey1" FOREIGN KEY ("idEmpresa") REFERENCES public."Empresa"("idEmpresa") DEFERRABLE;


--
-- Name: DisponibilidadRecurso DisponibilidadRecurso_idRecurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DisponibilidadRecurso"
    ADD CONSTRAINT "DisponibilidadRecurso_idRecurso_fkey" FOREIGN KEY ("idRecurso") REFERENCES public."Recursos"("idRecurso") ON DELETE CASCADE;


--
-- Name: Espacios Espacios_idEspacioPadre_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Espacios"
    ADD CONSTRAINT "Espacios_idEspacioPadre_fkey" FOREIGN KEY ("idEspacioPadre") REFERENCES public."Espacios"("Espacio") ON DELETE SET NULL;


--
-- Name: Espacios Espacios_idPiso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Espacios"
    ADD CONSTRAINT "Espacios_idPiso_fkey" FOREIGN KEY ("idPiso") REFERENCES public."Pisos"("idPiso") ON DELETE SET NULL;


--
-- Name: RecursoBeneficioEstudiante RecursoBeneficioEstudiante_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecursoBeneficioEstudiante"
    ADD CONSTRAINT "RecursoBeneficioEstudiante_actualizado_por_fkey" FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: RecursoBeneficioEstudiante RecursoBeneficioEstudiante_idRecurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecursoBeneficioEstudiante"
    ADD CONSTRAINT "RecursoBeneficioEstudiante_idRecurso_fkey" FOREIGN KEY ("idRecurso") REFERENCES public."Recursos"("idRecurso") ON DELETE CASCADE;


--
-- Name: Recursos Recursos_idEspacio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Recursos"
    ADD CONSTRAINT "Recursos_idEspacio_fkey" FOREIGN KEY ("idEspacio") REFERENCES public."Espacios"("Espacio") DEFERRABLE;


--
-- Name: Recursos Recursos_idRecursoPadre_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Recursos"
    ADD CONSTRAINT "Recursos_idRecursoPadre_fkey" FOREIGN KEY ("idRecursoPadre") REFERENCES public."Recursos"("idRecurso") DEFERRABLE;


--
-- Name: ReservaExtension ReservaExtension_idReserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaExtension"
    ADD CONSTRAINT "ReservaExtension_idReserva_fkey" FOREIGN KEY ("idReserva") REFERENCES public."Reservas"("idReserva") ON DELETE CASCADE;


--
-- Name: ReservaSerie ReservaSerie_fk_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaSerie"
    ADD CONSTRAINT "ReservaSerie_fk_cliente" FOREIGN KEY ("DNI") REFERENCES public."Cliente"("DNI") DEFERRABLE;


--
-- Name: ReservaSerie ReservaSerie_idRecurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReservaSerie"
    ADD CONSTRAINT "ReservaSerie_idRecurso_fkey" FOREIGN KEY ("idRecurso") REFERENCES public."Recursos"("idRecurso") ON DELETE RESTRICT;


--
-- Name: Reservas Reservas_DNI_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reservas"
    ADD CONSTRAINT "Reservas_DNI_fkey" FOREIGN KEY ("DNI") REFERENCES public."Cliente"("DNI") DEFERRABLE;


--
-- Name: Reservas Reservas_DNI_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reservas"
    ADD CONSTRAINT "Reservas_DNI_fkey1" FOREIGN KEY ("DNI") REFERENCES public."Cliente"("DNI") DEFERRABLE;


--
-- Name: Reservas Reservas_fk_serie; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reservas"
    ADD CONSTRAINT "Reservas_fk_serie" FOREIGN KEY ("idSerie") REFERENCES public."ReservaSerie"("idSerie") ON DELETE SET NULL;


--
-- Name: Reservas Reservas_idRecurso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reservas"
    ADD CONSTRAINT "Reservas_idRecurso_fkey" FOREIGN KEY ("idRecurso") REFERENCES public."Recursos"("idRecurso") DEFERRABLE;


--
-- Name: TransaccionReserva TransaccionReserva_idReserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransaccionReserva"
    ADD CONSTRAINT "TransaccionReserva_idReserva_fkey" FOREIGN KEY ("idReserva") REFERENCES public."Reservas"("idReserva") ON DELETE CASCADE;


--
-- Name: TransaccionReserva TransaccionReserva_idTransaccion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransaccionReserva"
    ADD CONSTRAINT "TransaccionReserva_idTransaccion_fkey" FOREIGN KEY ("idTransaccion") REFERENCES public."Transaccion"("idTransaccion") ON DELETE CASCADE;


--
-- Name: Transaccion Transaccion_idExtension_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaccion"
    ADD CONSTRAINT "Transaccion_idExtension_fkey" FOREIGN KEY ("idExtension") REFERENCES public."ReservaExtension"("idExtension") ON DELETE SET NULL;


--
-- Name: Transaccion Transaccion_idReserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaccion"
    ADD CONSTRAINT "Transaccion_idReserva_fkey" FOREIGN KEY ("idReserva") REFERENCES public."Reservas"("idReserva") DEFERRABLE;


--
-- Name: Transaccion Transaccion_idReserva_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaccion"
    ADD CONSTRAINT "Transaccion_idReserva_fkey1" FOREIGN KEY ("idReserva") REFERENCES public."Reservas"("idReserva") DEFERRABLE;


--
-- Name: creditos_compra creditos_compra_anulada_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra
    ADD CONSTRAINT creditos_compra_anulada_por_usuario_id_fkey FOREIGN KEY (anulada_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: creditos_compra creditos_compra_cliente_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra
    ADD CONSTRAINT creditos_compra_cliente_usuario_id_fkey FOREIGN KEY (cliente_usuario_id) REFERENCES public."ClienteUsuario"(id) ON DELETE CASCADE;


--
-- Name: creditos_compra creditos_compra_paquete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra
    ADD CONSTRAINT creditos_compra_paquete_id_fkey FOREIGN KEY (paquete_id) REFERENCES public.creditos_paquete(id) ON DELETE SET NULL;


--
-- Name: creditos_compra creditos_compra_registrada_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_compra
    ADD CONSTRAINT creditos_compra_registrada_por_usuario_id_fkey FOREIGN KEY (registrada_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: creditos_movimiento creditos_movimiento_admin_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_movimiento
    ADD CONSTRAINT creditos_movimiento_admin_usuario_id_fkey FOREIGN KEY (admin_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: creditos_movimiento creditos_movimiento_cliente_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_movimiento
    ADD CONSTRAINT creditos_movimiento_cliente_usuario_id_fkey FOREIGN KEY (cliente_usuario_id) REFERENCES public."ClienteUsuario"(id) ON DELETE CASCADE;


--
-- Name: creditos_movimiento creditos_movimiento_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_movimiento
    ADD CONSTRAINT creditos_movimiento_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES public.creditos_compra(id) ON DELETE SET NULL;


--
-- Name: creditos_movimiento creditos_movimiento_id_reserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_movimiento
    ADD CONSTRAINT creditos_movimiento_id_reserva_fkey FOREIGN KEY (id_reserva) REFERENCES public."Reservas"("idReserva") ON DELETE SET NULL;


--
-- Name: creditos_saldo creditos_saldo_cliente_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos_saldo
    ADD CONSTRAINT creditos_saldo_cliente_usuario_id_fkey FOREIGN KEY (cliente_usuario_id) REFERENCES public."ClienteUsuario"(id) ON DELETE CASCADE;


--
-- Name: usuario_permisos usuario_permisos_permiso_clave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permisos
    ADD CONSTRAINT usuario_permisos_permiso_clave_fkey FOREIGN KEY (permiso_clave) REFERENCES public.permisos(clave) ON DELETE CASCADE;


--
-- Name: usuario_permisos usuario_permisos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permisos
    ADD CONSTRAINT usuario_permisos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


