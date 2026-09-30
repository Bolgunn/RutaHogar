# HU 19 - Portal Inmobiliario Inteligente (RAG)

> **🗓 Planificada - Sprint 2.** Búsqueda de vivienda en lenguaje natural sobre propiedades reales, resuelta por similitud vectorial, con un llamado a la acción que devuelve al lead a RutaHogar a evaluar si califica.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 8 |
| **Actor** | Lead |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** lead, **quiero** buscar opciones de vivienda utilizando descripciones naturales (ej. "departamento con vista al atardecer, cocina integrada, cerca del metro"), **para** encontrar propiedades reales que se ajusten a mis gustos sin depender de filtros rígidos y descubrir si califico financieramente para ellas en RutaHogar.

---

## Criterios de aceptación

### E1

**Dado** que existen propiedades reales extraídas en la base de datos, **cuando** el usuario realice una búsqueda con lenguaje natural, **entonces** el sistema debe buscar mediante vectores y retornar las propiedades semánticamente más relevantes.

### E2

**Dado** que el sistema retorna resultados de búsqueda, **cuando** el usuario visualice las propiedades, **entonces** cada tarjeta debe incluir un llamado a la acción (CTA) para redirigirlo a RutaHogar a evaluar su crédito.

### E3

**Dado** que el usuario está revisando una propiedad en los resultados, **cuando** seleccione una propiedad que le interesa, **entonces** el sistema debe mostrar un llamado a la acción (CTA) claro que lo invite a evaluar su compatibilidad financiera para esa propiedad en RutaHogar (ej. "Ver si califico para este departamento").

### E4

**Dado** que el catálogo de propiedades puede no estar actualizado en tiempo real, **cuando** el usuario revise los resultados de búsqueda, **entonces** el sistema debe indicar de forma visible que la información es referencial y que los detalles definitivos (disponibilidad, precio exacto, condiciones) deben verificarse en el portal inmobiliario de origen.

### E5

**Dado** que el usuario realiza una búsqueda muy específica o con pocos resultados, **cuando** el sistema no encuentre propiedades que coincidan, **entonces** debe mostrar un mensaje claro indicando que no hay resultados y, si es posible, sugerir ampliar o modificar su descripción (ej. "Prueba buscando con menos restricciones o cambiando la comuna").

---

## Notas

- Historia **nueva**: no tiene antecedente en el backlog anterior ni página previa en este wiki.
  Entra completa desde el documento del equipo.
- **Es la única historia del backlog con cinco criterios.** El resto del Sprint 2 tiene cuatro.
- **Introduce dos capacidades que hoy no existen en la plataforma:** almacenamiento vectorial con
  búsqueda por similitud, y un origen de propiedades **externo** al catálogo de proyectos de
  [[HU7-catalogo-de-proyectos|HU 7]]. El catálogo actual lo cargan las inmobiliarias; aquí las
  propiedades vienen "extraídas", que es una fuente distinta con dueño distinto.
- **Frontera con el alcance vigente.** El handbook deja fuera la integración con APIs externas sin
  encargo explícito. De dónde salen las propiedades reales, con qué permiso y con qué frecuencia se
  refrescan es una decisión que precede a la estimación, no una consecuencia de ella. **Conviene
  grillarla antes de planificar.**
- **E4 es la salvaguarda de honestidad del dato.** Si la fuente no es en tiempo real, el aviso de
  referencialidad no es una nota al pie: es lo que impide que la plataforma afirme disponibilidad y
  precio que no puede sostener. Misma lógica que las advertencias de
  [[HU9-cotizacion-orientativa|HU 9]] y [[HU26-simulacion-subsidios|HU 26]].
- **E2 y E3 son el puente comercial de la historia.** El valor para RutaHogar no está en la búsqueda
  sino en el retorno: la propiedad encontrada se convierte en objetivo de evaluación.
- La IA aquí **recupera y ordena**, no evalúa. Si califica o no lo decide el motor de reglas, igual
  que en [[HU3-scoring-hibrido|HU 3]].

---

## Estado frente al código

Historia nueva, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No existe almacenamiento vectorial ni búsqueda semántica en `backend/app`. |
| `E2` | ❌ | Sin superficie de resultados de propiedades externas. |
| `E3` | ❌ | Sin CTA de evaluación por propiedad. |
| `E4` | ❌ | Sin origen externo declarado y por tanto sin aviso de referencialidad. |
| `E5` | ❌ | Sin ruta de búsqueda que pueda quedar vacía. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
