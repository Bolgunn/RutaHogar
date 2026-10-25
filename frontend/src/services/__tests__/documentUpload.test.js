import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('../../utils/supabase', () => ({ supabase: null }));
vi.mock('../trackingService', () => ({ trackingRequest: vi.fn() }));
import { countPdfPages, uploadDocument, validateDocumentFile } from '../documentUpload';

// Mirrors an API response fixture, not a second production configuration source.
const limits = { max_bytes: 4_000_000, max_pdf_pages: 2,
  files: { 'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'] } };
async function pdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return new File([await doc.save()], 'synthetic.pdf', { type: 'application/pdf' });
}
function fakeFlow() {
  const session = { id: 'synthetic-process', revision: 0, state: 'awaiting_upload' };
  const request = vi.fn(async (path) => {
    if (path.endsWith('/upload/complete')) return { ...session, state: 'ready', revision: 1 };
    if (path.endsWith('/upload')) return { authorization: 'authenticated', bucket: 'hu23-document-temporary', path: 'server/uuid/object.pdf', content_type: 'application/pdf' };
    return session;
  });
  const upload = vi.fn(async () => ({ data: { path: 'server/uuid/object.pdf' }, error: null }));
  return { session, request, upload, storage: { from: vi.fn(() => ({ upload })) } };
}

describe('admisión local HU23', () => {
  it.each([1, 2])('cuenta y acepta PDF real de %i páginas', async (pages) => {
    const file = await pdf(pages);
    expect(await countPdfPages(file)).toBe(pages);
    expect((await validateDocumentFile(file, limits)).client_pages).toBe(pages);
  });
  it('rechaza PDF real de más de dos páginas sin requests', async () => {
    const flow = fakeFlow();
    await expect(uploadDocument(await pdf(3), 'liquidacion_sueldo', { restrictions: limits, ...flow })).rejects.toThrow('2 páginas');
    expect(flow.request).not.toHaveBeenCalled(); expect(flow.upload).not.toHaveBeenCalled();
  });
  it('rechaza más de 4 MB antes de contar páginas y antes de crear sesión', async () => {
    const flow = fakeFlow(), counter = vi.fn();
    const file = new File([new Uint8Array(limits.max_bytes + 1)], 'large.pdf', { type: 'application/pdf' });
    await expect(uploadDocument(file, 'liquidacion_sueldo', { restrictions: limits, ...flow, countPages: counter })).rejects.toThrow('4 MB');
    expect(counter).not.toHaveBeenCalled(); expect(flow.request).not.toHaveBeenCalled();
  });
  it.each([['proof.exe', 'application/pdf'], ['proof.pdf', 'image/png'], ['proof.svg', 'image/svg+xml']])('rechaza formato/MIME %s', async (name, type) => {
    const flow = fakeFlow();
    await expect(uploadDocument(new File(['x'], name, { type }), 'liquidacion_sueldo', { restrictions: limits, ...flow })).rejects.toThrow('Formato');
    expect(flow.request).not.toHaveBeenCalled(); expect(flow.upload).not.toHaveBeenCalled();
  });
  it.each([['photo.JPG', 'image/jpeg'], ['photo.jpeg', 'image/jpeg'], ['photo.png', 'image/png']])('acepta imagen %s como una página', async (name, type) => {
    const count = vi.fn();
    expect((await validateDocumentFile(new File(['x'], name, { type }), limits, count)).client_pages).toBe(1);
    expect(count).not.toHaveBeenCalled();
  });
  it('rechaza PDF corrupto o vacío', async () => {
    await expect(validateDocumentFile(new File(['invalid'], 'broken.pdf', { type: 'application/pdf' }), limits)).rejects.toThrow('sin contraseña');
    await expect(validateDocumentFile(new File([], 'empty.png', { type: 'image/png' }), limits)).rejects.toThrow('vacío');
  });
  it('acepta el límite exacto de tamaño y exige restricciones del servidor', async () => {
    const file = new File([new Uint8Array(limits.max_bytes)], 'edge.png', { type: 'image/png' });
    await expect(validateDocumentFile(file, limits)).resolves.toMatchObject({ client_pages: 1 });
    await expect(validateDocumentFile(file, null)).rejects.toThrow('restricciones');
  });
});

describe('flujo directo HU23', () => {
  it('envía Blob sólo a Storage y metadata sólo al backend, sin filename ni upsert', async () => {
    const flow = fakeFlow(), states = [];
    const file = await pdf(1);
    await expect(uploadDocument(file, 'liquidacion_sueldo', { restrictions: limits, ...flow, onState: (s) => states.push(s) })).resolves.toMatchObject({ state: 'ready' });
    expect(flow.storage.from).toHaveBeenCalledWith('hu23-document-temporary');
    const [path, body, options] = flow.upload.mock.calls[0];
    expect(path).toBe('server/uuid/object.pdf'); expect(body).toBeInstanceOf(Blob); expect(body.name).toBeUndefined();
    expect(options.upsert).toBe(false);
    for (const [, metadata] of flow.request.mock.calls) {
      expect(JSON.stringify(metadata ?? {})).not.toContain(file.name);
      expect(metadata).not.toBeInstanceOf(Blob);
    }
    expect(states).toEqual(['validating', 'authorizing', 'uploading', 'verifying', 'ready']);
  });
  it('reintenta mismo proceso sin sobrescribir si el objeto ya existe', async () => {
    const flow = fakeFlow(), base = flow.request;
    flow.request = vi.fn(async (path, body) => {
      if (path.endsWith('/upload')) throw Object.assign(new Error('synthetic'), { code: 'upload_already_exists' });
      return base(path, body);
    });
    await uploadDocument(await pdf(1), 'liquidacion_sueldo', { restrictions: limits, ...flow, session: flow.session });
    expect(flow.upload).not.toHaveBeenCalled();
    expect(flow.request.mock.calls.some(([path]) => path.endsWith('/upload/complete'))).toBe(true);
  });
  it('no finaliza si falla Storage y permite reintento explícito', async () => {
    const flow = fakeFlow(); flow.upload.mockResolvedValue({ error: { message: 'sensitive internals' } });
    await expect(uploadDocument(await pdf(1), 'liquidacion_sueldo', { restrictions: limits, ...flow })).rejects.toThrow('reintentar');
    expect(flow.request.mock.calls.some(([path]) => path.endsWith('/complete'))).toBe(false);
  });
  it('cancelación local evita finalize tras subida en vuelo', async () => {
    const flow = fakeFlow(), controller = new AbortController();
    flow.upload.mockImplementation(async () => { controller.abort(); return { error: null }; });
    await expect(uploadDocument(await pdf(1), 'liquidacion_sueldo', { restrictions: limits, ...flow, signal: controller.signal })).rejects.toThrow('cancelada');
    expect(flow.request.mock.calls.some(([path]) => path.endsWith('/complete'))).toBe(false);
  });
  it('no emite más uploads si el retry encuentra proceso ready', async () => {
    const flow = fakeFlow(); flow.request.mockResolvedValue({ ...flow.session, state: 'ready' });
    await uploadDocument(await pdf(1), 'liquidacion_sueldo', { restrictions: limits, ...flow, session: flow.session });
    expect(flow.upload).not.toHaveBeenCalled(); expect(flow.request).toHaveBeenCalledTimes(1);
  });
});
