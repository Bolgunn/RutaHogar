from fastapi import APIRouter, HTTPException, status, Depends, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

router = APIRouter()

# API Key Security for CRM Mock (Fix for comment 5)
API_KEY_NAME = "X-Mock-CRM-API-Key"
API_KEY = "rutahogar-crm-mock-secret-key-2026"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=True)

async def verify_api_key(api_key_header: str = Security(api_key_header)):
    if api_key_header != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key",
        )
    return api_key_header

# In-memory database for the CRM mock
mock_crm_db: Dict[str, Any] = {}

class CRMSyncPayload(BaseModel):
    lead_id: str
    lead_info: Dict[str, Any]
    evaluacion_general: Dict[str, Any]
    priorizacion_comercial: Dict[str, Any]
    proyecto_objetivo: Optional[Dict[str, Any]] = None
    sincronizacion: Dict[str, Any]

# --- Modelos extendidos para la industria chilena ---

class PlanOKPayload(BaseModel):
    rut: str # Obligatorio para evitar duplicados en sala de ventas
    nombres: str # Separado
    apellidos: str # Separado
    email: Optional[str] = None
    telefono: Optional[str] = None
    id_proyecto: str
    comentarios: Optional[str] = None # RutaHogar concatenará el score financiero aquí
    origen: str = "RutaHogar"

class HubSpotPayload(BaseModel):
    email: str
    properties: Optional[Dict[str, Any]] = None
    # Espera properties como: firstname, lastname, rutahogar_score, rutahogar_afinidad

class SalesforcePayload(BaseModel):
    LastName: str
    Company: str = "Particular"
    Email: Optional[str] = None
    Phone: Optional[str] = None
    RutaHogar_Score__c: Optional[float] = None
    Proyecto_Objetivo__c: Optional[str] = None


@router.post("/sync", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_api_key)])
async def sync_lead(payload: CRMSyncPayload):
    lead_id = payload.lead_id
    incoming_hash = payload.sincronizacion.get("version_hash")
    
    if not incoming_hash:
        raise HTTPException(status_code=400, detail="version_hash es requerido")

    now_str = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    logger.info(f"Audit: Sync requested for lead_id={lead_id}, hash={incoming_hash}")

    if lead_id in mock_crm_db:
        existing_record = mock_crm_db[lead_id]
        existing_hash = existing_record["sincronizacion"].get("version_hash")
        
        if existing_hash == incoming_hash:
            logger.info(f"Audit: Sync unchanged for lead_id={lead_id}")
            return {"status": "sin_cambios", "message": "El registro ya se encuentra actualizado."}
        
        # Update
        payload_dict = payload.model_dump()
        payload_dict["sincronizacion"]["estado_sync"] = "actualizado"
        payload_dict["sincronizacion"]["actualizado_el"] = now_str
        payload_dict["sincronizacion"]["sincronizado_el"] = existing_record["sincronizacion"].get("sincronizado_el", now_str)
        
        logger.info(f"Audit: Sync updated for lead_id={lead_id}")
        mock_crm_db[lead_id] = payload_dict
        return {"status": "actualizado", "message": "Registro actualizado exitosamente en CRM Simulado."}
    else:
        # Create
        payload_dict = payload.model_dump()
        payload_dict["sincronizacion"]["estado_sync"] = "creado"
        payload_dict["sincronizacion"]["sincronizado_el"] = now_str
        payload_dict["sincronizacion"]["actualizado_el"] = now_str
        
        logger.info(f"Audit: Sync created for lead_id={lead_id}")
        mock_crm_db[lead_id] = payload_dict
        return {"status": "creado", "message": "Registro creado exitosamente en CRM Simulado."}

@router.get("/leads", dependencies=[Depends(verify_api_key)])
async def get_leads():
    return {"leads": list(mock_crm_db.values())}

# --- Endpoints de simulación para proveedores de la industria ---

import logging

logger = logging.getLogger(__name__)

@router.post("/sync/planok", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_api_key)])
async def sync_planok(payload: PlanOKPayload):
    # Simula la recepción en PlanOK
    logger.info(f"Audit: Syncing to PlanOK for rut={payload.rut}")
    mock_crm_db[f"planok_{payload.rut}"] = payload.model_dump()
    return {"status": "ok", "message": "Recibido en PlanOK simulado"}

@router.post("/sync/hubspot", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_api_key)])
async def sync_hubspot(payload: HubSpotPayload):
    # Simula la recepción en HubSpot
    logger.info(f"Audit: Syncing to HubSpot for email={payload.email}")
    mock_crm_db[f"hubspot_{payload.email}"] = payload.model_dump()
    return {"status": "ok", "message": "Recibido en HubSpot simulado"}

@router.post("/sync/salesforce", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_api_key)])
async def sync_salesforce(payload: SalesforcePayload):
    # Simula la recepción en Salesforce
    logger.info(f"Audit: Syncing to Salesforce for email={payload.Email}")
    mock_crm_db[f"sf_{payload.Email}"] = payload.model_dump()
    return {"status": "ok", "message": "Recibido en Salesforce simulado"}
