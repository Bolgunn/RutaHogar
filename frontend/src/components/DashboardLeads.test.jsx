import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: [], loading: false, error: "", refresh: vi.fn(), load: null }));
vi.mock("../hooks/useStaffProjectionRead", () => ({ default: ({ load }) => { state.load = load; return state; } }));
vi.mock("../services/evaluationService", () => ({ getEvaluations: vi.fn() }));
import { getEvaluations } from "../services/evaluationService";
import DashboardLeads from "./DashboardLeads";
it("integrates the backend badges and the exact participation options in the commercial inbox", () => {
  state.data = ["individual", "bipersonal_confirmed", "declared_complement", "unverifiable_origin"].map((type, index) => ({ id: String(index), user_id: `lead-${index}`, full_name: `Prospecto ${index}`, result: { score: 80, classification: "Alto" }, input: {}, co_debtor: { version: "hu30-projection-v1", evaluation_type: type } }));
  const html = renderToStaticMarkup(<DashboardLeads role="ejecutivo" staffScopeKey="staff" />);
  expect(html).toContain("Participación financiera");
  expect(html).toContain('<option value="all" selected="">Todos</option>');
  expect(html).toContain('<option value="individual">Titular individual</option>');
  expect(html).toContain('<option value="bipersonal_confirmed">Con co-deudor</option>');
  for (const label of ["Titular individual", "Bipersonal confirmado", "Complemento declarado", "Origen no verificable"]) expect(html).toContain(label);
  expect(html.match(/staff-participation-badge is-bipersonal_confirmed/g)).toHaveLength(1);
});

it("keeps the authorized contact enrichment when loading the staff projection", async () => {
  getEvaluations.mockResolvedValue([]);
  renderToStaticMarkup(<DashboardLeads role="ejecutivo" staffScopeKey="staff" />);
  await state.load();
  expect(getEvaluations).toHaveBeenCalledWith(null, "ejecutivo");
});
