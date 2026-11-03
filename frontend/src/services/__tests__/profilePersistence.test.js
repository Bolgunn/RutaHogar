import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn(), upsert: vi.fn() }));
vi.mock("../../utils/supabase", () => ({ supabase: { from: mock.from } }));
import { upsertProfile } from "../profileService";
it("updates existing staff without invoking the privileged-profile INSERT guard", async () => {
 const id="11111111-1111-4111-8111-111111111111";
 const table={select:mock.select,eq:mock.eq,maybeSingle:mock.maybeSingle,update:mock.update,upsert:mock.upsert};
 for(const name of ["from","select","eq","update","upsert"]) mock[name].mockReturnValue(table);
 mock.maybeSingle.mockResolvedValue({data:{id,role:"ejecutivo",full_name:"Ejecutivo"},error:null});
 await upsertProfile(id,"Ejecutivo","ejecutivo",null,{birth_date:"1990-01-01"});
 expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({role:"ejecutivo",birth_date:"1990-01-01"}));
 expect(mock.upsert).not.toHaveBeenCalled();
});
