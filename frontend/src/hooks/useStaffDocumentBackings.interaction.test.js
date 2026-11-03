import { expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ effects: [], value: null }));
vi.mock('react', async original => ({
  ...await original(),
  useMemo: factory => factory(),
  useEffect: effect => hooks.effects.push(effect),
  useState: initial => [initial, value => { hooks.value = value; }],
}));
vi.mock('../services/documentBacking', () => ({ getStaffDocumentBackings: vi.fn() }));
import useStaffDocumentBackings from './useStaffDocumentBackings';
import { getStaffDocumentBackings } from '../services/documentBacking';

it('el efecto real del hook agrupa 100 leads en una petición', async () => {
  const ids = Array.from({length:100}, (_, index) => `lead-${index}`);
  getStaffDocumentBackings.mockImplementation(async input => Object.fromEntries(input.map(id => [id, {fields:[]}])));
  useStaffDocumentBackings(ids, 'staff-tenant');
  expect(hooks.effects).toHaveLength(1);
  hooks.effects[0]();
  await vi.waitFor(() => expect(hooks.value && Object.keys(hooks.value.projections)).toHaveLength(100));
  expect(getStaffDocumentBackings).toHaveBeenCalledOnce();
  expect(getStaffDocumentBackings.mock.calls[0][0]).toHaveLength(100);
});
