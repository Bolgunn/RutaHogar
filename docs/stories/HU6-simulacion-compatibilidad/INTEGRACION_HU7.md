# Nota para HU7 - Integracion con HU6

HU6 ya puede simular compatibilidad usando proyectos referenciales. Para juntar avances con HU7, el punto de union debe ser:

```text
frontend/src/services/projectSimulationService.js
```

## Que debe entregar HU7

HU7 deberia entregar una lista de proyectos con estos campos minimos:

- `id`
- `nombre`
- `comuna`
- `tipo_vivienda`
- `valor_uf`
- `estado`

Campos opcionales utiles para HU6:

- `valor_clp`
- `dormitorios`
- `entrega_estimada`
- `inmobiliaria`
- `descripcion_corta`

## Como juntar los avances

1. Mantener `SimulationPage.jsx` consumiendo proyectos desde `projectSimulationService.js`.
2. Cambiar dentro del servicio la fuente actual `mockProjects` por la fuente real de HU7, o permitir que el servicio reciba esa lista.
3. Mantener los nombres de campos minimos para evitar cambios en la simulacion.
4. Filtrar proyectos no disponibles antes de mostrarlos en HU6.
5. No enviar a HU6 datos comerciales internos reservados para ejecutivos.

Estados que HU6 ya excluye:

- `agotado`
- `inactivo`
- `no_disponible`
- `no disponible`

## Validacion esperada

Despues de integrar HU7, correr:

```bash
npm run test:simulation
npm run build
```

La integracion no deberia cambiar formulas de pie, compatibilidad, brechas ni recomendacion referencial de HU6. HU7 solo reemplaza la fuente de proyectos; HU6 mantiene las reglas de simulacion.
