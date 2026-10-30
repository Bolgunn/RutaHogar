// HU 21 — criterios comerciales de la inmobiliaria del administrador. El backend valida (ALG-19 R0)
// y resuelve el tenant desde la sesión; aquí solo se transporta.
import { trackingRequest } from "./trackingService";

export const getCommercialConfig = () => trackingRequest("/staff/commercial-config", undefined);

export const previewCommercialConfig = (baseVersion, criterios) =>
  trackingRequest("/staff/commercial-config/preview", { base_version: baseVersion, criterios });

export const saveCommercialConfig = (baseVersion, criterios) =>
  trackingRequest("/staff/commercial-config", { base_version: baseVersion, criterios });
