# RNF 2 - Privacidad mínima y gestión de datos personales

> **Requisito no funcional.** El usuario registrado puede gestionar su consentimiento, solicitar acciones sobre sus datos y controlar el uso de su información.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 3 |
| **Atributo de calidad** | Privacidad de datos |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** usuario registrado, **quiero** acceder a un panel de privacidad dentro de mi perfil, **para** gestionar mi consentimiento, solicitar acciones sobre mis datos y controlar el uso de mi información.

---

## Criterios de verificación

### E1 - Gestión del consentimiento

**Dado** que el usuario accede a su perfil, **cuando** entra al panel de privacidad, **entonces** debe poder ver y modificar el consentimiento asociado al uso de sus datos.

### E2 - Solicitud de descarga o rectificación

**Dado** que el usuario quiere ejercer sus derechos sobre sus datos, **cuando** elige descargar o rectificar información personal, **entonces** el sistema debe registrar la solicitud y mostrar una confirmación.

### E3 - Eliminación de cuenta

**Dado** que el usuario solicita eliminar su cuenta, **cuando** confirma la acción, **entonces** el sistema debe iniciar el proceso de eliminación total e irrecuperable según las reglas definidas.

### E4 - Recuperación de contraseña

**Dado** que el usuario olvidó su contraseña o quiere cambiarla, **cuando** solicita la recuperación, **entonces** el sistema debe permitir iniciar el flujo de restablecimiento.

---

## Notas

- Corresponde a la salvaguarda S5 del handbook: los datos financieros se tratan bajo consentimiento explícito y las solicitudes ARCO deben seguir siendo atendibles.
- El consentimiento de entrada se captura en [[../UserStories/HU1-ingreso-datos-financieros|HU 1]] E3.

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/components/DataConsent.jsx` gestiona el consentimiento y su modificación desde el perfil. |
| `E2` | ✅ | `frontend/src/services/arcoService.js:18` registra la solicitud ARCO y devuelve confirmación; `:76` y `:108` permiten consultarla y resolverla desde `AdminArcoRequests.jsx`. |
| `E3` | ⚠️ | La solicitud de eliminación se registra como petición ARCO, pero no se encontró el proceso de eliminación total e irrecuperable que exige el criterio. |
| `E4` | ✅ | El flujo de recuperación de contraseña está disponible en `AuthPanel.jsx`. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
