import { describe, expect, it } from "vitest";

import { initialCatalogProject } from "./ProjectsCatalog";

describe("HU13 projection-target catalog navigation", () => {
  const projects = [{ id: "target-1", nombre: "Proyecto objetivo" }];

  it("selects the requested target so its detail can open", () => {
    expect(initialCatalogProject(projects, "target-1")).toEqual({
      project: projects[0], unavailable: false,
    });
  });

  it("returns a safe unavailable state when the frozen target left the catalog", () => {
    expect(initialCatalogProject(projects, "removed-target")).toEqual({
      project: null, unavailable: true,
    });
  });
});
