# Atributos de calidad (RNF) — RutaHogar

Los requisitos no funcionales de RutaHogar. Cada atributo tiene una meta SMART y un mecanismo de
verificación; cada uno apunta a las páginas de [[RNF/RNF1-seguridad-basica|RNF]] que lo hacen
exigible con criterios concretos.

> Esta página es el **índice** de la carpeta `RNF/`. Los atributos definen la meta; las páginas
> RNF definen cómo se verifica.

---

## Atributos

| Atributo | Meta SMART | Mecanismo de verificación |
| :------- | :--------- | :------------------------ |
| **Facilidad de uso** | Al menos el 80% de los usuarios completa el formulario sin ayuda en menos de 10 minutos. | Pruebas con usuarios que buscan su primera vivienda, midiendo tiempo promedio, completitud, cantidad de errores y abandono. |
| **Tiempo de respuesta** | Las operaciones de la página responden en 60 segundos o menos en promedio. | Herramientas de depuración y pruebas (asserts) que ejecutan operaciones e imprimen el tiempo promedio, medido con un temporizador iniciado al comienzo de la operación. |
| **Seguridad** | El sistema no debe solicitar credenciales bancarias ni documentos sensibles sin antes usar mecanismos de seguridad como HTTPS y control de acceso de dos factores. | Revisión del formulario, checklist de seguridad y validación de la configuración de despliegue. |
| **Privacidad de datos** | El sistema recoge solo los datos mínimos necesarios (ingresos, deuda, ahorro, duración del contrato). | Revisión del modelo de datos y verificación de que no se almacenan campos innecesarios. |
| **Escalabilidad** | El sistema soporta más de 2.000 evaluaciones o consultas concurrentes. | Prueba de carga simulada de registros en Supabase. |
| **Disponibilidad** | El sistema está disponible al menos el 95% del tiempo. | Monitoreo del servicio desplegado, registrando y notificando las caídas. |
| **Mantenibilidad** | El código está organizado en módulos separados: frontend, backend y reglas de scoring. | Revisión periódica del repositorio y de la estructura del proyecto. |
| **Trazabilidad** | Cada evaluación guarda la fecha, el score obtenido y la clasificación generada. | Vista o consulta directa sobre la base de datos para verificar la persistencia correcta. |

---

## Dónde se hacen exigibles

| Atributo | Páginas RNF | Historias relacionadas |
| :------- | :---------- | :--------------------- |
| Facilidad de uso | [[RNF/RNF6-experiencia-movil-lead\|RNF 6]], [[RNF/RNF7-dashboard-movil-ejecutivo\|RNF 7]] | [[UserStories/HU1-ingreso-datos-financieros\|HU 1]] |
| Tiempo de respuesta | [[RNF/RNF8-disponibilidad-escalabilidad\|RNF 8]] | [[UserStories/HU3-scoring-hibrido\|HU 3]] (E1 — 60 s), [[UserStories/HU6-simulacion-compatibilidad\|HU 6]] (E4 — 30 s) |
| Seguridad | [[RNF/RNF1-seguridad-basica\|RNF 1]], [[RNF/RNF3-roles-y-permisos\|RNF 3]], [[RNF/RNF9-manejo-seguro-errores\|RNF 9]], [[RNF/RNF10-validacion-entradas\|RNF 10]] | [[Riesgos\|Riesgos técnicos]] |
| Privacidad de datos | [[RNF/RNF2-privacidad-minima\|RNF 2]] | [[UserStories/HU1-ingreso-datos-financieros\|HU 1]] (E3 — consentimiento) |
| Escalabilidad | [[RNF/RNF8-disponibilidad-escalabilidad\|RNF 8]] | — |
| Disponibilidad | [[RNF/RNF8-disponibilidad-escalabilidad\|RNF 8]] | — |
| Mantenibilidad | — | [[deuda-tecnica\|Deuda técnica]], estructura de módulos del repositorio |
| Trazabilidad | [[RNF/RNF4-auditoria-tecnica\|RNF 4]], [[RNF/RNF5-historial-inmutable\|RNF 5]] | [[UserStories/HU3-scoring-hibrido\|HU 3]] (E5), [[Database/evaluations\|evaluations]] |

---

## Índice de la carpeta RNF

| RNF | Página | Atributo |
| :-- | :----- | :------- |
| RNF 1 | [[RNF/RNF1-seguridad-basica\|Seguridad básica del sistema]] | Seguridad |
| RNF 2 | [[RNF/RNF2-privacidad-minima\|Privacidad mínima y gestión de datos personales]] | Privacidad de datos |
| RNF 3 | [[RNF/RNF3-roles-y-permisos\|Roles y permisos]] | Seguridad |
| RNF 4 | [[RNF/RNF4-auditoria-tecnica\|Auditoría técnica y registro de eventos]] | Trazabilidad |
| RNF 5 | [[RNF/RNF5-historial-inmutable\|Historial de evaluaciones inmutable y versionado]] | Trazabilidad |
| RNF 6 | [[RNF/RNF6-experiencia-movil-lead\|Experiencia móvil del lead]] | Facilidad de uso |
| RNF 7 | [[RNF/RNF7-dashboard-movil-ejecutivo\|Dashboard móvil del ejecutivo]] | Facilidad de uso |
| RNF 8 | [[RNF/RNF8-disponibilidad-escalabilidad\|Disponibilidad y escalabilidad]] | Disponibilidad / Escalabilidad |
| RNF 9 | [[RNF/RNF9-manejo-seguro-errores\|Manejo seguro de errores]] | Seguridad |
| RNF 10 | [[RNF/RNF10-validacion-entradas\|Validación de entradas]] | Seguridad |

---

## Relación con las salvaguardas del handbook

Las salvaguardas de `docs/HANDBOOK.md` no son negociables y no se resuelven en un grill. Varias se
verifican a través de estos RNF:

| Salvaguarda | RNF que la hace exigible |
| :---------- | :----------------------- |
| S5 — Datos financieros bajo consentimiento explícito | [[RNF/RNF2-privacidad-minima\|RNF 2]], [[RNF/RNF4-auditoria-tecnica\|RNF 4]] (E5) |
| S6 — Leads acotados a su inmobiliaria (RLS) | [[RNF/RNF3-roles-y-permisos\|RNF 3]] |
| S8 — Sin credenciales en el código ni documentos sensibles almacenados | [[RNF/RNF1-seguridad-basica\|RNF 1]] |
