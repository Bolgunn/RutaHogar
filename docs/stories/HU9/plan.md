# HU9: Cotización Orientativa por Proyecto y Rebase de Integración

Este documento detalla la reincorporación (rebase) y los ajustes realizados en la **HU9 (Catálogo de Proyectos)**, la cual presentaba problemas de navegación y blank pages al intentar acceder al módulo tras la integración de funcionalidades de registro y seguimiento financiero.

## Resumen de la Implementación

1. **Restauración de Rutas en la Navegación (Frontend)**
   - Se reintrodujo la opción de acceso "Proyectos" en el `Navbar.jsx` para roles de usuario, la cual se había perdido o desvinculado de la vista tras iteraciones previas de la App.
   - En `App.jsx`, se agregó la tarjeta de acceso rápido al catálogo de proyectos en el dashboard central de los usuarios y se configuró correctamente la navegación hacia `page === "projects"`.

2. **Resolución de Blank Pages y Pantallazos en Blanco**
   - Se ajustó el enrutamiento para asegurar que los catálogos y listas del proyecto se rendericen de forma asíncrona sin bloquear el DOM del usuario.
   - Se manejaron apropiadamente las propiedades de renderizado para evitar errores de tipo `group.items is undefined` que provocaban cierres por fallos en el árbol de componentes de React al renderizar el NavBar.

3. **Corrección de la Conexión de Backend (FastAPI)**
   - Se resolvió un error de conexión persistente donde el cliente arrojaba "No se pudo conectar con el backend local en http://127.0.0.1:8000/score".
   - El fallo se identificó y solucionó en `backend/app/ai.py`, en el cual un error de indentación de Python y una firma de función faltante (`_ask_groq`) detenían el servicio de FastAPI e impedían la precalificación y el flujo hacia la selección de proyectos.

4. **Persistencia de Plan Type**
   - Se ajustó el componente `evaluationService.js` en el cliente para que el campo `plan_type` quedase debidamente anidado bajo un objeto `housing_plan` JSONB en el esquema de Supabase, eludiendo errores de PGRST204 que surgían cuando se intentaban insertar columnas no mapeadas directamente en la BD.
