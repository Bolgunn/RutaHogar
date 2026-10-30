import { afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ state: null, ref: { current: 0 }, effects: [] }));
vi.mock('react', () => ({
  useState: () => [hooks.state, next => { hooks.state = next; }],
  useRef: () => hooks.ref,
  useCallback: callback => callback,
  useEffect: callback => { hooks.effects.push(callback); },
}));
vi.mock('../services/documentScore', () => ({ getDocumentScoreStatus: vi.fn() }));
import { getDocumentScoreStatus } from '../services/documentScore';
import { useDocumentScorePending } from './useDocumentScorePending';

afterEach(() => { hooks.state = null; hooks.ref.current = 0; hooks.effects = []; vi.resetAllMocks(); });

it('consulta sin recalcular y conserva el pendiente conocido ante errores de lectura', async () => {
  getDocumentScoreStatus.mockResolvedValue({ pending: true });
  useDocumentScorePending('lead', 0); hooks.effects.at(-1)(); await Promise.resolve();
  expect(useDocumentScorePending('lead', 0).pending).toBe(true);
  getDocumentScoreStatus.mockRejectedValue(new Error('offline'));
  hooks.effects.at(-1)(); await Promise.resolve(); await Promise.resolve();
  expect(useDocumentScorePending('lead', 1).pending).toBe(true);
});

it('una lectura antigua no repone el aviso después de actualizar correctamente', async () => {
  let resolve;
  getDocumentScoreStatus.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = useDocumentScorePending('lead', 0); hooks.effects.at(-1)();
  view.report({ pending: false }); resolve({ pending: true }); await Promise.resolve();
  expect(useDocumentScorePending('lead', 0).pending).toBe(false);
});

it('no muestra el pendiente de otra sesión ni consulta sin usuario', () => {
  useDocumentScorePending('lead', 0).report({ pending: true });
  expect(useDocumentScorePending('other', 0).pending).toBe(false);
  expect(useDocumentScorePending(null, 0).pending).toBe(false);
  hooks.effects.at(-1)(); expect(getDocumentScoreStatus).not.toHaveBeenCalled();
});

it('una lectura sin cambios no muestra aviso y una nueva consulta recupera el pendiente persistido', async () => {
  getDocumentScoreStatus.mockResolvedValueOnce({ pending: false }).mockResolvedValueOnce({ pending: true });
  useDocumentScorePending('lead', 0); hooks.effects.at(-1)(); await Promise.resolve();
  expect(useDocumentScorePending('lead', 0).pending).toBe(false);
  hooks.state = null; hooks.ref.current = 0; hooks.effects = [];
  useDocumentScorePending('lead', 0); hooks.effects.at(-1)(); await Promise.resolve();
  expect(useDocumentScorePending('lead', 0).pending).toBe(true);
  useDocumentScorePending('lead', 0).report({ pending: false });
  expect(useDocumentScorePending('lead', 0).pending).toBe(false);
});
