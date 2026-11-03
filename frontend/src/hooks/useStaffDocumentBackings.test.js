import { expect, it, vi } from 'vitest';
import { createStaffBackingLoader } from './useStaffDocumentBackings';

it('carga 100 leads en una sola petición y comparte tarjeta/detalle', async () => {
  const request = vi.fn(async ids => Object.fromEntries(ids.map(id => [id, { fields: [] }])));
  const load = createStaffBackingLoader(request);
  const ids = Array.from({ length: 100 }, (_, i) => `lead-${i}`);
  const first = load(ids[0]); expect(load(ids[0])).toBe(first);
  await Promise.all([first, ...ids.slice(1).map(id => load(id))]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toHaveLength(100);
});
it('divide más de 100 y rechaza un lead omitido sin agregar datos falsos', async () => {
  const request = vi.fn(async ids => Object.fromEntries(ids.filter(id => id !== 'denied').map(id => [id, { fields: [] }])));
  const load = createStaffBackingLoader(request);
  const results = await Promise.allSettled([...Array.from({ length: 100 }, (_, i) => load(`id-${i}`)), load('denied')]);
  expect(request).toHaveBeenCalledTimes(2);
  expect(results.at(-1).status).toBe('rejected');
});
it('permite reintentar errores y refrescar explícitamente', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ lead: { fields: [] } });
  const load = createStaffBackingLoader(request);
  await expect(load('lead')).rejects.toThrow('unavailable');
  await load('lead'); await load('lead', { refresh: true });
  expect(request).toHaveBeenCalledTimes(3);
});
it('aísla el caché por instancia comercial', async () => {
  const request = vi.fn(async ids => Object.fromEntries(ids.map(id => [id, { fields: [] }])));
  const a = createStaffBackingLoader(request), b = createStaffBackingLoader(request);
  await Promise.all([a('lead'), a('other'), b('lead')]);
  expect(request).toHaveBeenCalledTimes(2);
});
