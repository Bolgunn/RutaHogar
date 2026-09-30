# HU 24 - Carga de documentos respaldatorios

> **🗓 Planificada - Sprint 3.** Permite a los leads precalificados subir comprobantes financieros para que el ejecutivo pueda validar la información declarada.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** ejecutivo, **quiero** que los usuarios precalificados puedan subir comprobantes financieros a la plataforma, **para** poder validar la información declarada.

---

## Criterios de aceptación

### E1 - Carga de archivos permitidos

**Dado** que el lead desea respaldar su información, **cuando** suba documentos en PDF, JPG o PNG, **entonces** el sistema debe aceptarlos si cumplen las reglas definidas.

### E2 - Almacenamiento seguro

**Dado** que el usuario carga documentos financieros, **cuando** el sistema los almacena, **entonces** deben quedar vinculados a su perfil de forma segura.

### E3 - Visualización por ejecutivo

**Dado** que un ejecutivo revisa un lead precalificado, **cuando** accede a su perfil, **entonces** debe poder visualizar o descargar los documentos permitidos.

---

## Notas

- Atención: la salvaguarda S8 del handbook dice que no se almacenan documentos sensibles. Esta historia entra en tensión directa con ella y no puede implementarse sin relajar S8, lo que según el handbook es una conversación con el equipo y el cliente, no una decisión de diseño.
- Tipos permitidos, tamaño máximo y mecanismo de almacenamiento son parte del **Spike 2**.
