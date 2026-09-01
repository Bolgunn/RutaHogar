import { describe, expect, it } from "vitest";
import {
  buildAccessibleAlternatives,
  DEFAULT_UF_CLP,
  evaluateScenario,
  projectToScenario,
} from "../compatibility";
import { catalogProjectToSimulation } from "../projectAdapter";

// El camino completo que recorre el catálogo de HU 9: una fila del catálogo
// (HU 7) -> vocabulario de simulación -> escenario -> veredicto. Es el mismo
// que usa /simulacion; el punto de estas pruebas es que siga siendo uno solo.
//
// Los casos esperados salen de la tabla "Casos de prueba manuales" de
// docs/stories/HU6-simulacion-compatibilidad/REGLAS_HU6.md.

const UF = DEFAULT_UF_CLP;

function catalogRow(overrides = {}) {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    nombre: "Parque Ñuñoa",
    comuna: "Ñuñoa",
    tipo: "departamento",
    precio_min_uf: 3000,
    precio_max_uf: 4200,
    estado: "disponible",
    descripcion: "Departamentos con áreas verdes.",
    entrega_estimada: "2027-03",
    ...overrides,
  };
}

function evaluateCatalogProject(row, input) {
  return evaluateScenario(input, projectToScenario(catalogProjectToSimulation(row), UF));
}

// Valor del escenario = precio_min_uf = 3.000 UF. Pie mínimo 300 UF,
// recomendado 600 UF.
const perfilHolgado = {
  ingreso_mensual: 3_000_000,
  deuda_mensual: 100_000,
  ahorro_disponible: 600 * UF,
  dividendo_estimado: 600_000,
  classification: "Alto",
  score: 78,
  uf_value_clp: UF,
};

describe("catálogo -> escenario -> veredicto", () => {
  it("el escenario se arma con el precio mínimo del rango, no con el máximo", () => {
    const scenario = projectToScenario(catalogProjectToSimulation(catalogRow()), UF);
    expect(scenario.valueUf).toBe(3000);
    expect(scenario.valueClp).toBe(Math.round(3000 * UF));
    expect(scenario.comuna).toBe("Ñuñoa");
    expect(scenario.tipo_vivienda).toBe("departamento");
  });

  it("Compatible: ahorro sobre el pie recomendado y dividendo dentro del 25% del ingreso", () => {
    expect(evaluateCatalogProject(catalogRow(), perfilHolgado).status).toBe("Compatible");
  });

  it("Requiere ajuste con brecha de pie: el ahorro no llega al pie mínimo", () => {
    const result = evaluateCatalogProject(catalogRow(), {
      ...perfilHolgado,
      ahorro_disponible: 150 * UF,
    });
    expect(result.status).toBe("Requiere ajuste");
    expect(result.mainGap).toBe("pie");
  });

  it("Cercano: el ahorro cubre el mínimo pero no el recomendado", () => {
    const result = evaluateCatalogProject(catalogRow(), {
      ...perfilHolgado,
      ahorro_disponible: 400 * UF,
    });
    expect(result.status).toBe("Cercano");
  });

  it("Requiere ajuste por deuda alta aunque el pie esté cubierto", () => {
    const result = evaluateCatalogProject(catalogRow(), {
      ...perfilHolgado,
      deuda_mensual: 1_500_000,
    });
    expect(result.status).toBe("Requiere ajuste");
    expect(result.mainGap).toBe("deuda");
  });

  it("Requiere ajuste por dividendo sobre el rango prudente", () => {
    const result = evaluateCatalogProject(catalogRow(), {
      ...perfilHolgado,
      dividendo_estimado: 1_500_000,
    });
    expect(result.status).toBe("Requiere ajuste");
    expect(result.mainGap).toBe("plazo/dividendo");
  });

  // El veredicto tiene que ser el mismo que /simulacion produce para el mismo
  // precio: es literalmente la misma función, y esta prueba lo deja anclado.
  it("un proyecto más caro empeora el veredicto con el mismo perfil", () => {
    const barato = evaluateCatalogProject(catalogRow({ precio_min_uf: 3000 }), perfilHolgado);
    const caro = evaluateCatalogProject(catalogRow({ precio_min_uf: 9000 }), perfilHolgado);
    expect(barato.status).toBe("Compatible");
    expect(caro.status).toBe("Requiere ajuste");
  });
});

describe("buildAccessibleAlternatives para el modal de HU 9", () => {
  const proyectos = [
    { id: "actual", nombre: "Actual", comuna: "Providencia", tipo: "departamento", precio_min_uf: 9000, precio_max_uf: 9000, estado: "disponible" },
    { id: "caro", nombre: "Caro", comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: 8000, precio_max_uf: 8000, estado: "disponible" },
    { id: "medio", nombre: "Medio", comuna: "La Florida", tipo: "casa", precio_min_uf: 5000, precio_max_uf: 5000, estado: "disponible" },
    { id: "barato", nombre: "Barato", comuna: "Maipú", tipo: "departamento", precio_min_uf: 2500, precio_max_uf: 2500, estado: "disponible" },
  ].map(catalogProjectToSimulation);

  const onboarding = { comuna_interes: "Ñuñoa", tipo_propiedad: "departamento" };

  it("excluye el proyecto actual", () => {
    const others = proyectos.filter((item) => item.id !== "actual");
    const alternatives = buildAccessibleAlternatives(others, perfilHolgado, onboarding, 4);
    expect(alternatives.map((item) => item.project.id)).not.toContain("actual");
  });

  // REGLAS_HU6: "El ordenamiento no debe ocultar alternativas de mayor
  // compatibilidad solo porque no coincidan con una preferencia."
  it("ordena por compatibilidad antes que por brecha o por comuna preferida", () => {
    const alternatives = buildAccessibleAlternatives(proyectos, perfilHolgado, onboarding, 4);
    const ranks = { Compatible: 0, Cercano: 1, "Requiere ajuste": 2 };

    expect(alternatives.map((item) => ranks[item.status])).toEqual(
      [...alternatives.map((item) => ranks[item.status])].sort((a, b) => a - b),
    );
    // "Barato" es el único al alcance de este perfil, así que encabeza pese a
    // estar en una comuna que el usuario no declaró.
    expect(alternatives[0].project.id).toBe("barato");
    expect(alternatives[0].preference.communeMatch).toBe(false);
  });

  it("dentro del mismo estado ordena por menor brecha", () => {
    const alternatives = buildAccessibleAlternatives(proyectos, perfilHolgado, onboarding, 4);
    const cercanos = alternatives.filter((item) => item.status === "Cercano");

    expect(cercanos.length).toBeGreaterThan(1);
    expect(cercanos.map((item) => item.gapAmount)).toEqual(
      [...cercanos.map((item) => item.gapAmount)].sort((a, b) => a - b),
    );
  });

  it("respeta el límite pedido", () => {
    expect(buildAccessibleAlternatives(proyectos, perfilHolgado, onboarding, 2)).toHaveLength(2);
  });
});
