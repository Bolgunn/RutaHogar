# Historia de Usuario 4 (HU4): Plan de Mejora Estratégico

Este documento detalla la implementación técnica y de experiencia de usuario (UX) para la HU4 (Simulador de Brecha y Plan de Mejora). El objetivo principal de esta HU es reemplazar la "gamificación cosmética" por una **causalidad bancaria real**, donde las metas de ahorro y pago de deuda están estrictamente ligadas a los indicadores financieros exigidos por los bancos (como el límite de carga financiera del 25% y el 10% del pie mínimo).

## 1. Arquitectura y Componentes Principales

La interfaz y lógica principal se concentra en el componente Frontend:
**Ubicación:** `frontend/src/components/FinancialTracking.jsx`
**Servicios de Apoyo:** `frontend/src/services/financialTracking.js` (procesamiento de metas y categorización).
**Backend (Lógica base):** `backend/app/scoring.py` (cálculo de los `financial_indicators` y generación de recomendaciones).

El flujo de usuario ahora está estrictamente dividido en dos fases:
1. **Selección del Perfil de Mejora (Configuración Inicial)**
2. **Tablero de Progreso Financiero (Dashboard de Ejecución)**

---

## 2. Fase 1: Selección del Plan (Modal de Configuración)

Al ingresar a la vista, si el usuario aún no ha definido su ritmo financiero, la vista principal se oculta y se presenta una pantalla de selección obligatoria.

### Perfiles Financieros Disponibles
Se presentan dos opciones que determinan las métricas a usar en el resto de la interfaz:
*   **Plan Acelerado (Recomendado):** 
    *   **Objetivo:** Alcanzar la meta del pie en el menor tiempo posible matemático (saneando deudas rápidamente).
    *   **Pros:** Menos meses de espera, reducción de intereses arrastrados por morosidad.
    *   **Contras:** Exige un esfuerzo de ahorro mensual alto y deja poca holgura en el presupuesto mensual.
*   **Plan Conservador:**
    *   **Objetivo:** Cuota de ahorro menor y más cómoda, pero tomará más tiempo.
    *   **Pros:** Mayor holgura mes a mes para destinar a otros gastos o imprevistos familiares.
    *   **Contras:** La meta de comprar tomará más meses/años y el saneamiento de deudas será más lento.

### Alerta Estratégica Inmobiliaria (> 1 Año)
Si matemáticamente el *Plan Acelerado* indica que el usuario tardará **más de 12 meses** en ahorrar el pie, se muestra una sugerencia destacada (en color azul) en esta misma pantalla de selección:
> *"Sugerencia: Tu pie proyectado toma más de 1 año incluso en el plan acelerado. Podrías alcanzar tu meta antes si evalúas cambiar tu vivienda objetivo o buscas en otros sectores más accesibles."*

---

## 3. Fase 2: Tablero "Progreso Plan Financiero"

Una vez seleccionado el plan, la UI despliega un panel superior con un botón para **"Cambiar de Plan"** y 4 métricas calculadas en base a las fórmulas financieras:

### A. Capacidad de Dividendo
Evalúa el sueldo líquido contra la deuda actual.
*   **Dividendo Requerido:** Lo que costaría la cuota de la vivienda que el usuario busca.
*   **Viable Hoy (RCI):** Lo que el banco realmente le prestaría hoy considerando su nivel de endeudamiento.
*   **Lógica RCI:** Existe un botón de información (`i`) interactivo que explica que el **RCI (Relación Cuota-Ingreso)** limita la carga financiera total al 25% del ingreso líquido. Si la persona excede el 25% solo con sus deudas actuales, su dividendo viable es **$0**.

### B. Meta de Pie (10%)
Muestra el esfuerzo patrimonial.
*   **Métricas:** Muestra el dinero ya "Ahorrado" y el "Faltante" (Brecha de pie).
*   **Gráfico Circular:** Una barra SVG animada ubicada en la esquina superior derecha de la tarjeta, que llega al 100% (verde) cuando la brecha de pie mínimo llega a 0.

### C. Pago de Deuda (Cumplimiento Criterio E3)
Enfocado en sanear la Carga Financiera y la Morosidad.
*   **Métricas base:** Muestra si existe *Morosidad activa* (crítica) o *Deuda mensual*.
*   **Monto a Pagar:** Cuánto del excedente de deuda debe amortizar el usuario para lograr que su carga financiera total quede en un rango sano (<= 25% de RCI).
*   **Proyección:** Indica un "Pago sugerido por mes" y el "Tiempo estimado de pago" basado exclusivamente en si se seleccionó el perfil Acelerado o Conservador.
*   **Indicador Visual:** Posee un progreso circular que está al 100% si no se requiere saneamiento, o refleja el ratio de salud crediticia actual.

### D. Ahorro Pie
Indica el compromiso mensual.
*   **Métricas:** Muestra el *Ahorro sugerido* mensual y el *Tiempo mínimo del pie* proyectado.
*   **Meta Proyectada Fija:** 
    *   Si es *Acelerado*: La meta se fija al mínimo matemático (Ej: 16 meses).
    *   Si es *Conservador*: La meta respeta la aspiración original que el usuario puso en su formulario inicial (Ej: 3, 6, 12 o 24 meses).
*   **Viabilidad:** Si el usuario cumple con el ahorro y los ratios bancarios, se pinta un panel verde con éxito. Si el tiempo se sale de proporción, insta a evaluar reducción de deuda o aumento de ingresos.

---

## 4. Fase 3: "Pasos Sugeridos para Mejorar" (Acciones Habilitantes)

Esta sección reemplaza la típica vista de "tareas o checklist" por una grilla moderna (Marketplace) con tarjetas interactivas que dictan el plan de acción táctico.

### Estructura de la Grilla (Responsive sin Media Queries)
Las tarjetas escalan y se ajustan horizontal y verticalmente gracias a la propiedad de CSS Grid: `repeat(auto-fit, minmax(300px, 1fr))`.

### Tarjetas de Acción (Causalidad en vez de Gamificación)
Cada tarjeta incluye:
1.  **Etiquetas:** Tema de la acción (Ej: "Morosidad", "Meta de Pie") y su Nivel de Prioridad (`Alto`, `Medio`, `Opcional`).
2.  **Colores Estilosos por Impacto:**
    *   **Alto (Rojo):** Impacto crítico, usualmente morosidades en CMF o deudas masivas.
    *   **Medio (Amarillo):** Optimizaciones estándar, como mejorar el ahorro.
    *   **Opcional (Morado):** Cosas que mejoran el perfil pero no son bloqueantes (Ej: Ordenar respaldos financieros, evaluar cambiar la casa a una más barata).
3.  **Botón de Acción:** "Registrar Avance", anclado al final de la tarjeta, empujando la interfaz al flujo centralizado de registro de hitos del perfil de usuario, para evitar que cambien de estado por error.

### Filtros Simplificados
Los controles se ubican a la derecha y permiten filtrar la grilla bajo dos ejes:
*   **Prioridad:** (Todos, Bajo, Medio, Alto, Opcional).
*   **Tema:** Las metas que en Backend se llaman "Saneamiento", en el Frontend se formatearon limpiamente para que el usuario las entienda como "Morosidad", permitiéndole enfocar su plan rápidamente.
