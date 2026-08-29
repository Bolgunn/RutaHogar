# Reporte de Aseguramiento de Calidad (QA) - ScoreLeads MVP

## Criterio de Aceptación 1 (CA1) de la HU3

**Objetivo:**
Garantizar que el sistema muestre el resultado del scoring en un tiempo máximo de 60 segundos tras enviar el formulario.

**Cambios técnicos clave:**
* **Frontend (`ScoreForm.jsx`):** Inserción del parámetro `{ timeout: 60000 }` en la petición Axios, activación de un indicador visual en el envío (`loading`) y captura del código de error `ECONNABORTED` para desplegar un mensaje amigable al usuario.
* **Backend (`main.py`):** Configuración del endpoint `/score` con firma asíncrona (`async def`) para evitar bloqueos del hilo principal de FastAPI y optimizar la concurrencia.

**Prueba realizada:**
1. Verificación introspectiva de asincronismo en Python (`inspect.iscoroutinefunction`) contra el endpoint `/score` del backend.
2. Inyección de retardo controlado de 65 segundos (`await asyncio.sleep(65)`) en el backend y ejecución de un cliente de pruebas en Node.js (`test_timeout.js`) para confirmar la interrupción controlada y exitosa de la petición a los 60 segundos.

**Estado:**
Aprobado.

## Criterio de Aceptación 2 (CA2) de la HU3

**Objetivo:**
Validar la lógica de clasificación de leads en el backend, garantizando que el score calculado asigne correctamente la etiqueta (Alto, Medio o Bajo) basándose en los umbrales definidos y respetando la arquitectura de componentes.

**Cambios técnicos clave:**
* **Backend (`scoring.py`):** Verificación estricta de umbrales (Alto >= 70, Medio >= 40, Bajo < 40) y clamp dentro de la función de cálculo `calculate_score`.
* **Frontend:** Se respetó el límite arquitectónico asegurando que `ScoreForm.jsx` delegue la responsabilidad visual a `Result.jsx`, el cual recibe y renderiza correctamente la etiqueta de clasificación proveniente de la respuesta.
* **Pruebas (`test_thresholds.py`):** Desarrollo de un script en Python para validación modular de los casos de prueba solicitados.

**Prueba realizada:**
1. **Ejecución TC-004 (Parte 1):** Inyección de parámetros (ingresos congruentes, contrato indefinido, sin morosidad) resultando en score > 70. Clasificación obtenida: 'Alto'.
2. **Ejecución TC-004 (Parte 2):** Inyección de parámetros mixtos (ingresos congruentes, pero contrato independiente y menor antigüedad) resultando en 40 <= score < 70. Clasificación obtenida: 'Medio'.
3. **Ejecución TC-005:** Inyección de parámetros críticos (ingresos insuficientes, morosidad alta) resultando en score clampado < 40. Clasificación obtenida: 'Bajo'.
4. Validación 100% exitosa mediante aserciones automáticas en script local.

**Estado:**
Aprobado.
