import { beforeEach, describe, expect, it, vi } from "vitest";

const trackingRequest = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../trackingService", () => ({ trackingRequest }));

import { getTeam, getTeamHistory, setTeamMemberAccess, setTeamMemberRole, updateTeamMember } from "../teamService";

describe("teamService", () => {
  beforeEach(() => trackingRequest.mockClear());

  it("never names a tenant unless the page was given one", () => {
    getTeam();
    expect(trackingRequest).toHaveBeenLastCalledWith("/staff/team", undefined);
    getTeam("tenant-1");
    expect(trackingRequest).toHaveBeenLastCalledWith("/staff/team?inmobiliaria_id=tenant-1", undefined);
  });

  it("sends the writes each endpoint expects", () => {
    updateTeamMember("m1", { nombre: "Ana", telefono: "" });
    expect(trackingRequest).toHaveBeenLastCalledWith("/staff/team/m1", { nombre: "Ana", telefono: "" }, { method: "PATCH" });
    setTeamMemberRole("m1", "admin_inmobiliario", "t1");
    expect(trackingRequest).toHaveBeenLastCalledWith("/staff/team/m1/role?inmobiliaria_id=t1", { rol: "admin_inmobiliario" });
    setTeamMemberAccess("m1", "desactivado");
    expect(trackingRequest).toHaveBeenLastCalledWith("/staff/team/m1/access", { estado: "desactivado" });
  });

  it("filters the history by person and page", () => {
    getTeamHistory(undefined, { miembroId: "m1", cursor: 50 });
    expect(trackingRequest).toHaveBeenLastCalledWith("/staff/team/history?miembro_id=m1&cursor=50", undefined);
  });
});
