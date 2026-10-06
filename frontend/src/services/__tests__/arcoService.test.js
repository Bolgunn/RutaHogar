import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUserProfile: vi.fn(),
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  insert: vi.fn(),
  invoke: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock("../../utils/supabase", () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("../profileService", () => ({
  ensureUserProfile: mocks.ensureUserProfile,
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isSupabaseDataConfigured: true,
  logSupabaseError: mocks.logSupabaseError,
}));

import { submitArcoRequest } from "../arcoService";

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";
const CALLER_SUPPLIED_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function installBrowserStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  globalThis.window = { crypto: { randomUUID: () => REQUEST_ID } };
}

describe("submitArcoRequest", () => {
  beforeEach(() => {
    installBrowserStorage();
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: SESSION_USER_ID });
    mocks.ensureUserProfile.mockResolvedValue(undefined);
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: REQUEST_ID,
              user_id: SESSION_USER_ID,
              tipo: "acceso",
              email: "persona@example.com",
              descripcion: "Solicito una copia de mis datos.",
              estado: "pendiente",
              created_at: "2026-10-06T00:00:00.000Z",
            },
            error: null,
          }),
      }),
    });
  });

  it("usa la identidad autenticada y solo entrega el id a la Edge Function", async () => {
    await submitArcoRequest({
      tipo: "acceso",
      email: "persona@example.com",
      descripcion: "Solicito una copia de mis datos.",
      userId: CALLER_SUPPLIED_ID,
    });

    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: SESSION_USER_ID,
      tipo: "acceso",
      email: "persona@example.com",
      descripcion: "Solicito una copia de mis datos.",
      estado: "pendiente",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("notify-admin-arco", {
      body: { request_id: REQUEST_ID },
    });
  });
});
