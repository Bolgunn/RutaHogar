# HU 23 - Configuración de parámetros de scoring

> **🗓 Planificada - Sprint 3.** Permite al administrador inmobiliario ver y modificar los parámetros del motor de scoring para adaptar los leads que ven sus ejecutivos.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Opcional |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** modificar los parámetros utilizados por el motor de scoring, **para** adaptar los leads que le aparecen a mis ejecutivos comerciales a lo que buscamos como organización.

---

## Criterios de aceptación

### E1 - Visualización de parámetros

**Dado** que el administrador inmobiliario accede al panel de scoring, **cuando** consulta la configuración, **entonces** debe ver los parámetros utilizados por el motor.

### E2 - Modificación autorizada

**Dado** que el administrador inmobiliario modifica un parámetro, **cuando** guarda los cambios, **entonces** el sistema debe validar y persistir la nueva configuración.

### E3 - Aplicación futura

**Dado** que existen nuevos parámetros configurados, **cuando** se realicen evaluaciones posteriores, **entonces** el sistema debe utilizar la configuración vigente.

---

## Notas

- Toca directamente los tunables del motor. El handbook exige que todo tunable viva en `constants.py` una sola vez y que `ALGORITHM_Version` se mueva cuando cambia una regla; esta historia debe respetar ambas cosas.
- E3 interactua con [[../RNF/RNF5-historial-inmutable|RNF 5]]: cambiar parámetros no debe reescribir evaluaciones ya emitidas.
