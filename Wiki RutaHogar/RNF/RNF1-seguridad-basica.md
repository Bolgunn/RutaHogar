# RNF 1 - Seguridad básica del sistema

> **Requisito no funcional.** La plataforma implementa validaciones, protección de endpoints y manejo seguro de errores para proteger la información financiera de los usuarios y reducir riesgos de vulnerabilidades.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 8 |
| **Atributo de calidad** | Seguridad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** administrador del sistema, **quiero** que la plataforma implemente validaciones, protección de endpoints y manejo seguro de errores, **para** proteger la información financiera de los usuarios y reducir riesgos de vulnerabilidades.

---

## Criterios de verificación

### E1 - Validación de entradas

**Dado** que un usuario completa formularios o consume endpoints, **cuando** envía datos inválidos, incompletos o fuera de rango, **entonces** el sistema debe rechazar la solicitud y mostrar un mensaje controlado.

### E2 - Protección contra errores inseguros

**Dado** que ocurre un error en el backend, **cuando** el sistema responde al usuario, **entonces** no debe exponer trazas técnicas, consultas SQL, tokens ni datos sensibles.

### E3 - Prevención de inyección SQL

**Dado** que el sistema guarda o consulta información financiera, **cuando** se ejecutan operaciones sobre la base de datos, **entonces** deben utilizarse consultas parametrizadas, ORM o mecanismos equivalentes.

---

## Notas

- E1 y E2 se detallan por separado como [[RNF10-validacion-entradas|RNF 10]] y [[RNF9-manejo-seguro-errores|RNF 9]], siguiendo el listado del documento fuente. Este RNF es el paraguas de ambos.
- Se apoya en la salvaguarda S8 del handbook: sin credenciales en el código y sin documentos sensibles almacenados.
