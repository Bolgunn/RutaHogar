import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), trackingRequest: vi.fn() }));
vi.mock("../../utils/supabase", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("../profileService", () => ({
  isSupabaseDataConfigured: true,
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner" })),
  ensureUserProfile: vi.fn(), logSupabaseError: vi.fn(),
}));
vi.mock("../trackingService", () => ({ trackingRequest: mocks.trackingRequest, annotateEvaluation: vi.fn() }));

import { getGoals } from "../goalsService";
import { listMortgageScenarios } from "../mortgageScenarioService";
import { getScoringHistoryByEvaluation } from "../getScoringHistory";
import { normalizeLeadCoDebtorInvitation } from "../coDebtorService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
});

it("does not restore sensitive goal progress from local cache after server redaction", async () => {
  localStorage.getItem.mockReturnValue(JSON.stringify({ "owner:goal": { target_value: 1400000 } }));
  mocks.rpc.mockResolvedValue({ data: [{ id: "goal", user_id: "owner", evaluation_id: "evaluation",
    title: "Meta histórica", progress_data: { hu30_visibility: "hidden" } }], error: null });
  const goals = await getGoals("owner", "evaluation");
  expect(goals[0].progress_data).toEqual({ hu30_visibility: "hidden" });
  expect(JSON.stringify(goals)).not.toContain("1400000");
  expect(mocks.from).not.toHaveBeenCalled();
});

it("preserves scenario identity while honoring server-hidden snapshots", async () => {
  const scenario = { id: "scenario", input_snapshot: {}, result_snapshot: { financial_status: "Histórico no disponible" } };
  mocks.rpc.mockResolvedValue({ data: [scenario], error: null });
  expect(await listMortgageScenarios("evaluation")).toEqual([scenario]);
  expect(mocks.rpc).toHaveBeenCalledWith("hu30_list_mortgage_scenarios", { p_evaluation_id: "evaluation" });
  expect(mocks.from).not.toHaveBeenCalled();
});

it("uses the owner-or-staff authorized history fallback and does not bypass a denial", async () => {
  mocks.trackingRequest.mockRejectedValue(new Error("owner_mismatch"));
  await expect(getScoringHistoryByEvaluation("evaluation")).rejects.toThrow("owner_mismatch");
  expect(mocks.trackingRequest).toHaveBeenCalledWith("/evaluations/evaluation/history");
  expect(mocks.from).not.toHaveBeenCalled();
});

it("rejects an ambiguous confirmation projection instead of choosing the first row", () => {
  expect(() => normalizeLeadCoDebtorInvitation({ status: "confirmed",
    co_debtor_confirmations: [{ id: "v1" }, { id: "v2" }] })).toThrow("ambigua");
});
