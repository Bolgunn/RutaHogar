# HU23: preparación del despliegue productivo

## Alcance

La entrega corrige la extracción de identidad del trabajador cuando el texto PDF
fusiona columnas de empleador y trabajador, incluye `identity.py` en la imagen y
en su contexto Docker restringido, y neutraliza los textos del proveedor OCR.
El error de identidad visible es exclusivamente:

> Se detectaron inconsistencias entre los datos de tu perfil y los del documento cargado.

Se conserva `identity_inconsistent`, sin mostrar campos, nombres ni RUT esperados
o detectados. Las pruebas cubren los dos tipos de identidad y la privacidad del
rol comercial. El soporte de preferencias inmobiliarias nulas en simulación es
un bugfix general separado conceptualmente, incluido en la misma entrega.
La revisión del build también detectó un fallback CRM preexistente hacia un
servidor de desarrollo en producción: ahora usa el mismo origen cuando no hay
URL configurada. Este segundo bugfix general conserva el comportamiento DEV y
las URLs configuradas explícitamente.

## Configuración

El contrato productivo no cambia:

| Variable | Uso |
| --- | --- |
| `HU23_OCR_PROVIDER` | `local` o `azure`; si se omite, el código conserva Azure por defecto |
| `HU23_LOCAL_OCR_URL` | URL HTTPS del servicio propio, para este entorno `https://ocr.rutahogar.cl` |
| `HU23_LOCAL_OCR_TOKEN` | Secreto compartido con el worker, mínimo 32 caracteres y sin espacios marginales |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Endpoint configurado para Azure |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Clave de Azure |

Para usar el servicio propio, configurar explícitamente `HU23_OCR_PROVIDER=local`
en **Production** de Vercel. Esto no significa ejecutar OCR dentro de Vercel:
FastAPI llama al worker privado por HTTPS. No hay fallback automático entre
proveedores y los intentos existentes conservan el proveedor con el que nacieron.

Las claves Supabase del backend deben ser las del proyecto productivo. El frontend
necesita su URL pública y publishable key productivas. El token del worker y las
claves de servicio/Azure nunca deben tener prefijo `VITE_`.

No copiar `.env`, `.env.local` ni el archivo de secretos del worker usado para
pruebas locales. En producción no configurar
`HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN`: ese puente existe sólo para desarrollo y
está bloqueado por el backend en Vercel Production/Preview. En el host OCR,
`HU23_OCR_STORAGE_ORIGIN` debe ser el origen HTTPS exacto del Supabase productivo.
Los parámetros de bind/puerto del contenedor no sustituyen la URL HTTPS de Vercel.

## Base de datos

`20261029120000_hu23_identity_guard.sql` ya está aplicada en remoto. No editarla ni
volver a aplicarla. Antes del commit se comprobaron `migration list --linked` y
`db push --linked --dry-run`: historial alineado, sin migraciones pendientes.
El bootstrap y los fixtures locales no forman parte de esta entrega productiva.

## Después del commit y push

1. En Vercel, integrar el commit en la rama configurada como **Production Branch**.
   Si el proyecto tiene Git conectado, su integración genera el despliegue;
   de lo contrario, iniciar un despliegue explícito posteriormente. El repositorio
   no permite confirmar desde sus archivos si esa integración está activa.
2. Verificar las variables de Production antes de desplegar. Cambiarlas requiere
   un nuevo deployment. No reutilizar un build generado con `.env.local`.
3. El `vercel.json` de raíz ejecuta el build de `frontend`, sirve `frontend/dist`
   y enruta `/tracking/*` a `api/score.py`, que importa el backend compartido.
   Verificar que el proyecto Vercel use esa raíz. Si hay otro proyecto backend
   separado, desplegar también ese proyecto y comprobar `VITE_API_URL`.
4. Actualizar el checkout del **host que atiende `ocr.rutahogar.cl`** al mismo
   commit y reconstruir/recrear su contenedor con el Dockerfile actualizado.
   El push a Git y el deployment Vercel no actualizan ese contenedor por sí solos.
   Si ese host usa el Compose documentado, el comando operativo posterior es:

   ```bash
   docker compose -f workers/hu23_ocr/compose.local.yml -p hu23_ocr up -d --build
   ```

   Usar allí los secretos y el origen Storage productivos del host, sin sustituirlos
   por los de desarrollo. Mantener las restricciones de recursos, usuario sin
   privilegios, filesystem de sólo lectura, HTTPS y autenticación del túnel/proxy.
5. Verificar `/health` en el servicio y que el túnel/proxy apunte al contenedor
   recreado. El healthcheck por sí solo no valida el parser: la prueba de imagen
   ejecuta extracción real sin fuentes montadas. Confirmar por el diagnóstico
   administrativo autenticado el proveedor efectivo del backend desplegado.
6. Iniciar intentos nuevos para el smoke test compatible/incompatible. No
   reinterpretar intentos cerrados o asociados a otro proveedor. Comprobar
   ausencia de candidatos y cambios de perfil/score ante identidad contradictoria.

Esta preparación no publica imágenes, no despliega Vercel ni actualiza el host OCR.
