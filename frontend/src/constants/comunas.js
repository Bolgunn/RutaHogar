const REGION_METROPOLITANA = "Región Metropolitana";
const REGION_VALPARAISO = "Región de Valparaíso";

export const comunasPorRegion = Object.freeze({
  [REGION_METROPOLITANA]: Object.freeze([
    "Santiago", "Providencia", "Las Condes", "Ñuñoa", "Macul", "La Florida", "Maipú",
    "Puente Alto", "San Miguel", "Estación Central", "Independencia", "Recoleta", "Vitacura",
    "Lo Barnechea", "Huechuraba", "Quilicura", "Peñalolén", "La Reina", "San Joaquín",
    "Cerrillos", "Pudahuel", "La Cisterna", "El Bosque", "San Bernardo", "Colina", "Lampa",
    "Padre Hurtado", "Peñaflor", "Talagante", "Buin", "Calera de Tango", "Paine", "Pirque",
    "San José de Maipo", "Melipilla", "Cerro Navia", "Conchalí", "La Granja", "La Pintana",
    "Lo Espejo", "Lo Prado", "Pedro Aguirre Cerda", "Quinta Normal", "Renca", "San Ramón",
  ].sort((a, b) => a.localeCompare(b, "es"))),
  [REGION_VALPARAISO]: Object.freeze([
    "Algarrobo", "Cabildo", "Calle Larga", "Cartagena", "Casablanca", "Catemu", "Concón",
    "El Quisco", "El Tabo", "Hijuelas", "Isla de Pascua", "Juan Fernández", "La Calera",
    "La Cruz", "La Ligua", "Limache", "Llaillay", "Los Andes", "Nogales", "Olmué",
    "Panquehue", "Papudo", "Petorca", "Puchuncaví", "Putaendo", "Quillota", "Quilpué",
    "Quintero", "Rinconada", "San Antonio", "San Esteban", "San Felipe", "Santa María",
    "Santo Domingo", "Valparaíso", "Villa Alemana", "Viña del Mar", "Zapallar",
  ].sort((a, b) => a.localeCompare(b, "es"))),
});

export const regionesSoportadas = Object.freeze(Object.keys(comunasPorRegion));

// Compatibilidad con todos los consumidores que aún necesitan una lista plana.
export const comunasMvp = Object.freeze(
  Object.values(comunasPorRegion).flat().sort((a, b) => a.localeCompare(b, "es")),
);

export function getComunasPorRegion(region) {
  return comunasPorRegion[region] || [];
}

export function obtenerRegionPorComuna(comuna) {
  if (!comuna) return null;
  return regionesSoportadas.find((region) => comunasPorRegion[region].includes(comuna)) || null;
}
