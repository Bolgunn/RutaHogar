import { describe, expect, it } from "vitest";
import { validateProject } from "../projectValidation";

// CATALOGO-UNICO — `descripcion` y `entrega_estimada`. Archivo aparte de
// projectCatalog.test.js a propósito: esa suite cubre el contrato de HU 7 tal
// como se congeló y no se toca aquí.
const validProject = {
  nombre: "Parque Ñuñoa",
  inmobiliaria_id: "11111111-1111-1111-1111-111111111111",
  comuna: "Ñuñoa",
  tipo: "departamento",
  estado: "disponible",
  precio_min_uf: 4200,
  precio_max_uf: 6800,
};

describe("validateProject — campos comerciales", () => {
  it("los acepta ausentes: las filas anteriores a la migración están en NULL", () => {
    const { ok, errors } = validateProject(validProject);
    expect(ok).toBe(true);
    expect(errors.descripcion).toBeUndefined();
    expect(errors.entrega_estimada).toBeUndefined();
  });

  it("los acepta vacíos", () => {
    const { ok } = validateProject({ ...validProject, descripcion: "", entrega_estimada: "" });
    expect(ok).toBe(true);
  });

  it("acepta una descripción dentro del tope", () => {
    const { ok } = validateProject({ ...validProject, descripcion: "x".repeat(500) });
    expect(ok).toBe(true);
  });

  it("rechaza una descripción sobre el tope", () => {
    const { ok, errors } = validateProject({ ...validProject, descripcion: "x".repeat(501) });
    expect(ok).toBe(false);
    expect(errors.descripcion).toBeTruthy();
  });

  it("no cuenta los espacios de los extremos contra el tope", () => {
    const { ok } = validateProject({ ...validProject, descripcion: `  ${"x".repeat(500)}  ` });
    expect(ok).toBe(true);
  });

  it("acepta un mes de entrega bien formado", () => {
    expect(validateProject({ ...validProject, entrega_estimada: "2027-01" }).ok).toBe(true);
    expect(validateProject({ ...validProject, entrega_estimada: "2026-12" }).ok).toBe(true);
  });

  it("rechaza un mes fuera de 01–12", () => {
    const cero = validateProject({ ...validProject, entrega_estimada: "2027-00" });
    expect(cero.ok).toBe(false);
    expect(cero.errors.entrega_estimada).toBeTruthy();

    const trece = validateProject({ ...validProject, entrega_estimada: "2027-13" });
    expect(trece.ok).toBe(false);
    expect(trece.errors.entrega_estimada).toBeTruthy();
  });

  it("rechaza formatos que no son AAAA-MM", () => {
    ["2027", "27-01", "2027/01", "2027-1", "enero 2027", "2027-01-15"].forEach((valor) => {
      const { ok, errors } = validateProject({ ...validProject, entrega_estimada: valor });
      expect(ok, valor).toBe(false);
      expect(errors.entrega_estimada, valor).toBeTruthy();
    });
  });
});
