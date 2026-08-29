import { describe, expect, it } from "vitest";
import {
  decideExecutiveBinding,
  derivedTestPassword,
  filterAvailable,
  validateExecutive,
  validateProject,
} from "../projectValidation";

const validProject = {
  nombre: "Parque Ñuñoa",
  inmobiliaria_id: "11111111-1111-1111-1111-111111111111",
  comuna: "Ñuñoa",
  tipo: "departamento",
  estado: "disponible",
  precio_min_uf: 4200,
  precio_max_uf: 6800,
};

// E2 — validación de datos
describe("validateProject", () => {
  it("acepta un proyecto completo y consistente", () => {
    const { ok, errors } = validateProject(validProject);
    expect(ok).toBe(true);
    expect(errors).toEqual({});
  });

  it("acepta precio mínimo igual al máximo", () => {
    const { ok } = validateProject({ ...validProject, precio_min_uf: 5000, precio_max_uf: 5000 });
    expect(ok).toBe(true);
  });

  it("no impone un techo al precio máximo", () => {
    const { ok } = validateProject({ ...validProject, precio_max_uf: 250000 });
    expect(ok).toBe(true);
  });

  it("rechaza un rango invertido", () => {
    const { ok, errors } = validateProject({
      ...validProject,
      precio_min_uf: 6800,
      precio_max_uf: 4200,
    });
    expect(ok).toBe(false);
    expect(errors.precio_max_uf).toBeTruthy();
  });

  it("rechaza precios en cero o negativos", () => {
    const cero = validateProject({ ...validProject, precio_min_uf: 0 });
    expect(cero.ok).toBe(false);
    expect(cero.errors.precio_min_uf).toBeTruthy();

    const negativo = validateProject({ ...validProject, precio_max_uf: -100 });
    expect(negativo.ok).toBe(false);
    expect(negativo.errors.precio_max_uf).toBeTruthy();
  });

  it("rechaza precios vacíos o no numéricos", () => {
    const vacio = validateProject({ ...validProject, precio_min_uf: "" });
    expect(vacio.ok).toBe(false);
    expect(vacio.errors.precio_min_uf).toBeTruthy();

    const texto = validateProject({ ...validProject, precio_max_uf: "cuatro mil" });
    expect(texto.ok).toBe(false);
    expect(texto.errors.precio_max_uf).toBeTruthy();
  });

  it("exige cada campo obligatorio por separado", () => {
    expect(validateProject({ ...validProject, nombre: "   " }).errors.nombre).toBeTruthy();
    expect(validateProject({ ...validProject, inmobiliaria_id: "" }).errors.inmobiliaria_id).toBeTruthy();
    expect(validateProject({ ...validProject, comuna: "" }).errors.comuna).toBeTruthy();
    expect(validateProject({ ...validProject, tipo: "" }).errors.tipo).toBeTruthy();
    expect(validateProject({ ...validProject, estado: "" }).errors.estado).toBeTruthy();
  });

  it("acumula errores de un formulario vacío", () => {
    const { ok, errors } = validateProject({});
    expect(ok).toBe(false);
    expect(Object.keys(errors).sort()).toEqual([
      "comuna",
      "estado",
      "inmobiliaria_id",
      "nombre",
      "precio_max_uf",
      "precio_min_uf",
      "tipo",
    ]);
  });

  it("rechaza valores fuera de los enums y comunas no soportadas", () => {
    expect(validateProject({ ...validProject, tipo: "oficina" }).errors.tipo).toBeTruthy();
    expect(validateProject({ ...validProject, estado: "vendido" }).errors.estado).toBeTruthy();
    expect(validateProject({ ...validProject, comuna: "Valparaíso" }).errors.comuna).toBeTruthy();
  });
});

// E4 — un proyecto agotado no alimenta al matching
describe("filterAvailable", () => {
  const projects = [
    { id: "1", nombre: "Disponible", estado: "disponible", ejecutivos: [] },
    { id: "2", nombre: "En obra", estado: "en_construccion", ejecutivos: [] },
    { id: "3", nombre: "Agotado", estado: "agotado", ejecutivos: [] },
  ];

  it("conserva los proyectos vendibles, disponibles y en construcción", () => {
    expect(filterAvailable(projects).map((project) => project.id)).toEqual(["1", "2"]);
  });

  // La venta en verde es mercado real: en_construccion sí se recomienda.
  it("mantiene un proyecto en construcción dentro del feed", () => {
    const enObra = [{ id: "7", estado: "en_construccion", ejecutivos: [] }];
    expect(filterAvailable(enObra).map((project) => project.id)).toEqual(["7"]);
  });

  it("conserva el estado para que HU 13 pueda mostrarlo", () => {
    expect(filterAvailable(projects).map((project) => project.estado)).toEqual([
      "disponible",
      "en_construccion",
    ]);
  });

  it("excluye un proyecto marcado como agotado", () => {
    const soldOut = [{ id: "9", estado: "agotado", ejecutivos: [{ email: "a@b.cl", estado: "vinculado" }] }];
    expect(filterAvailable(soldOut)).toEqual([]);
  });

  it("deja solo ejecutivos vinculados", () => {
    const [project] = filterAvailable([
      {
        id: "1",
        estado: "disponible",
        ejecutivos: [
          { email: "vinculado@ei.cl", estado: "vinculado" },
          { email: "pendiente@ei.cl", estado: "pendiente" },
        ],
      },
    ]);
    expect(project.ejecutivos).toEqual([{ email: "vinculado@ei.cl", estado: "vinculado" }]);
  });

  it("no muta la lista de entrada", () => {
    const input = [
      { id: "1", estado: "disponible", ejecutivos: [{ email: "p@ei.cl", estado: "pendiente" }] },
    ];
    filterAvailable(input);
    expect(input[0].ejecutivos).toHaveLength(1);
  });

  it("tolera listas vacías o sin ejecutivos", () => {
    expect(filterAvailable([])).toEqual([]);
    expect(filterAvailable([{ id: "1", estado: "disponible" }])[0].ejecutivos).toEqual([]);
  });
});

// E3 — vínculo de ejecutivos con su inmobiliaria
describe("decideExecutiveBinding", () => {
  const projectInmobiliariaId = "aaaa";

  it("vincula a un ejecutivo sin inmobiliaria", () => {
    expect(
      decideExecutiveBinding({ execInmobiliariaId: null, projectInmobiliariaId }),
    ).toBe("bind");
  });

  it("acepta a un ejecutivo que ya pertenece a la misma inmobiliaria", () => {
    expect(
      decideExecutiveBinding({ execInmobiliariaId: "aaaa", projectInmobiliariaId }),
    ).toBe("ok_same");
  });

  it("rechaza a un ejecutivo de otra inmobiliaria", () => {
    expect(
      decideExecutiveBinding({ execInmobiliariaId: "bbbb", projectInmobiliariaId }),
    ).toBe("reject_conflict");
  });
});

// Alta de ejecutivos por el admin de la inmobiliaria
describe("validateExecutive", () => {
  const validExecutive = {
    full_name: "Ana Soto",
    email: "ana.soto@andes.cl",
    inmobiliaria_id: "11111111-1111-1111-1111-111111111111",
  };

  it("acepta un ejecutivo completo", () => {
    const { ok, errors } = validateExecutive(validExecutive);
    expect(ok).toBe(true);
    expect(errors).toEqual({});
  });

  it("exige nombre, correo e inmobiliaria", () => {
    const { ok, errors } = validateExecutive({});
    expect(ok).toBe(false);
    expect(Object.keys(errors).sort()).toEqual(["email", "full_name", "inmobiliaria_id"]);
  });

  it("rechaza correos mal formados", () => {
    expect(validateExecutive({ ...validExecutive, email: "ana.soto" }).errors.email).toBeTruthy();
    expect(validateExecutive({ ...validExecutive, email: "ana@soto" }).errors.email).toBeTruthy();
    expect(validateExecutive({ ...validExecutive, email: "a b@soto.cl" }).errors.email).toBeTruthy();
  });

  it("no acepta un nombre en blanco", () => {
    expect(validateExecutive({ ...validExecutive, full_name: "   " }).errors.full_name).toBeTruthy();
  });
});

describe("derivedTestPassword", () => {
  it("usa el texto antes del @", () => {
    expect(derivedTestPassword("testejecutivocomercial@email.com")).toBe("testejecutivocomercial");
    expect(derivedTestPassword("ana.soto@andes.cl")).toBe("ana.soto");
  });

  it("rellena hasta el mínimo de 6 caracteres que exige Supabase", () => {
    expect(derivedTestPassword("ab@x.com")).toBe("ab0000");
    expect(derivedTestPassword("exacto@x.com")).toBe("exacto");
  });

  it("tolera entradas vacías", () => {
    expect(derivedTestPassword("")).toBe("000000");
  });
});
