import { describe, expect, it } from "vitest";
import {
  comunasMvp,
  comunasPorRegion,
  getComunasPorRegion,
  obtenerRegionPorComuna,
  regionesSoportadas,
} from "../comunas";

describe("cobertura de comunas", () => {
  it("incluye las 38 comunas oficiales de la Región de Valparaíso", () => {
    const valparaiso = getComunasPorRegion("Región de Valparaíso");

    expect(valparaiso).toHaveLength(38);
    expect(valparaiso).toEqual([
      "Algarrobo", "Cabildo", "Calle Larga", "Cartagena", "Casablanca", "Catemu", "Concón",
      "El Quisco", "El Tabo", "Hijuelas", "Isla de Pascua", "Juan Fernández", "La Calera",
      "La Cruz", "La Ligua", "Limache", "Llaillay", "Los Andes", "Nogales", "Olmué",
      "Panquehue", "Papudo", "Petorca", "Puchuncaví", "Putaendo", "Quillota", "Quilpué",
      "Quintero", "Rinconada", "San Antonio", "San Esteban", "San Felipe", "Santa María",
      "Santo Domingo", "Valparaíso", "Villa Alemana", "Viña del Mar", "Zapallar",
    ]);
    expect(comunasPorRegion["Región de Valparaíso"]).toBe(valparaiso);
  });

  it("mantiene las comunas RM en la lista plana compatible", () => {
    expect(comunasMvp).toEqual(expect.arrayContaining(["Santiago", "Ñuñoa", "Puente Alto"]));
    expect(comunasMvp).toEqual(expect.arrayContaining(["Valparaíso", "Viña del Mar"]));
  });

  it("deriva la región desde comunas existentes y nuevas", () => {
    expect(obtenerRegionPorComuna("Santiago")).toBe("Región Metropolitana");
    expect(obtenerRegionPorComuna("Viña del Mar")).toBe("Región de Valparaíso");
    expect(regionesSoportadas).toEqual(["Región Metropolitana", "Región de Valparaíso"]);
  });

  it("no inventa una región para una comuna desconocida", () => {
    expect(obtenerRegionPorComuna("Comuna inexistente")).toBeNull();
    expect(getComunasPorRegion("Región inexistente")).toEqual([]);
  });
});
