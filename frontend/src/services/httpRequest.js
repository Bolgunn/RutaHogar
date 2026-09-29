const configuredTimeout = Number(import.meta.env.VITE_TRACKING_REQUEST_TIMEOUT_MS);
export const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15_000;

export class RequestTimeoutError extends Error {
  constructor(message = "La solicitud tardó demasiado. Intenta nuevamente.") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export function withTimeout(promise, timeoutMs = REQUEST_TIMEOUT_MS, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new RequestTimeoutError(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// Keep the deadline alive until the JSON body has been read too. A fetch can
// resolve on headers while a stalled body would otherwise leave the UI waiting.
export async function fetchJsonWithTimeout(url, init = {}, {
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
  timeoutMessage,
} = {}) {
  const controller = new AbortController();
  let timeoutId;
  const request = (async () => {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const payload = await response.json();
    return { response, payload };
  })();
  // AbortController is necessary for real browser fetches, but a service
  // worker/proxy can still leave its promise unresolved after abort. Race the
  // promise too, so React state is always released at the deadline.
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError(timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([request, timeout]);
  } catch (cause) {
    if (cause instanceof RequestTimeoutError || controller.signal.aborted) {
      throw cause instanceof RequestTimeoutError ? cause : new RequestTimeoutError(timeoutMessage);
    }
    throw cause;
  } finally {
    clearTimeout(timeoutId);
  }
}
