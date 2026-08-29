export const tipoProyectoLabels = {
  departamento: "Departamento",
  casa: "Casa",
};

export const estadoProyectoLabels = {
  disponible: "Disponible",
  en_construccion: "En construcción",
  agotado: "Agotado",
};

// El estado se muestra con las mismas pills de clasificación ya existentes.
export const estadoProyectoPillClass = {
  disponible: "alto",
  en_construccion: "medio",
  agotado: "bajo",
};

export const tiposProyecto = Object.keys(tipoProyectoLabels);
export const estadosProyecto = Object.keys(estadoProyectoLabels);

// Nota: aquí NO se declaran constantes de capacidad (tope FOGAES, tasa, pie).
// Spike 1 E4 §8.3: el frontend solo replica los pesos de afinidad; la capacidad
// llega precalculada desde el backend. Antes existía un espejo de
// PRECIOS_REFERENCIA_UF para advertir en el formulario; se eliminó porque el
// matching es preference-independent y nunca lee esa tabla (§1, §2).
