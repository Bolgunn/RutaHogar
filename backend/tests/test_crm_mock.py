import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_sync_lead_new():
    payload = {
        "lead_id": "test_lead_1",
        "lead_info": {"nombre": "Test", "consentimiento": True},
        "evaluacion_general": {"score": 80, "clasificacion": "Alto"},
        "priorizacion_comercial": {"nivel_accion": "Contactar"},
        "proyecto_objetivo": None,
        "sincronizacion": {"version_hash": "hash_v1"}
    }
    
    response = client.post("/api/v1/crm-mock/sync", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "creado"
    
def test_sync_lead_no_changes():
    payload = {
        "lead_id": "test_lead_1",
        "lead_info": {"nombre": "Test", "consentimiento": True},
        "evaluacion_general": {"score": 80, "clasificacion": "Alto"},
        "priorizacion_comercial": {"nivel_accion": "Contactar"},
        "proyecto_objetivo": None,
        "sincronizacion": {"version_hash": "hash_v1"}
    }
    
    response = client.post("/api/v1/crm-mock/sync", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "sin_cambios"
    
def test_sync_lead_update():
    payload = {
        "lead_id": "test_lead_1",
        "lead_info": {"nombre": "Test Modificado", "consentimiento": True},
        "evaluacion_general": {"score": 85, "clasificacion": "Alto"},
        "priorizacion_comercial": {"nivel_accion": "Contactar rápido"},
        "proyecto_objetivo": None,
        "sincronizacion": {"version_hash": "hash_v2"}
    }
    
    response = client.post("/api/v1/crm-mock/sync", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "actualizado"

def test_get_leads():
    response = client.get("/api/v1/crm-mock/leads")
    assert response.status_code == 200
    data = response.json()
    assert "leads" in data
    assert len(data["leads"]) >= 1
    lead = next(l for l in data["leads"] if l["lead_id"] == "test_lead_1")
    assert lead["lead_info"]["nombre"] == "Test Modificado"
    assert lead["sincronizacion"]["estado_sync"] == "actualizado"
