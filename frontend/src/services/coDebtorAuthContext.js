// A browser convenience, never authorization. Only a fixed invitation route is returned.
const KEY = "RutaHogar_co_debtor_auth_context";
const TTL = 24 * 60 * 60 * 1000;
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,512}$/;
export const INVITATION_PATH = "/co-deudor/invitacion";

export function invitationReturnPath(nonce) {
  return NONCE.test(nonce || "") ? `${INVITATION_PATH}?context=${encodeURIComponent(nonce)}` : null;
}

export function invitationEmailRedirect(nonce) {
  const path = invitationReturnPath(nonce);
  if (!path) throw new Error("El contexto de invitación no está disponible.");
  return new URL(path, window.location.origin).href;
}

export function captureInvitationContext(location = window.location, storage = localStorage,
                                         history = window.history, now = Date.now()) {
  try {
    // Remove abandoned return contexts without invalidating another open tab.
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (!key?.startsWith(`${KEY}:`)) continue;
      try {
        const saved = JSON.parse(storage.getItem(key));
        if (!Number.isFinite(saved?.createdAt) || now - saved.createdAt >= TTL) storage.removeItem(key);
      } catch { storage.removeItem(key); }
    }
    const query = new URLSearchParams(location.search);
    if (query.has("token")) {
      const token = query.get("token");
      if (!TOKEN.test(token || "")) return null;
      const context = { nonce: crypto.randomUUID(), token, createdAt: now };
      storage.setItem(`${KEY}:${context.nonce}`, JSON.stringify(context));
      // Remove the bearer capability from the address bar before auth/navigation.
      history.replaceState(null, "", invitationReturnPath(context.nonce) + (location.hash || ""));
      return context;
    }
    const nonce = query.get("context");
    if (!NONCE.test(nonce || "")) return null;
    const contextKey = `${KEY}:${nonce}`;
    const stored = storage.getItem(contextKey);
    // Read callbacks created before the per-tab fix without inventing a new context.
    const selectedKey = stored ? contextKey : KEY;
    const context = JSON.parse(stored || storage.getItem(KEY) || "null");
    if (context && Number.isFinite(context.createdAt) && now - context.createdAt >= TTL) {
      storage.removeItem(selectedKey);
      return null;
    }
    if (!context || query.get("context") !== context.nonce || !NONCE.test(context.nonce)
      || !TOKEN.test(context.token) || !Number.isFinite(context.createdAt)
      || now < context.createdAt || now - context.createdAt >= TTL) return null;
    return context;
  } catch {
    return null;
  }
}
