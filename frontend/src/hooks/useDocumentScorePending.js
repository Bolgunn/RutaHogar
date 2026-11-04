import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocumentScoreStatus } from '../services/documentScore';

export function useDocumentScorePending(userId, revision) {
  const [status, setStatus] = useState(null);
  const generation = useRef(0);
  const report = useCallback((next) => {
    generation.current++;
    setStatus({ userId, pending: next.pending === true });
  }, [userId]);
  useEffect(() => {
    const version = ++generation.current;
    let active = true;
    if (userId) getDocumentScoreStatus().then((next) => {
      if (active && version === generation.current) setStatus({ userId, pending: next.pending === true });
    }).catch(() => { /* Keep a known pending notice until a successful authoritative read. */ });
    return () => { active = false; };
  }, [userId, revision]);
  return { pending: Boolean(userId && status?.userId === userId && status.pending), report };
}
