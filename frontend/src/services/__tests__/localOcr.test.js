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

it('local resumes an existing job by polling without starting it again', async () => {
  const request = vi.fn().mockResolvedValueOnce({ id: 'synthetic', state: 'processing' })
    .mockResolvedValueOnce({ provider: 'local', state: 'awaiting_review', revision: 3 })
    .mockResolvedValueOnce({ id: 'synthetic', state: 'awaiting_review', candidates: [] });
  const wait = vi.fn().mockResolvedValue();
  const result = await processDocument({ id: 'synthetic' }, { provider: 'local', consent: true, request, wait });
  expect(result.state).toBe('awaiting_review');
  expect(request.mock.calls.some(([path]) => path.endsWith('/ocr/start'))).toBe(false);
  expect(request.mock.calls.some(([path]) => path.endsWith('/ocr/poll'))).toBe(true);
});


it('local ocr_ready waits for persisted review without calling parse or start', async () => {
  const request = vi.fn().mockResolvedValueOnce({id:'synthetic',state:'ocr_ready'})
    .mockResolvedValueOnce({provider:'local',state:'awaiting_review',revision:3})
    .mockResolvedValueOnce({id:'synthetic',state:'awaiting_review',candidates:[]});
  await processDocument({id:'synthetic'},{provider:'local',consent:true,request,wait:async()=>{}});
  expect(request.mock.calls.some(([path])=>path.endsWith('/parse')||path.endsWith('/ocr/start'))).toBe(false);
});

it('reports a real local worker failure instead of polling forever', async () => {
  const request = vi.fn().mockResolvedValueOnce({id:'synthetic',state:'processing'})
    .mockResolvedValueOnce({provider:'local',state:'processing',status:'retry_wait'});
  await expect(processDocument({id:'synthetic'},{provider:'local',consent:true,request,wait:async()=>{}}))
    .rejects.toThrow('servicio OCR no pudo completar');
  expect(request.mock.calls.some(([path])=>path.endsWith('/ocr/start'))).toBe(false);
});
