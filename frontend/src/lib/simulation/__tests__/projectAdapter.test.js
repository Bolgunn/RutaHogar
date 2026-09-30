import { describe, expect, it } from "vitest";
import {
  catalogProjectToSimulation,
  catalogProjectsToSimulation,
  formatDeliveryMonth,
  formatProjectPrice,
} from "../projectAdapter";

const catalogProject = {
  id: "p-1",
  inmobiliaria_id: "i-1",
  inmobiliaria_nombre: "Inmobiliaria Andes (demo)",
  nombre: "Altos de Macul",
  comuna: "Macul",
  tipo: "departamento",
  precio_min_uf: 2400,
  precio_max_uf: 3200,
  estado: "disponible",
  descripcion: "Departamento cercano a servicios.",
  entrega_estimada: "2027-01",
  ejecutivos: [],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("catalogProjectToSimulation", () => {
  it("mapea cada campo que lee la simulación", () => {
    expect(catalogProjectToSimulation(catalogProject)).toEqual({
      id: "p-1",
      nombre: "Altos de Macul",
      comuna: "Macul",
      tipo_vivienda: "departamento",
      valor_uf: 2400,
      precio_min_uf: 2400,
      precio_max_uf: 3200,
      descripcion_corta: "Departamento cercano a servicios.",
      entrega_estimada: "2027-01",
      inmobiliaria: "Inmobiliaria Andes (demo)",
      estado: "disponible",
    });
  });

  it("usa el precio mínimo como valor del escenario", () => {
    expect(catalogProjectToSimulation(catalogProject).valor_uf).toBe(2400);
  });

  it("conserva el rango completo junto al valor del escenario", () => {
    const mapped = catalogProjectToSimulation(catalogProject);
    expect([mapped.precio_min_uf, mapped.precio_max_uf]).toEqual([2400, 3200]);
  });

  it("acepta un proyecto de precio único", () => {
    const mapped = catalogProjectToSimulation({
      ...catalogProject,
      precio_min_uf: 4500,
      precio_max_uf: 4500,
    });
    expect(mapped.valor_uf).toBe(4500);
    expect(mapped.precio_min_uf).toBe(4500);
    expect(mapped.precio_max_uf).toBe(4500);
  });

  it("deja en blanco los campos comerciales cuando son null", () => {
    const mapped = catalogProjectToSimulation({
      ...catalogProject,
      descripcion: null,
      entrega_estimada: null,
      inmobiliaria_nombre: "",
    });
    expect(mapped.descripcion_corta).toBe("");
    expect(mapped.entrega_estimada).toBe("");
    expect(mapped.inmobiliaria).toBe("");
  });

  it("devuelve null si no hay proyecto", () => {
    expect(catalogProjectToSimulation(null)).toBeNull();
  });

  it("mapea una lista completa y descarta huecos", () => {
    expect(catalogProjectsToSimulation([catalogProject, null])).toHaveLength(1);
    expect(catalogProjectsToSimulation()).toEqual([]);
  });
});

describe("formatProjectPrice", () => {
  it("etiqueta un rango con «desde»", () => {
    expect(formatProjectPrice({ precio_min_uf: 2400, precio_max_uf: 3200 })).toBe("desde 2.400 UF");
  });

  it("muestra la cifra desnuda cuando el precio es único", () => {
    expect(formatProjectPrice({ precio_min_uf: 4500, precio_max_uf: 4500 })).toBe("4.500 UF");
  });

  it("cae a valor_uf cuando no viene el rango", () => {
    expect(formatProjectPrice({ valor_uf: 2800 })).toBe("2.800 UF");
  });

  it("no revienta sin datos", () => {
    expect(formatProjectPrice(null)).toBe("0 UF");
  });
});

describe("formatDeliveryMonth", () => {
  it("traduce el mes a texto", () => {
    expect(formatDeliveryMonth("2027-01")).toBe("enero 2027");
    expect(formatDeliveryMonth("2026-12")).toBe("diciembre 2026");
  });

  it("devuelve vacío si falta o no calza el formato", () => {
    expect(formatDeliveryMonth("")).toBe("");
    expect(formatDeliveryMonth(null)).toBe("");
    expect(formatDeliveryMonth("2027-13")).toBe("");
    expect(formatDeliveryMonth("enero 2027")).toBe("");
  });
});
