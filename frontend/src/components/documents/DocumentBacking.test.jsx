import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import DocumentBacking, { DocumentBackingView } from './DocumentBacking';
import ProfilePage from '../ProfilePage';

const projection={fields:[
  {field:'ingreso_mensual',status:'respaldado',confirmed_on:'2026-10-25'},
  {field:'ahorro_disponible',status:'con_diferencia',confirmed_on:'2026-10-24'},
  {field:'tipo_contrato',status:'sin_respaldo',confirmed_on:null},
  {field:'continuidad_laboral',status:'sin_respaldo',confirmed_on:null},
]};
it('renderiza los tres estados y sólo fecha para datos vigentes',()=>{
  const html=renderToStaticMarkup(<DocumentBackingView projection={projection} />);
  for(const label of ['Respaldado','Con diferencia','Sin respaldo','Ingreso mensual','Ahorro disponible','Tipo de contrato','Continuidad laboral']) expect(html).toContain(label);
  expect(html).toContain('dateTime="2026-10-25"');
  expect(html).toContain('confirmada aplicable al dato vigente');
  expect(html).not.toContain('iframe');expect(html).not.toContain('href=');
});
it('un widget sin respuesta muestra carga, no ausencia falsa de respaldo',()=>{
  const html=renderToStaticMarkup(<DocumentBacking leadId="selected-lead" mode="staff" />);
  expect(html).toContain('Consultando respaldo');
  expect(html).not.toContain('Sin respaldo');
});
it('el usuario legacy tiene el panel sin habilitar carga/score antes de precalificarse',()=>{
  const html=renderToStaticMarkup(<ProfilePage profile={{role:'usuario',id:'legacy'}} onboarding={{}} evaluations={[]} />);
  expect(html).toContain('Respaldo de antecedentes vigentes');
  expect(html).not.toContain('Cargar documento respaldatorio');
  expect(html).not.toContain('Actualizar score con datos validados');
});

import LeadDetailModal from '../LeadDetailModal';
it('integra el panel vigente en el detalle comercial sin mezclarlo con valores históricos',()=>{
  const html=renderToStaticMarkup(<LeadDetailModal onClose={()=>{}} role="ejecutivo" lead={{
    id:'11111111-1111-4111-8111-111111111111',user_id:'22222222-2222-4222-8222-222222222222',
    full_name:'Lead sintético',created_at:'2026-10-25T12:00:00Z',
    input:{ingreso_mensual:1000000,ahorro_disponible:2000000,tipo_contrato:'indefinido',continuidad_laboral:'mas_3_anios'},
    result:{score:50,classification:'Medio'},onboarding:{},
  }} />);
  expect(html).toContain('Respaldo de antecedentes vigentes');
  expect(html).toContain('no cambian las evaluaciones históricas');
});
