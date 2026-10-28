import { useEffect, useMemo, useState } from 'react';
import { getStaffDocumentBacking } from '../services/documentBacking';

// Owned by one commercial list/scope, never shared between authenticated sessions.
// Detail and cards reuse the same sanitized projection and in-flight request.
export function createStaffBackingLoader(request = getStaffDocumentBacking) {
  const cache = new Map();
  return (leadId, { refresh = false } = {}) => {
    if (refresh) cache.delete(leadId);
    if (!cache.has(leadId)) {
      const pending = Promise.resolve().then(() => request(leadId)).catch(error => {
        if (cache.get(leadId) === pending) cache.delete(leadId);
        throw error;
      });
      cache.set(leadId, pending);
    }
    return cache.get(leadId);
  };
}

export default function useStaffDocumentBackings(leadIds, scope) {
  const load = useMemo(() => createStaffBackingLoader(), [scope]);
  const [state, setState] = useState(null);
  const key = JSON.stringify([...new Set(leadIds.filter(Boolean))].sort());
  useEffect(() => {
    let active = true;
    const queue = JSON.parse(key);
    const worker = async () => {
      while (active && queue.length) {
        const id = queue.shift();
        try {
          const projection = await load(id);
          if (active) setState(old => ({ load, projections: { ...(old?.load === load ? old.projections : {}), [id]: projection } }));
        } catch { /* Unknown/unauthorized is never displayed as "Sin respaldo" or validated. */ }
      }
    };
    // Bound parallelism; only request leads actually rendered in the list.
    const workers = Math.min(4, queue.length);
    for (let i = 0; i < workers; i++) worker();
    return () => { active = false; };
  }, [key, load]);
  return { projections: state?.load === load ? state.projections : {}, load };
}
