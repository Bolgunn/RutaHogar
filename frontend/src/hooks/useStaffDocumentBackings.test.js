import { expect, it, vi } from 'vitest';
import { createStaffBackingLoader } from './useStaffDocumentBackings';

it('reutiliza proyección y petición entre tarjetas del mismo lead y su detalle', async () => {
  const projection = { fields: [] };
  const request = vi.fn().mockResolvedValue(projection);
  const load = createStaffBackingLoader(request);
  const card = load('lead'); const detail = load('lead');
  expect(card).toBe(detail);
  await expect(detail).resolves.toBe(projection);
  await expect(load('lead')).resolves.toBe(projection);
  expect(request).toHaveBeenCalledOnce();
});
it('permite reintentar un error y consultar explícitamente un estado nuevo', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('forbidden')).mockResolvedValue({ fields: [] });
  const load = createStaffBackingLoader(request);
  await expect(load('lead')).rejects.toThrow('forbidden');
  await load('lead'); await load('lead', { refresh: true });
  expect(request).toHaveBeenCalledTimes(3);
});
it('aísla el caché por instancia comercial y lead', async () => {
  const request = vi.fn().mockResolvedValue({ fields: [] });
  const actorA = createStaffBackingLoader(request); const actorB = createStaffBackingLoader(request);
  await Promise.all([actorA('lead'), actorA('other'), actorB('lead')]);
  expect(request).toHaveBeenCalledTimes(3);
});
