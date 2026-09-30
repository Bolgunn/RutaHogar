# Plan: HU19 - Portal Inmobiliario Inteligente (RAG)

## 1. Contexto y Objetivo
Implementar la búsqueda de propiedades basada en descripciones de lenguaje natural utilizando recuperación aumentada por vectores (RAG), incorporando el catálogo inicial extraído mediante scraping (Apify) desde Portal Inmobiliario. Asegurar que cada tarjeta incluya los CTAs para evaluar la compatibilidad financiera en RutaHogar y los avisos de carácter referencial.

## 2. Pasos de Implementación
1. **Backend / Base de Datos:** Configurar la consulta de similitud vectorial (usando `pgvector` en Supabase) para procesar el texto de búsqueda natural sobre el catálogo obtenido vía Apify, retornando propiedades ordenadas por relevancia semántica (E1).
2. **API Endpoint:** Exponer el endpoint de búsqueda que reciba la consulta natural y devuelva el listado de propiedades.
3. **Frontend / Componentes:** 
   - Desarrollar la barra de entrada de texto libre para la búsqueda inmobiliaria.
   - Diseñar la tarjeta de propiedad (*Property Card*) con el CTA claro para evaluar el crédito en RutaHogar (“Ver si califico para este departamento”) en la vista general y de detalle (E2, E3).
4. **Disclaimers y Manejo de Vacíos:**
   - Añadir el aviso visible de que la información es referencial y debe verificarse en el portal de origen debido a la naturaleza del origen de los datos (E4).
   - Implementar la UI para cuando la búsqueda no devuelva coincidencias, sugiriendo modificar restricciones o comuna (E5).

## 3. Mapeo de Criterios de Aceptación
- **E1 (Búsqueda vectorial):** Validado mediante integración del servicio semántico.
- **E2 & E3 (CTAs de RutaHogar):** Verificado visualmente en tarjetas y detalle.
- **E4 (Disclaimer referencial):** Verificado por presencia de texto legal/referencial visible.
- **E5 (Mensaje de resultados vacíos):** Verificado mediante pruebas con consultas restrictivas.

## 4. Suposiciones y Asuntos Abiertos (Assumptions Log)
- El catálogo inicial de propiedades se poblará mediante un proceso de extracción acotado utilizando la capa gratuita de Apify desde Portal Inmobiliario.
- Se asume que la base de datos en Supabase cuenta con la extensión `pgvector` habilitada.

## 5. Start Here (Instrucciones de Arranque)
1. Crear y cambiar a la rama de trabajo: git checkout -b feat/hu19-portal-inmobiliario-rag
2. Validar la estructura de la tabla de propiedades y la configuración de pgvector en Supabase.
3. Implementar el servicio backend de búsqueda semántica y los componentes frontend correspondientes.
