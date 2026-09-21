import { describe, expect, it } from "vitest";

import { fetchJsonWithTimeout, RequestTimeoutError, withTimeout } from "../httpRequest";

const neverRespondingFetch = (_url, init) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
});

const abortIgnoringFetch = () => new Promise(() => {});

describe("bounded HU13 HTTP requests", () => {
  it("aborts a request that never answers instead of leaving a saving flag pending", async () => {
    await expect(fetchJsonWithTimeout("/tracking/events", {}, {
      timeoutMs: 5, fetchImpl: neverRespondingFetch, timeoutMessage: "Tiempo agotado",
    })).rejects.toEqual(expect.objectContaining({ name: "RequestTimeoutError", message: "Tiempo agotado" }));
  });

  it("settles even when an intermediary ignores AbortController", async () => {
    await expect(fetchJsonWithTimeout("/tracking", {}, {
      timeoutMs: 5, fetchImpl: abortIgnoringFetch, timeoutMessage: "Intermediario agotado",
    })).rejects.toEqual(expect.objectContaining({ name: "RequestTimeoutError", message: "Intermediario agotado" }));
  });

  it("bounds a stalled session lookup so progress can render a controlled error", async () => {
    await expect(withTimeout(new Promise(() => {}), 5, "Sesión agotada"))
      .rejects.toEqual(expect.objectContaining({ name: "RequestTimeoutError", message: "Sesión agotada" }));
  });

  it("keeps ordinary server failures distinct from a timeout", async () => {
    await expect(fetchJsonWithTimeout("/tracking", {}, {
      timeoutMs: 50, fetchImpl: async () => { throw new Error("offline"); },
    })).rejects.toThrow("offline");
    expect(new RequestTimeoutError()).toBeInstanceOf(Error);
  });
});
