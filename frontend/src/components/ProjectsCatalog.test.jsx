import { describe, expect, it } from "vitest";

import { initialCatalogProject, initialProjectNavigation } from "./ProjectsCatalog";

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

  it("consumes an initial project only once despite a later portal catalog update", () => {
    const first = initialProjectNavigation({
      projectId: "target-1", projects, catalogLoading: false, portalLoading: true, consumedProjectId: null,
    });
    expect(first).toMatchObject({ project: projects[0], unavailable: false, consume: true });

    // The person closes the modal. A later portal response must not replay A.
    const afterPortalLoad = initialProjectNavigation({
      projectId: "target-1", projects: [...projects, { id: "portal-2", nombre: "Portal" }],
      catalogLoading: false, portalLoading: false, consumedProjectId: "target-1",
    });
    expect(afterPortalLoad).toEqual({ project: null, unavailable: false, consume: false });
  });

  it("waits for asynchronous lists and applies a different navigation target once", () => {
    expect(initialProjectNavigation({
      projectId: "target-2", projects, catalogLoading: false, portalLoading: true, consumedProjectId: "target-1",
    })).toEqual({ project: null, unavailable: false, consume: false });

    const next = initialProjectNavigation({
      projectId: "target-2", projects: [...projects, { id: "target-2", nombre: "Nuevo objetivo" }],
      catalogLoading: false, portalLoading: false, consumedProjectId: "target-1",
    });
    expect(next).toMatchObject({ project: { id: "target-2" }, unavailable: false, consume: true });
  });
});
