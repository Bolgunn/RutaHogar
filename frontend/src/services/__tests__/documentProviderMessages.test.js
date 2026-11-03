import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../utils/supabase',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:{access_token:'synthetic'}}})),signOut:vi.fn()}}}));
import { trackingRequest } from '../trackingService';

afterEach(()=>vi.unstubAllGlobals());

it.each(['local_ocr_public_origin_invalid','local_ocr_unavailable','ocr_provider_mismatch','ocr_unavailable'])(
  'muestra un error neutral sin identidad ni proveedor para %s',async(code)=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({detail:{code,
      expected_rut:'1.111.111-4',detected_rut:'2.222.222-8',name:'Camila Fernanda Prueba Usuario'}}),{status:503})));
    const error=await trackingRequest('/documents/sessions/synthetic/ocr/poll',{}).catch(error=>error);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/No pudimos|no está disponible/);
    expect(error.message).not.toMatch(/Azure|Microsoft|proveedor|worker|OCR|1\.111|2\.222|Camila/i);
  });
