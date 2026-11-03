import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  signInWithPassword: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../utils/supabase", () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: mocks.maybeSingle,
  };
  return {
    supabase: {
      from: () => ({
        select: query.select,
        upsert: (row) => {
          mocks.upsert(row);
          return query;
        },
        update: (row) => {
          mocks.update(row);
          return query;
        },
      }),
      auth: { signInWithPassword: mocks.signInWithPassword },
    },
  };
});

import { signIn } from "../auth";
import { ensureUserProfile } from "../profileService";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const USER_ID = "11111111-1111-4111-8111-111111111111";
const staffMetadataUser = { id: USER_ID, email: "lead@example.invalid", user_metadata: { role: "admin" } };

describe("user_metadata.role no decide el rol", () => {
  beforeEach(() => {
    mocks.maybeSingle.mockReset();
    mocks.signInWithPassword.mockReset();
    mocks.upsert.mockReset();
    mocks.update.mockReset();
  });

  it("crea el perfil faltante como usuario aunque la metadata diga admin", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: USER_ID, role: "usuario" }, error: null });

    const profile = await ensureUserProfile(staffMetadataUser);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].role).toBe("usuario");
    expect(profile.role).toBe("usuario");
  });

  it("al completar datos de contacto conserva el rol guardado, no el de la metadata", async () => {
    const stored = { id: USER_ID, role: "ejecutivo", full_name: "Ejecutiva" };
    mocks.maybeSingle.mockResolvedValue({ data: stored, error: null });

    await ensureUserProfile({ ...staffMetadataUser, user_metadata: { role: "admin", phone: "+56911111111" } });

    // Existing profiles take the UPDATE path: the guard rejects privileged INSERT ON CONFLICT.
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update.mock.calls[0][0].role).toBe("ejecutivo");
  });

  it("si el perfil no se puede leer, la sesión local no asume el rol de la metadata", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: staffMetadataUser, session: { access_token: "token" } },
      error: null,
    });
    mocks.maybeSingle.mockRejectedValue(new Error("sin red"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { profile } = await signIn({ email: staffMetadataUser.email, password: "x" });

    expect(profile.role).toBe("usuario");
  });
});
