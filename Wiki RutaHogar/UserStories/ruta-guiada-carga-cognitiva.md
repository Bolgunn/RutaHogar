# Ruta guiada: un siguiente paso a la vez

> **🗓 Planificada - Sprint 3 · sin número de HU asignado.** El lead deja de ver nueve secciones
> con el mismo peso y pasa a ver una ruta de tres etapas, la etapa en la que está y **una sola
> acción recomendada**, calculada desde su última evaluación.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Esencial |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** lead que quiere comprar una vivienda y no sabe por dónde empezar, **quiero** que la
> plataforma me muestre en qué etapa estoy y cuál es mi siguiente paso, **para** avanzar sin tener
> que entender de una vez todo lo que implica obtener una vivienda.

---

## Criterios de aceptación

### E1 - Navegación organizada por etapas

**Dado** que un lead navega la plataforma, en escritorio o en el menú lateral móvil, **cuando** vea
el menú, **entonces** las secciones deben aparecer agrupadas bajo las tres etapas de la ruta, con
Inicio arriba sin grupo y Academia en un grupo transversal al final:

| Grupo | Secciones |
| :---- | :-------- |
| *(sin grupo)* | Inicio |
| **1 · Conoce tu situación** | Precalificación, Resultados |
| **2 · Prepara tu siguiente paso** | Plan de mejora, Subsidios |
| **3 · Explora tus alternativas** | Proyectos, Simulación, Portal |
| **Aprende** | Academia |

y la etapa en la que está el lead según E2 debe estar **destacada visualmente** ("estás aquí").
Ninguna sección se oculta ni cambia de ruta.

> **Valor:** el menú cuenta la misma historia que el Inicio. Hoy las nueve entradas cuelgan de un
> único grupo "Principal" y el lead no tiene forma de saber cuál importa ahora.

### E2 - Un único siguiente paso, calculado desde la evaluación

**Dado** que un lead entra a Inicio, **cuando** se calcule su siguiente paso, **entonces** el
sistema debe aplicar en orden la siguiente tabla — **gana la primera regla que se cumple** — y
la misma regla debe definir la etapa destacada en E1:

| # | Condición | Siguiente paso | Etapa |
| :-: | :-------- | :------------- | :---: |
| 1 | Sin evaluación | Comenzar precalificación | 1 |
| 2 | Con evaluación, pero aún no abrió Resultados | Entender mi resultado | 1 |
| 3 | Bloqueador crítico activo (p. ej., morosidad) | Plan de mejora, enfocado en ese bloqueador | 2 |
| 4 | Clasificación **Bajo** | Plan de mejora | 2 |
| 5 | **Medio** y la brecha principal es ahorro o pie | Subsidios | 2 |
| 6 | **Medio** (resto de los casos) | Plan de mejora | 2 |
| 7 | **Alto** | Ver proyectos compatibles | 3 |

El texto del siguiente paso debe nombrar **el motivo concreto** que lo origina (p. ej., *"Te faltan
$X de pie: revisa si calificas a un subsidio"*) y no un mensaje genérico.

> **Valor:** responde directamente a *"no sé qué hacer con tanta información"*. Cada visita
> entrega una sola cosa que hacer, y el porqué. La regla 2 evita que el lead salte de su score al
> plan sin entender su resultado, que es justamente donde se produce la sobrecarga.

### E3 - Inicio con una sola acción principal

**Dado** que un lead con evaluación entra a Inicio, **cuando** cargue la pantalla, **entonces**:

1. el siguiente paso de E2 debe aparecer primero y ser **el único botón primario visible**;
2. la situación se resume en una línea — score, clasificación y brecha principal —, con el detalle
   disponible en *"Entender mi resultado"*;
3. los cambios de [[HU20-retorno-por-cambio|HU 20]] aparecen **colapsados** con su cantidad
   (*"Tienes 2 novedades"*) y se expanden a demanda;
4. *"Actualizar un dato"* aparece como enlace secundario, no como sección.

**Excepción:** si el lead llega desde una notificación de [[HU20-retorno-por-cambio|HU 20]], ese
cambio debe aparecer primero y expandido, con el siguiente paso inmediatamente debajo.

> **Valor:** lo visible sin scroll se reduce a una pregunta — *¿qué hago ahora?* — sin romper el
> aterrizaje en el delta que exige [[HU20-retorno-por-cambio|HU 20]] E3.

### E4 - Ninguna sección es un callejón sin salida

**Dado** que un lead está en una sección de la ruta, **cuando** la vea, **entonces** debe mostrar
arriba **la etapa a la que pertenece** (p. ej., *"Etapa 2 · Prepara tu siguiente paso"*) y abajo
**un único "¿Y ahora qué?"** que lo lleve a su siguiente paso según E2 o, si ya está en él, a la
siguiente sección de la misma etapa. El contenido interno de cada sección no se rediseña en esta
historia.

> **Valor:** extiende la ruta a toda la sesión, no solo al Inicio. El lead siempre sabe dónde está
> y cómo seguir, entre en la sección que entre.

### E5 - Validación con usuarios

**Dado** que la ruta guiada está implementada, **cuando** se realice una prueba de usabilidad
moderada con **al menos 5 personas que no conozcan la plataforma** — idealmente incluyendo a alguien
del cliente —, sobre la versión anterior y la nueva, con las tareas:

1. *"Acabas de registrarte. ¿Qué harías primero?"*
2. *"Ya tienes tu resultado. ¿Qué te recomienda la plataforma hacer ahora y por qué?"*
3. *"Quieres ver qué viviendas podrías comprar. Encuéntralas."*

**entonces** al menos **4 de 5** deben completar las tres tareas sin ayuda, y la dificultad
percibida promedio (SEQ, escala 1–7) debe **mejorar respecto de la versión anterior**. Por tarea se
registran completitud, clics y SEQ, y el resultado queda en `informes_entregas`.

> **Valor:** el feedback vino del cliente, de usuarios en la demo y de los profesores. La
> respuesta en la próxima review tiene que ser evidencia, no *"lo simplificamos"*.

---

## Por qué existe esta historia

En la sprint review, el cliente, usuarios que vieron la demo y los profesores coincidieron en que
**la carga cognitiva de entrar a la plataforma es muy alta**: hay demasiada información sobre todo
lo que implica obtener una vivienda, y toda aparece al mismo tiempo.

El código confirma el diagnóstico:

- **Nueve secciones con el mismo peso.** El menú del lead lista Inicio, Precalificación,
  Resultados, Subsidios, Plan de mejora, Academia, Simulación, Portal y Proyectos bajo un único grupo
  "Principal" (`frontend/src/components/Navbar.jsx:8-17`).
- **La ruta ya existe, pero solo en una pantalla.** El Inicio sin evaluación plantea tres etapas —
  *Conoce tu situación*, *Prepara tu siguiente paso*, *Explora tus alternativas*
  (`frontend/src/components/UserHomeOverview.jsx:14-18`) — que ni el menú ni las demás secciones
  respetan. Esta historia extiende ese modelo mental a toda la plataforma en vez de inventar uno
  nuevo.
- **El siguiente paso es fijo.** Con evaluación, el Inicio siempre envía a "Plan de mejora"
  (`UserHomeOverview.jsx:45`), aunque el lead tenga score Alto y lo que le corresponda sea explorar
  proyectos.
- **El Inicio apila tres bloques de igual peso:** situación, línea de tiempo de cambios de
  [[HU20-retorno-por-cambio|HU 20]] y *"¿Cambió algo en tus datos?"* (`frontend/src/App.jsx:2330-2360`).

---

## Notas

- **No toca backend.** E2 se calcula en el frontend con datos que la evaluación ya entrega
  (clasificación, bloqueadores, brecha principal). No cambia el contrato de `POST /score` ni el
  motor de scoring.
- **No oculta secciones.** Se descartó el revelado progresivo: el cliente y los profesores podrían
  leer como pérdida funcionalidades ya demostradas, y rompería enlaces directos existentes
  (`/subsidios`, `/portal`).
- **Fuera de alcance, candidatas a historias propias:**
  - fusionar Proyectos, Simulación y Portal, que hoy son tres entradas a la misma intención (ver y
    comparar viviendas);
  - recortar el contenido interno de cada sección — conviene priorizarlo con los resultados de E5,
    que dirán qué páginas siguen siendo las más pesadas;
  - simplificación transversal del lenguaje y los términos técnicos;
  - vistas del ejecutivo comercial y del administrador.
- **Decisión de implementación abierta:** cómo detectar *"aún no abrió Resultados"* (regla 2 de E2).
  Si no hay una forma razonable, la regla se elimina y el caso cae en las reglas 3 a 7.
