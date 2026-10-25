import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import DocumentReview from './DocumentReview';

const base={id:'review',revision:4,state:'awaiting_review',evidence:[],candidates:[
  {field:'ingreso_mensual',detection:'detected',comparison:'difference',declared_value:1000000,detected_value:1200000},
]};

it('muestra declarado/detectado y exige elección y confirmación sin OCR bruto',()=>{
  const html=renderToStaticMarkup(<DocumentReview session={{...base,ocr_text:'SECRET_OCR'}} onSession={()=>{}} />);
  expect(html).toContain('Declarado');expect(html).toContain('Detectado');
  expect(html).toContain('1.000.000');expect(html).toContain('1.200.000');
  expect(html).toContain('Aceptar valor detectado');expect(html).toContain('Mantener valor declarado');
  expect(html).toContain('type="submit" disabled=""');
  expect(html).not.toContain('SECRET_OCR');expect(html).not.toContain('Actualizar score');
});
it('no muestra radios ni sugerencias de valor para ambiguos',()=>{
  const html=renderToStaticMarkup(<DocumentReview session={{...base,candidates:[
    {...base.candidates[0],detection:'ambiguous',comparison:'insufficient',detected_value:null},
  ]}} onSession={()=>{}} />);
  expect(html).toContain('Resultado ambiguo');expect(html).toContain('Finalizar revisión sin cambios');
  expect(html).not.toContain('type="radio"');
});
it('el cierre muestra respaldo histórico y pendientes sin conservar los candidatos',()=>{
  const html=renderToStaticMarkup(<DocumentReview session={{...base,state:'confirmed',candidates:[],
    tracking_event_id:'hu23-event',deletion_state:'retry_required',
    evidence:[{field:'ingreso_mensual',current_backing:'respaldado',comparison:'difference'}],
  }} onSession={()=>{}} />);
  expect(html).toContain('no recalcula tu score');expect(html).toContain('Respaldado');
  expect(html).toContain('se detectó una diferencia');expect(html).toContain('eliminación del archivo original está pendiente');
  expect(html).not.toContain('1.200.000');
});
