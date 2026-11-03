# HU 23 - Documentos respaldatorios y validación asistida

> **🗓 Planificada - Sprint 3.** El lead sube un documento, RutaHogar extrae solo los datos del tipo seleccionado, los contrasta con lo declarado y elimina el archivo original; el ejecutivo ve qué está respaldado sin acceder al documento.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 8 |
| **Actor** | Lead · Ejecutivo comercial |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Isaías — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** usuario precalificado, **quiero** cargar documentos que respalden mis antecedentes financieros y recibir ayuda para contrastarlos con la información que declaré, **para** mantener mi perfil actualizado y permitir que el ejecutivo distinga qué información cuenta con respaldo documental.

---

## Criterios de aceptación

### E1 - Carga y extracción acotada

**Dado** que el usuario desea respaldar un antecedente financiero o laboral, **cuando** seleccione un tipo de documento soportado y cargue un archivo válido, **entonces** RutaHogar debe procesarlo de forma segura e intentar extraer únicamente los datos asociados al tipo de documento seleccionado.

### E2 - Contraste con lo declarado

**Dado** que RutaHogar pudo extraer información relevante desde un documento, **cuando** finalice el procesamiento, **entonces** debe mostrar al usuario los valores declarados y los detectados, indicando coincidencias o diferencias y solicitando confirmación antes de modificar cualquier dato.

### E3 - Eliminación del original

**Dado** que un documento fue utilizado para respaldar información, **cuando** el usuario confirme, cancele o abandone el proceso, **entonces** RutaHogar debe gestionar la eliminación del archivo original y conservar únicamente la información mínima necesaria sobre el respaldo realizado.

### E4 - Estado de respaldo visible

**Dado** que el usuario posee antecedentes respaldados documentalmente, **cuando** él o un ejecutivo autorizado consulte su información, **entonces** el sistema debe distinguir los datos respaldados, los que presentan diferencias y los que no poseen respaldo, sin permitir al ejecutivo acceder al documento original, y permitir al usuario realizar una nueva precalificación con los antecedentes actualizados.

---

## Notas

- Reemplaza a las antiguas [[HU24-carga-documentos|HU 24 — Carga de documentos respaldatorios]] y [[HU27-revision-antecedentes|HU 27 — Revisión referencial de antecedentes declarados]].
- **Resuelve la tensión con la salvaguarda S8** que tenía la antigua HU 24: el original se elimina (E3) y el ejecutivo nunca accede a él (E4).
- **Roza dos exclusiones de [CLAUDE.md](../../.claude/CLAUDE.md):** "OCR de documentos" y "almacenamiento de documentos sensibles" están fuera de alcance sin instrucción explícita. Esta historia es esa instrucción para la extracción acotada, pero conviene dejar escrito en el diseño qué técnica de extracción se usa y que el archivo no persiste.
- El modelo de "dato respaldado / con diferencia / sin respaldo" lo consume [[HU22-centro-exportacion-dossier|HU 22]]; definirlo temprano.
