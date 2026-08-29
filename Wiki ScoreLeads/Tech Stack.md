# Tech Stack — RutaHogar

> Fuente: Entregable 1 (Justificación de Propuesta de Solución) y Entregable 2 (Historias de Usuario Corregidas).

---

## Arquitectura general

RutaHogar utiliza una arquitectura web de tres capas separadas: **frontend**, **backend** y **persistencia de datos**. El diseño prioriza una plataforma profesional de precalificación financiera inmobiliaria, con reglas explicables, trazabilidad, privacidad y operación sin dependencias externas obligatorias.

---

## Frontend

| Tecnología | Rol |
| :--------- | :-- |
| **React** | Framework principal para la interfaz de usuario |

**Justificación:** Permite construir interfaces dinámicas de forma rápida, como formularios guiados, visualización del score, bloqueadores, compatibilidad con proyecto, prioridad comercial y recomendaciones personalizadas.

---

## Backend

| Tecnología | Rol |
| :--------- | :-- |
| **FastAPI** | Framework web para la API REST |
| **Python** | Lenguaje principal del backend |
| **Node.js** | Mencionado como alternativa/complemento |

**Justificación:** FastAPI con Python se encarga de recibir los datos enviados desde el formulario, aplicar las reglas de scoring, clasificar al lead y generar recomendaciones. Python facilita el trabajo con reglas de negocio, procesamiento de datos y una eventual evolución hacia modelos más avanzados de análisis.

---

## Base de datos

| Tecnología | Rol |
| :--------- | :-- |
| **Supabase** | Plataforma de base de datos administrada |
| **PostgreSQL** | Motor de base de datos relacional |

**Justificación:** Se almacenarán los datos necesarios para trazabilidad y auditoría: respuestas del formulario, score obtenido, clasificación asignada, fecha de evaluación, versión del algoritmo, componentes del score y estado del plan de mejora. Supabase entrega una base PostgreSQL administrada, panel de gestión, autenticación y políticas de seguridad.

**Datos almacenados por evaluación:**
- Fecha de evaluación
- Score obtenido
- Clasificación asignada (Alto / Medio / Bajo)
- Explicación generada por IA

---

## Inteligencia Artificial

| Tecnología | Rol |
| :--------- | :-- |
| **Claude Code** | Apoyo al desarrollo, documentación y generación de componentes |
| **Agente IA / LLM** | Explicación personalizada del score al usuario (HU 3) |

**Nota:** La IA no decide el score ni reemplaza reglas de negocio. Su rol es redactar explicaciones textuales, resúmenes ejecutivos y orientación comercial a partir del resultado calculado por reglas auditables.

---

## Integraciones futuras

Estas tecnologías se evaluarán solo con alcance aprobado, consentimiento explícito cuando involucren datos personales o financieros, y trazabilidad suficiente para auditoría.

| Tecnología / Servicio | Fase | Propósito |
| :-------------------- | :--- | :-------- |
| **OCR** | Fase 2 | Procesar documentos subidos voluntariamente por el usuario (liquidaciones, certificados) para reforzar la confiabilidad del perfil |
| **API CMF** | Fase 2+ | Incorporar datos externos para mejorar la precisión del modelo de scoring |
| **Dicom / Historial crediticio** | Fase 2+ | Validación crediticia más precisa |
| **CRM de la inmobiliaria** | Fase 2 | Integración para replicar leads calificados (score Alto) directamente en el flujo comercial (HU 4) |

---

## Seguridad

- Cifrado en tránsito y en almacenamiento
- Control de acceso basado en roles (cada actor solo visualiza los datos necesarios para su función)
- Sin solicitud de credenciales bancarias ni documentos sensibles
- HTTPS obligatorio
- Datos utilizados exclusivamente para fines de evaluación; no se comparten con terceros sin autorización explícita del usuario
- Consentimiento explícito del usuario antes del envío de datos (criterio de aceptación obligatorio, HU 1 — E3)

---

## Resumen de decisiones de diseño

| Decisión | Elección | Descartado | Razón |
| :------- | :------- | :--------- | :---- |
| Framework frontend | React | Angular | Interfaces dinámicas y mantenibles para flujo financiero |
| Lenguaje backend | Python + FastAPI | — | Facilita reglas de negocio y futura evolución hacia ML |
| Base de datos | Supabase + PostgreSQL | — | BD administrada, panel de gestión, auth futura incluida |
| Integraciones externas actuales | Ninguna obligatoria | CMF, Dicom, CRM | Mantener privacidad y consentimiento explícito antes de consultar terceros |
| Fuente de datos actual | Datos autodeclarados por el usuario | APIs bancarias | Evitar consultas externas sin consentimiento y alcance aprobado |
