# HU23 — validación y operación

Este documento no habilita despliegues ni cambios remotos. El cierre T9 se verifica localmente; la activación y el smoke real requieren un entorno de pruebas ya autorizado y preparado.

## Cleanup horario sin cron de Vercel

Workflow `.github/workflows/hu23-document-cleanup.yml`: minuto 17 de cada hora UTC, más `workflow_dispatch`, sin inputs de URL/token. Reutiliza GitHub Actions ya presente en el repositorio y llama por HTTPS al endpoint protegido POST `/tracking/documents/cleanup`; no necesita Service Role ni claves Azure en Actions.

Configurar posteriormente, mediante los gestores de secretos existentes:

- En backend: `HU23_CLEANUP_CRON_TOKEN`.
- En GitHub Actions: el mismo `HU23_CLEANUP_CRON_TOKEN` y `HU23_CLEANUP_URL`, URL HTTPS completa del endpoint (sin query, fragmento, credenciales o redirecciones).

No pegar valores en código, documentación, argumentos CLI, logs o frontend. `CRON_SECRET` continúa siendo compatible con el endpoint, pero HU23 no depende del scheduler de Vercel. El digest diario previo conserva su configuración independiente.

El workflow necesita existir en la **rama por defecto** para dispararse por schedule, y GitHub Actions debe estar habilitado. La programación no se activa por dejar archivos en esta rama local. Revisar minutos/cuota disponibles, notificaciones de fallos y una ejecución manual posterior a la configuración. [GitHub documenta retrasos/drops de schedules, ejecución desde default y desactivación tras 60 días sin actividad en repos públicos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). El minuto 17 reduce el pico de comienzo de hora; no constituye un SLA del proveedor.

El script `scripts/run-hu23-cleanup.py` usa sólo stdlib: no instala aplicación, no imprime respuestas completas ni excepciones de HTTP, rechaza redirects y sólo emite contadores tipados de una allowlist. Hasta cuatro invocaciones por ejecución permiten recuperar fallos de transporte o drenar lotes, con espera 5/10/20 s. La DB conserva leases, backoff y fencing; no se adelantan reintentos de recursos aún no vencidos. Obligaciones restantes o presupuesto/lotes agotados terminan la ejecución con error tras el máximo; retención vencida o submission_unknown produce alerta de ejecución fallida inmediata. Los fallos/notificaciones deben supervisarse: un fallo de Actions no se convierte por sí solo en respuesta humana.

Comando manual con variables ya exportadas desde el gestor de secretos:

```bash
python scripts/run-hu23-cleanup.py
```

Retención: sesión máxima 20 h, cron horario y reintentos dejan margen antes de 24 h. Verificar `overdue_originals=0`, avance de `storage_deleted`/`azure_deleted`, `pending_originals`/`pending_azure`, lease liberado y `last_finished_at` reciente mediante acceso backend autorizado. No publicar IDs/rutas/resultados para monitorear. Si falla la ejecución, reintentar manualmente una vez corregida la causa; originales y resultados tienen obligaciones independientes. No ampliar expires_at, forzar acknowledgements, borrar evidencia ni borrar filas de storage.objects para simular borrado de bytes.

La disponibilidad, el volumen y la actividad del scheduler condicionan el cumplimiento operativo de ≤24 h. Un retraso prolongado o falta de capacidad requiere intervención. Un submit Azure aceptado sin result_id recuperable no permite borrado dirigido; se conserva su metadata mínima y alerta, sin inventar ID ni afirmar destrucción remota. DELETE 404 mantiene obligación hasta reconciliación; el acuse API tampoco certifica destrucción física del proveedor.

Rollback SQL T8 deshabilita nuevos claims, preservando obligaciones/acks en vuelo y cleanup inmediato. Revertir el workflow detiene programación futura al desplegar/publicar esa reversión; ninguna operación se ejecuta aquí.

## Smoke sintético posterior

**T9 no lo ejecutó:** variables Azure/Storage no disponibles en el entorno del proceso. No se solicitaron ni registraron credenciales. La ausencia de smoke real no se presenta como éxito de integración remota.

En un entorno de pruebas ya preparado, con las ocho migraciones aplicadas bajo autorización independiente y backend configurado con variables server-side (incluidas `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` y `AZURE_DOCUMENT_INTELLIGENCE_KEY`):

1. Crear un PDF sintético de una página. Desde `frontend`, con dependencias ya instaladas:

   ```bash
   node --input-type=module <<'JS'
   import { PDFDocument, StandardFonts } from 'pdf-lib';
   import { writeFile } from 'node:fs/promises';
   const pdf = await PDFDocument.create();
   const font = await pdf.embedFont(StandardFonts.Helvetica);
   const page = pdf.addPage();
   page.drawText('DOCUMENTO SINTETICO - SIN DATOS PERSONALES', { x: 40, y: 740, size: 12, font });
   page.drawText('Liquido a pagar: $1.200.000', { x: 40, y: 700, size: 12, font });
   await writeFile('/tmp/hu23-smoke.pdf', await pdf.save());
   JS
   ```

2. Iniciar sesión con un usuario **sintético precalificado**. En perfil → Respaldar mis datos, seleccionar liquidación y cargar `/tmp/hu23-smoke.pdf`. Verificar upload directo a Storage, backend sólo JSON y estado ready.
3. Aceptar consentimiento de envío temporal a Microsoft Azure; procesar/revisar. Verificar start/poll asíncronos, parser determinista, ingreso detectado 1.200.000, declarado/comparación correctos y awaiting_review. No copiar Network/HAR a tickets: contiene bearer/path/signed capabilities.
4. Comprobar desde backend autorizado que el resultado Azure quedó eliminado tras consumo o conserva obligación reintentable. No registrar OCR completo ni claves. Si OCR no interpreta el sintético, registrar sólo código técnico y falla real; no forzar el candidato.
5. Cancelar para este smoke mínimo (no cambia antecedentes ni score); comprobar candidatos vacíos, original eliminado mediante API Storage y resultado Azure eliminado. Si falla el borrado, ejecutar cleanup protegido con las variables configuradas y comprobar los acuses; no dar por aprobado mientras haya pendientes. El historial/evidencia anterior no cambia.
6. El flujo opcional de confirmación/CTA sólo con el usuario sintético permite verificar que confirmar no cambia score y que **Actualizar score con datos validados** crea una evaluación adicional; no es necesario para el smoke mínimo OCR. No usar documentos/usuarios reales.

Eliminar también `/tmp/hu23-smoke.pdf` local al terminar. No conservar PDF/OCR/HAR como artefactos de CI. Reportar sólo etapas aprobadas/fallidas y tiempos, nunca URLs, IDs remotos ni valores de credenciales.
