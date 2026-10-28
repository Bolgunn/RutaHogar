import { expect, it, vi } from 'vitest';
vi.mock('../../utils/supabase', () => ({ supabase: null }));
import { processDocument } from '../documentReview';

it('local reaches persisted review from explicit start without polling, scoring or confirmation', async () => {
  const review = { id: 'synthetic', state: 'awaiting_review', candidates: [
    { field: 'ingreso_mensual', declared_value: 1000000, detected_value: 1200000, comparison: 'difference' },
  ] };
  const request = vi.fn().mockResolvedValueOnce({ ...review, state: 'ready' })
    .mockResolvedValueOnce({ provider: 'local', state: 'awaiting_review', revision: 3 })
    .mockResolvedValueOnce(review);
  const wait = vi.fn();
  expect(await processDocument(review, { provider: 'local', consent: true, request, wait })).toEqual(review);
  expect(wait).not.toHaveBeenCalled();
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/documents/sessions/synthetic', '/documents/sessions/synthetic/ocr/start', '/documents/sessions/synthetic',
  ]);
});

it('local retry is user driven and does not loop when another request owns the lease', async () => {
  const request = vi.fn().mockResolvedValueOnce({ id: 'synthetic', state: 'processing' })
    .mockResolvedValueOnce({ provider: 'local', state: 'processing' });
  const wait = vi.fn();
  await expect(processDocument({ id: 'synthetic' }, { provider: 'local', consent: true, request, wait }))
    .rejects.toThrow('vuelve a pulsar');
  expect(wait).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(2);
});
