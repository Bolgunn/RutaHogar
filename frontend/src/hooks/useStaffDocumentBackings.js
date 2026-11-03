import { useEffect, useMemo, useState } from 'react';
import { getStaffDocumentBackings } from '../services/documentBacking';

// A loader belongs to one staff scope. Calls made together share a bounded request.
export function createStaffBackingLoader(request = getStaffDocumentBackings) {
  const cache = new Map();
  let queue = [];
  let scheduled = false;
  async function flush() {
    scheduled = false;
    const pending = queue; queue = [];
    for (let offset = 0; offset < pending.length; offset += 100) {
      const chunk = pending.slice(offset, offset + 100);
      try {
        const result = await request(chunk.map(item => item.id));
        for (const item of chunk) {
          if (Object.hasOwn(result, item.id)) item.resolve(result[item.id]);
          else { if (cache.get(item.id) === item.promise) cache.delete(item.id); item.reject(new Error('backing_unavailable')); }
        }
      } catch (error) {
        for (const item of chunk) {
          if (cache.get(item.id) === item.promise) cache.delete(item.id);
          item.reject(error);
        }
      }
    }
  }
  return (id, { refresh = false } = {}) => {
    if (refresh) cache.delete(id);
    if (!cache.has(id)) {
      let resolve, reject;
      const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
      cache.set(id, promise); queue.push({ id, promise, resolve, reject });
      if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    }
    return cache.get(id);
  };
}

export default function useStaffDocumentBackings(leadIds, scope) {
  const load = useMemo(() => createStaffBackingLoader(), [scope]);
  const [state, setState] = useState(null);
  const key = JSON.stringify([...new Set(leadIds.filter(Boolean))].sort());
  useEffect(() => {
    let active = true;
    const ids = JSON.parse(key);
    Promise.allSettled(ids.map(id => load(id))).then(results => {
      if (!active) return;
      const projections = {};
      results.forEach((result, index) => { if (result.status === 'fulfilled') projections[ids[index]] = result.value; });
      setState({ load, projections });
    });
    return () => { active = false; };
  }, [key, load]);
  return { projections: state?.load === load ? state.projections : {}, load };
}
