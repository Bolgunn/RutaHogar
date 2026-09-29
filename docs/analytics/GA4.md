# Google Analytics 4 (GA4)

RutaHogar usa la propiedad con Measurement ID `G-63DF940J4K`. La carga global
queda en `frontend/index.html` y el código de aplicación utiliza
`frontend/src/lib/analytics.js` para que los eventos tengan un esquema seguro
y consistente.

## Eventos instrumentados

| Evento | Tipo GA4 | Cuándo se envía | Parámetros permitidos |
| --- | --- | --- | --- |
| `page_view` | Automático controlado manualmente | Al llegar a una ruta SPA final y normalizada | `page_path`, `page_location`, `page_title` |
| `cta_click` | Custom | CTA principal de landing: navegación, hero, tarjeta de score y CTA final | `cta_location`, `cta_name`, `destination`, `auth_state` |
| `prequalification_started` | Custom | Primera interacción o avance del intento de precalificación | `flow_type`, `entry_point`, `form_step` |
| `prequalification_completed` | Custom | Respuesta exitosa de `/score` antes de mostrar el resultado | `flow_type`, `entry_point`, `has_complementary_income` |
| `sign_up` | Recomendado por GA4 | Creación de cuenta exitosa | `method` |
| `generate_lead` | Recomendado por GA4 | `POST /interest` exitoso desde un proyecto compatible | `lead_source`, `project_id`, `project_region`, `source_page` |
| `project_compatibility_viewed` | Custom | Apertura del modal de compatibilidad de un proyecto | `project_id`, `project_type`, `project_region`, `source_page` |
| `financing_scenario_saved` | Custom | Guardado exitoso de un escenario de financiamiento | `project_id`, `has_benefit`, `scenario_source` |

`financing_scenario_saved` está preparado en el helper. Esta rama no contiene
aún `FinancingSimulatorPanel` ni un flujo que guarde escenarios, por lo que no
se puede disparar hasta que esa funcionalidad exista en la rama.

## Key events

Configurar manualmente como **Key events** en GA4:

- `prequalification_completed`
- `sign_up`
- `generate_lead`

## Page views en SPA

El snippet usa `send_page_view: false`. `App.jsx` envía el page view solamente
después de que la ruta se normaliza y guarda el último `page_path` para evitar
duplicados por renderizados, `pushState`, `replaceState` o `popstate`.

En GA4 se debe desactivar **Enhanced measurement > Page changes based on
browser history events**. Mantener esa opción activa junto al page view manual
duplicaría las vistas.

## Privacidad

El helper mantiene una allowlist por evento. No se envían correos, teléfonos,
RUT, nombres, IDs de usuario, fechas de nacimiento, mensajes, montos de
ingreso/deuda/ahorro/pie/crédito/dividendo/subsidio, UF, tasas, score ni
clasificaciones financieras. En `page_location` solo se conservan UTMs; se
descartan otros parámetros y cualquier hash.

## Validación

Para validar en un ambiente de prueba, abrir GA4 **Admin > DebugView** o el
reporte **Realtime**, navegar por la aplicación y comprobar que aparezcan los
eventos anteriores una sola vez por acción. Nunca incluir datos reales de una
persona en la prueba.

Para atribuir campañas, usar enlaces con UTMs, por ejemplo:

```text
https://ruta-hogar-one.vercel.app/?utm_source=instagram&utm_medium=social&utm_campaign=primera_vivienda&utm_content=video_a
```

Los campos a normalizar en el Reporte de Marketing son `utm_source`,
`utm_medium`, `utm_campaign` y, cuando corresponda, `utm_content`.
