# Estados: reserva vs pago

Son dos conceptos distintos; no se deben mezclar en un solo campo.

## Reserva (`"Reservas"."Estado"`)

Ciclo operativo del turno o contrato:

| Valor        | Uso típico |
|-------------|------------|
| `activa`    | Reserva vigente (futura o del día). |
| `completada`| Cierre operativo (ej. asistencia registrada en **Altas**), no significa “cobrada”. |
| `cancelada` | Anulada. |
| `no_asistio`| Marcado en recepción. |

El cobro online o presencial **no** cambia automáticamente este estado.

## Pago (`"Transaccion"."EstadoPago"`)

Estado del cobro asociado a una reserva:

| Valor       | Significado |
|------------|-------------|
| `Pagado`   | Cobro acreditado (MP `approved` o registro presencial). |
| `Pendiente`| En curso o esperando confirmación. |
| `Rechazado`| Rechazado / cancelado en pasarela. |

La UI de **Gestión financiera** y el perfil del cliente deben leer `EstadoPago` para saber si está pagado; el estado de la reserva indica asistencia / ciclo de vida del turno.

### Etiquetas en el frontend (referencia)

| Valor en BD (`Reservas.Estado`) | Texto mostrado |
|--------------------------------|----------------|
| `activa` | Activa |
| `completada` | Cerrada — asistió |
| `no_asistio` | No asistió |
| `cancelada` | Cancelada |

En **Consultar reservas** la columna se llama **Estado del turno**; en **Gestión financiera** la columna de la transacción es **Estado de pago**.

## Webhook Mercado Pago

Tras validar la firma (`MP_WEBHOOK_SECRET`), el webhook actualiza solo `"Transaccion"`. La confirmación del recurso se hace siempre con `GET /v1/payments/:id` (no confiar solo en el cuerpo del POST).
