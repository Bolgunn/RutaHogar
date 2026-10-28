import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase no está configurado. Revisa las variables de entorno.');
}

if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-ignore
  globalThis.WebSocket = class DummyWebSocket {
    static CLOSED = 3;
    readyState = 3;
    addEventListener() {}
    removeEventListener() {}
    close() {}
    send() {}
  };
}

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          lock: async (_name, _acquireTimeout, fn) => {
            return await fn();
          },
        },
      })
    : null;
