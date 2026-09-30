# RutaHogar Brand

Esta carpeta contiene los recursos base de identidad visual de RutaHogar para el frontend.

## Logo

El logo oficial actual es:

- `logo-rutahogar.svg`

El SVG fue refactorizado para separar partes editables sin cambiar visualmente el diseno original. No se deben modificar sus `path` salvo que el equipo este redisenando explicitamente el logo.

Estructura interna aproximada:

```text
rutahogar-logo
├── icon
│   ├── house
│   └── road
└── wordmark
    ├── ruta
    └── hogar
```

Los colores pueden modificarse independientemente mediante los atributos `fill` de esos grupos. `Ruta` y `Hogar` actualmente son texto real editable mediante `#ruta-text` y `#hogar-text`.

Ejemplos simples:

```svg
<!-- Solo casa -->
<g id="house" fill="#0032B9">

<!-- Solo camino -->
<g id="road" fill="#FFB700">

<!-- Solo Ruta -->
<text id="ruta-text" fill="#0032B9">

<!-- Solo Hogar -->
<text id="hogar-text" fill="#FFB700">
```

## Colores Oficiales Actuales

- Azul RutaHogar: `#0032B9`
- Amarillo RutaHogar: `#FFB700`

Uso actual:

- El azul se usa como color principal de interfaz.
- El amarillo se usa como color de acento.
- Las superficies principales deben seguir siendo blancas o neutras claras.
- La paleta ya comenzo a aplicarse en navbar, hero, botones, indicadores y secciones visibles.

## Colores Propuestos En CSS

El archivo `rutahogar-brand.css` contiene variables y utilidades de marca. Actualmente se importa como fuente de tokens visuales desde `frontend/src/styles.css`.

Colores de marca:

- `--rh-blue: #0032b9`
- `--rh-yellow: #ffb700`

Variantes claras/oscuras:

- `--rh-blue-dark: #002687`
- `--rh-blue-light: #e8eeff`
- `--rh-yellow-dark: #d99c00`
- `--rh-yellow-light: #fff7d6`

Colores neutros:

- `--rh-white: #ffffff`
- `--rh-background: #f9fafb`
- `--rh-surface: #ffffff`
- `--rh-text: #111827`
- `--rh-text-secondary: #6b7280`
- `--rh-border: #e5e7eb`

Colores semanticos:

- `--rh-success: #16a34a`
- `--rh-warning: #f59e0b`
- `--rh-danger: #dc2626`
- `--rh-info: #0284c7`

Los colores semanticos no sustituyen los colores de marca. Por ejemplo, un error o una accion destructiva puede seguir siendo roja aunque la identidad principal sea azul y amarilla.

## Reglas De Aplicacion En Interfaz

- Azul `var(--rh-blue)`: acciones principales, links destacados, estados activos de navegacion y elementos importantes.
- Amarillo `var(--rh-yellow)`: acentos y llamados puntuales, no como superficie dominante.
- Neutros `var(--rh-white)`, `var(--rh-background)`, `var(--rh-surface)`, `var(--rh-border)`: fondos, cards, contenedores y separadores.
- Texto: usar `var(--rh-text)` para contenido principal y `var(--rh-text-secondary)` para texto secundario.
- Success/warning/danger/info: mantener los tokens semanticos para estados funcionales.

Contraste:

- Blanco sobre azul esta permitido y recomendado.
- Texto oscuro sobre amarillo esta permitido.
- No usar texto blanco sobre amarillo.
- Evitar texto amarillo sobre fondo blanco para informacion importante.
- Evitar grandes superficies amarillas; el amarillo debe funcionar como acento.
- Evitar saturar la interfaz con bloques grandes de azul y amarillo al mismo tiempo.

Estados:

- Score alto, confirmaciones y estados positivos: `var(--rh-success)`.
- Score medio o alertas no criticas: `var(--rh-warning)`.
- Score bajo, errores o acciones destructivas: `var(--rh-danger)`.
- Informacion neutral/contextual: `var(--rh-info)` cuando aplique.

## Tipografia

Tipografia oficial actual del logo: `Alexandria` para `Ruta` y `Nunito` para `Hogar`.

Ruta:

- `Alexandria ExtraBold / 800`
- Azul `#0032B9`

Hogar:

- `Nunito Regular / 400`
- Amarillo `#FFB700`

Cada palabra usa una familia tipografica distinta para reforzar la jerarquia del wordmark: `Ruta` queda mas firme con Alexandria 800 y `Hogar` queda mas liviano con Nunito 400. La diferencia visual se consigue mediante familia, peso, tamano y color.

`Ruta` y `Hogar` son texto real dentro del SVG y no `path`. Por eso la tipografia puede modificarse posteriormente sin reconstruir el icono. Si se cambia la familia tipografica en el futuro, puede ser necesario reajustar ligeramente `font-size`, `letter-spacing`, `x` o `y`, porque cada fuente tiene metricas distintas.

La tipografia del logo se cambia actualmente en `logo-rutahogar.svg`, dentro del bloque `<style>` interno. Los mismos valores se reflejan como atributos en los elementos `<text>` para que el SVG siga renderizando correctamente en visores que no aplican todo el CSS interno:

```css
#ruta-text {
  font-family: "Alexandria", sans-serif;
  font-weight: 800;
}

#hogar-text {
  font-family: "Nunito", sans-serif;
  font-weight: 400;
}
```

Alexandria y Nunito se cargan desde Google Fonts en `frontend/index.html` y tambien se declaran en el bloque `<style>` del SVG para que el archivo del logo conserve su configuracion tipografica junto al propio recurso. No se deben agregar archivos binarios de fuente al repositorio salvo que el equipo decida una estrategia local/offline.

Esta decision define la tipografia del wordmark/logo, no necesariamente la tipografia global de toda la aplicacion. La variable `--rh-font` de `rutahogar-brand.css` corresponde a una propuesta/token de interfaz y no debe cambiarse automaticamente a Alexandria o Nunito sin una decision separada del equipo.

## Uso Actual

La aplicacion referencia el logo desde:

```text
/brand/rutahogar/logo-rutahogar.svg
```

`rutahogar-brand.css` esta importado desde `frontend/src/styles.css` para exponer tokens. No debe introducir reglas globales de tipografia o layout sin una decision explicita del equipo.