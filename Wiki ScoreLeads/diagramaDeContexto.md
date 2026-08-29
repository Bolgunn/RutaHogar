# Diagrama de Contexto — RutaHogar

> Muestra cómo cada actor externo se relaciona con la plataforma RutaHogar. Las líneas sólidas corresponden al alcance activo; las líneas punteadas corresponden a integraciones planificadas para fases futuras.

---

```mermaid
graph TB
    Lead["👤 Lead<br/>Interesado en comprar vivienda"]
    Ejecutivo["💼 Ejecutivo Comercial<br/>Equipo de ventas de la inmobiliaria"]
    Inmobiliaria["🏢 Inmobiliaria<br/>Cliente — Echeverría Izquierdo"]
    LLM["🤖 LLM API<br/>Claude / IA Generativa"]
    Supabase["🗄️ Supabase / PostgreSQL<br/>Base de datos administrada"]
    CRM["📋 CRM Inmobiliaria<br/>Gestión comercial interna"]
    CMF["🏦 API CMF / Dicom<br/>Historial crediticio externo"]

    RutaHogar["⚡ RutaHogar<br/>Plataforma de precalificación<br/>y acompañamiento financiero"]

    Lead -->|"Ingresa datos financieros<br/>vía formulario guiado"| RutaHogar
    RutaHogar -->|"Entrega score 0–100, clasificación,<br/>explicación IA y plan de mejora"| Lead

    Ejecutivo -->|"Accede al dashboard<br/>de leads priorizados"| RutaHogar
    RutaHogar -->|"Cartera filtrada score Alto<br/>con sugerencia de acción comercial"| Ejecutivo

    Inmobiliaria -->|"Contrata la plataforma<br/>y define parámetros del proyecto"| RutaHogar
    RutaHogar -->|"Reportes de viabilidad<br/>y leads calificados"| Inmobiliaria

    RutaHogar -->|"Envía perfil del lead<br/>para generar explicación"| LLM
    LLM -->|"Devuelve explicación personalizada<br/>y plan de mejora en lenguaje natural"| RutaHogar

    RutaHogar -->|"Almacena fecha, score,<br/>clasificación y explicación"| Supabase

    RutaHogar -.->|"Fase 2 — Replica leads<br/>con score Alto"| CRM
    RutaHogar -.->|"Fase 2 — Consulta<br/>historial crediticio"| CMF
```

---

## Descripción de actores y relaciones

### Actores del alcance activo

| Actor | Tipo | Relación con RutaHogar |
| :---- | :--- | :---------------------- |
| **Lead** | Usuario final | Ingresa sus datos financieros básicos mediante un formulario guiado. Recibe su score (0–100), clasificación (Alto / Medio / Bajo), explicación de factores y plan de mejora personalizado. |
| **Ejecutivo Comercial** | Usuario operador | Accede al dashboard de leads precalificados. Visualiza la cartera filtrada por score Alto, indicadores financieros de cada lead y sugerencias de acción comercial ("contactar pronto" / "mantener en seguimiento"). |
| **Inmobiliaria** | Cliente / Contratante | Organización que contrata la plataforma. Define los parámetros del proyecto (comuna objetivo, precio referencial). Recibe reportes de viabilidad y mejora la eficiencia de su embudo comercial. |
| **LLM API** | Sistema externo (IA) | API de IA generativa consumida por el backend para redactar explicaciones personalizadas, resúmenes o guías. No decide el score ni reemplaza reglas de negocio. |
| **Supabase / PostgreSQL** | Sistema externo (datos) | Base de datos administrada donde se persiste cada evaluación: fecha, score obtenido, clasificación asignada y explicación generada. |

### Integraciones futuras

| Sistema | Propósito |
| :------ | :-------- |
| **CRM Inmobiliaria** | Replicar automáticamente los leads con score Alto al flujo comercial interno de la inmobiliaria, eliminando la gestión manual. |
| **API CMF / Dicom** | Incorporar historial crediticio externo solo con consentimiento explícito, alcance aprobado y trazabilidad suficiente. |
