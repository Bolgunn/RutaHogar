import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), staff: vi.fn(), rpc: vi.fn() }));
vi.mock("../../utils/supabase", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("../profileService", () => ({ getAuthenticatedUser: mock.user, ensureUserProfile: vi.fn(), logSupabaseError: vi.fn() }));
vi.mock("../trackingService", () => ({ getStaffEvaluations: mock.staff, trackingRequest: vi.fn(), getTracking: vi.fn(), appendTrackingEvent: vi.fn(), annotateEvaluation: vi.fn(), newTrackingCommand: vi.fn() }));
import { getEvaluations } from "../evaluationService";
const data = (id) => ({ items: [{ id, user_id: id, financial_data: { result: { score: 80 } } }] });
beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockResolvedValue({ data: [] }); });
it("does not share an in-flight staff response between authenticated accounts", async () => {
 let resolveA;
 mock.user.mockResolvedValueOnce({ id: "staff-a" }).mockResolvedValueOnce({ id: "staff-b" });
 mock.staff.mockReturnValueOnce(new Promise(resolve => { resolveA = resolve; })).mockResolvedValueOnce(data("lead-b"));
 const a = getEvaluations(null, "ejecutivo");
 for(let i=0;i<5;i++) await Promise.resolve();
 const b = getEvaluations(null, "ejecutivo");
 for(let i=0;i<5;i++) await Promise.resolve();
 resolveA(data("lead-a"));
 const [first,second] = await Promise.all([a,b]);
 expect(first[0].user_id).toBe("lead-a"); expect(second[0].user_id).toBe("lead-b");
});
it("still coalesces concurrent reads for the same authenticated staff account", async () => {
 mock.user.mockResolvedValue({ id: "staff-c" });
 let resolve; mock.staff.mockReturnValueOnce(new Promise(done => { resolve=done; }));
 const a=getEvaluations(null,"ejecutivo"), b=getEvaluations(null,"ejecutivo");
 for(let i=0;i<6;i++) await Promise.resolve();
 resolve(data("lead-c")); await Promise.all([a,b]);
 expect(mock.staff).toHaveBeenCalledTimes(1);
});
