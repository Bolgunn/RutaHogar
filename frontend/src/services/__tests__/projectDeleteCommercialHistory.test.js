import { describe, expect, it, vi } from "vitest";

// lead_project_commercial_stage tiene ON DELETE RESTRICT hacia proyectos
// (docs/stories/commercial-stage-project-tracks/PLAN.md, Q4): borrar un proyecto con registros
// comerciales falla con 23503 y la interfaz debe proponer marcarlo agotado.
const deleteResult = { error: null };

vi.mock("../profileService", () => ({ isSupabaseDataConfigured: true, logSupabaseError: vi.fn() }));
vi.mock("../../utils/supabase", () => ({
  supabase: {
    from: (table) => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      delete: () => ({ eq: async () => (table === "proyectos" ? deleteResult : { error: null }) }),
    }),
  },
}));

const { deleteProject } = await import("../projectService");

describe("deleteProject with commercial history", () => {
  it("explains that a project with commercial records must be marked sold out", async () => {
    deleteResult.error = { code: "23503", message: "update or delete on table \"proyectos\" violates foreign key constraint" };
    await expect(deleteProject("p1")).rejects.toThrow(
      "Este proyecto tiene historial comercial y no se puede eliminar; márcalo como agotado.",
    );
  });

  it("keeps other database errors as they are", async () => {
    deleteResult.error = { code: "42501", message: "permission denied for table proyectos" };
    await expect(deleteProject("p1")).rejects.toThrow("permission denied for table proyectos");
  });

  it("deletes a project without records", async () => {
    deleteResult.error = null;
    await expect(deleteProject("p1")).resolves.toBe(true);
  });
});
