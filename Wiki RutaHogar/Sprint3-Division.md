# División del Sprint 3 — RutaHogar

**Objetivo del sprint:** consolidar la página como una aplicación real, utilizable tanto por el usuario como por el cliente.

**Total:** 57 SP · 11 historias · 6 integrantes.

> Con los SP definidos, 57 − 8 = 49 SP no se reparten en partes iguales entre cinco personas (ninguna
> combinación de historias de 5, 8 y 3 SP suma 9). El reparto más parejo que respeta los hilos
> conductores es **11 · 10 · 10 · 10 · 8 + una persona con 8**.

---

## Integrantes e historias por hilo conductor

| Integrante | Hilo conductor | Historias | SP |
| :-- | :-- | :-- | :-: |
| **Isaías** | **Veracidad del dato del lead**: lo declarado por el lead y su co-deudor queda respaldado y confirmado | HU 23 Documentos respaldatorios y validación asistida (8) · HU 30 Participación y consentimiento de co-deudor (3) | **11** |
| **Benjamín** | **Gobierno de la inmobiliaria**: el administrador configura su organización y cómo prioriza | HU 21 Configuración comercial y priorización por inmobiliaria (5) · HU 28 Gestión de equipo de la inmobiliaria (5) | **10** |
| **Mauro** | **Catálogo de proyectos**: lo que entra al catálogo y cómo rinde | HU 25 Carga masiva de proyectos mediante archivo (5) · HU 26 Métricas de interés por proyecto (5) | **10** |
| **Andrés** | **Seguridad y trazabilidad**: quién entra a la plataforma y qué información sale | HU 27 Gestión profesional de acceso y cuentas (5) · HU 22 Centro de exportación de información y dossier (5) | **10** |
| **Rodrigo** | **Camino de compra del lead**: ahorrar para el pie y aprovechar oportunidades | HU 29 Planificador de metas de ahorro en verde/blanco (5) · HU 31 Radar de oportunidades y alertas (3) | **8** |
| **Claudio** | **Soporte transversal**: ayuda para todos los roles | HU 24 Asistente virtual y sistema de tickets (8) | **8** |

**Por qué cada agrupación:**

- **Isaías:** HU 23 y HU 30 resuelven lo mismo: que la evaluación se apoye en datos confirmados (por documento o por el propio co-deudor) y no solo en lo que el lead supuso. Ambas muestran al ejecutivo qué está respaldado y qué no. Le da continuidad a HU 18.
- **Benjamín:** HU 28 define qué ejecutivos y proyectos tiene la inmobiliaria; HU 21, cómo se priorizan los leads entre ellos. Comparten la configuración del administrador y el historial de cambios.
- **Mauro:** Ambas trabajan sobre las mismas tablas de proyectos: HU 25 alimenta el catálogo y HU 26 lo mide contra la demanda.
- **Andrés:** Ambas se basan en permisos por rol y registro de auditoría: una controla el acceso a la plataforma y la otra la salida de datos.
- **Rodrigo:** Ambas son del lead y giran en torno a favoritos, UF y metas. HU 29 se conecta con el seguimiento de HU 13, y HU 31 recalcula la compatibilidad.
- **Claudio:** Es la historia de 8 SP que queda sola. Es transversal a todos los roles y funciona como bloque propio.

---

## Funcionalidades que se repetirían

Si nadie coordina, se estima que **un 15–20 % del esfuerzo del sprint (≈ 9–11 SP)** corre riesgo de duplicarse o de chocar en archivos. Es una estimación hecha contra el código actual, sin diseño técnico de las historias.

| Pieza nueva | La necesitan | Riesgo | Qué existe hoy |
| :-- | :-- | :-: | :-- |
| **Bitácora de auditoría** ("quién, cuándo, qué cambió") | Benjamín (HU 21, HU 28) · Andrés (HU 22, HU 27) · Isaías (HU 23) | 🔴 Alto | Solo auditorías puntuales (`corrective_audit`, historial de HU 13). No hay una tabla genérica |
| **Correos transaccionales** | Benjamín (invitación, HU 28) · Andrés (verificación y recuperación, HU 27) · Claudio (ticket al admin, HU 24) · Rodrigo (alertas, HU 31, opcional) | 🔴 Alto | `ResendEmailClient` en `backend/app/lead_changes/email.py`, amarrado a eventos del lead |
| **Subida y lectura de archivos** | Isaías (documentos, HU 23) · Mauro (CSV/Excel, HU 25) | 🟠 Medio | No existe. No hay librerías de CSV/Excel/PDF en el proyecto |
| **Generación de CSV/Excel** | Andrés (HU 22) · Mauro (plantilla descargable, HU 25) | 🟠 Medio | No existe |
| **Eventos de interés por proyecto** (vistas, favoritos, simulaciones) | Mauro (HU 26 los cuenta) · Rodrigo (HU 31 usa favoritos y cambios de precio) | 🟠 Medio | Existen favoritos (`favoritesService.js`), pero no se registran vistas ni simulaciones |
| **Detección de cambios en proyectos** | Mauro (HU 25 actualiza el catálogo en masa) · Rodrigo (HU 31 debe reaccionar a esa actualización) | 🟠 Medio | `lead_changes/service.py` ya tiene `_project_compatible_event`; HU 31 debe extenderlo, no rehacerlo |
| **Estado de cuenta activa/desactivada** | Benjamín (HU 28 desactiva ejecutivos) · Andrés (HU 27 bloquea el acceso de cuentas deshabilitadas) | 🟠 Medio | Es la misma columna vista desde dos lados |
| **Llamadas a IA (Groq)** | Claudio (asistente, HU 24) | 🟢 Bajo | `_ask_groq` en `backend/app/ai.py` ya sirve; HU 24 solo debe no duplicarlo |

---

## Archivos que tocarán varios integrantes

| Archivo | Integrantes | Riesgo de conflicto |
| :-- | :-- | :-: |
| `frontend/src/App.jsx` (≈ 2.600 líneas, ruteo por estado) | **Todos**: cada uno agrega páginas | 🔴 |
| `frontend/src/components/DashboardLeads.jsx` (≈ 1.000 líneas) | Isaías (badge y filtro de co-deudor) · Benjamín (orden según la configuración comercial) · Andrés (exportar respetando filtros) | 🔴 Los tres tocan el mismo bloque de filtros y orden |
| `frontend/src/components/Navbar.jsx` | Benjamín, Mauro, Andrés, Claudio (e Isaías si los documentos van en página aparte) | 🟠 |
| `frontend/src/components/LeadDetailModal.jsx` (≈ 1.000 líneas) | Isaías (respaldos y desglose del co-deudor) · Andrés (botón de dossier) | 🟠 |
| `frontend/src/components/AdminPanel.jsx` / `AdminHome.jsx` | Benjamín, Mauro, Claudio (bandeja de tickets) | 🟠 |
| `frontend/src/components/AdminProjectCatalog.jsx` / `services/projectService.js` | Mauro (carga masiva) · Rodrigo (dispara las alertas de precio) · Benjamín (asignar proyectos a ejecutivos) | 🟠 |
| `supabase/migrations/` | Todos | 🟠 Ya hubo migraciones con el mismo timestamp (`20261003120000`, `20261005150000`) |
| `backend/app/main.py` | Todos los que agreguen endpoints | 🟢 Basta con `include_router` separados |

---

## Cruces entre integrantes

| | Isaías | Benjamín | Mauro | Andrés | Rodrigo | Claudio |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: |
| **Isaías** Veracidad (23 + 30) | — | 🟠 Dashboard | 🟠 Archivos | 🔴 El dossier usa los respaldos | · | · |
| **Benjamín** Gobierno (21 + 28) | | — | 🟢 Proyectos asignados | 🔴 Auditoría, correo, cuentas | · | 🟢 Correo |
| **Mauro** Catálogo (25 + 26) | | | — | 🟠 CSV/Excel | 🔴 Eventos y cambios de precio | · |
| **Andrés** Seguridad (27 + 22) | | | | — | · | 🟠 Correo |
| **Rodrigo** Compra (29 + 31) | | | | | — | · |
| **Claudio** Soporte (24) | | | | | | — |

**Los tres cruces más fuertes:**

- **Benjamín ↔ Andrés:** auditoría, correos y estado de las cuentas.
- **Mauro ↔ Rodrigo:** la actualización del catálogo de HU 25 es lo que debe activar las alertas de HU 31.
- **Isaías ↔ Andrés:** el dossier de HU 22 debe mostrar qué datos están respaldados según HU 23, así que Andrés depende del modelo de datos de Isaías.

**Rodrigo** tiene el grupo más aislado: se apoya en lo que ya existe (`HousingSavingsPlan.jsx`, `lead_changes`) y solo cruza con Mauro. **Claudio** también queda bastante aislado.
