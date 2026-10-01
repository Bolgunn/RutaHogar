import os
import json
import pandas as pd
import numpy as np
import xgboost as xgb
import shap
from typing import Dict, Tuple, List
from supabase import create_client, Client

MODEL_PATH = os.path.join(os.path.dirname(__file__), "xgboost_fraud_model.json")
# Instancia global del modelo en memoria
_xgb_model = None

def get_supabase_client() -> Client:
    # Usamos las variables de entorno o mock
    url: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "http://localhost:54321"
    
    # Primero buscamos la llave de servicio. Si no está, intentamos la publica
    key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        print("WARNING: SUPABASE_SERVICE_ROLE_KEY no está configurada. Usando anon key. Debido a las políticas RLS, el backend no podrá leer el historial de evaluaciones del usuario y el antifraude no funcionará correctamente.")
        key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or "dummy"
        
    return create_client(url, key)

def _extract_features(data: Dict) -> pd.DataFrame:
    """Extrae las variables de comportamiento para el modelo."""
    return pd.DataFrame([{
        "time_to_submit": float(data.get("time_to_submit", 30)),
        "intentos_previos": float(data.get("intentos_previos", 0)),
        "ingreso_mensual": float(data.get("ingreso_mensual", 0)),
        "deuda_mensual": float(data.get("deuda_mensual", 0)),
        "edad": float(data.get("edad", 30)),
        "ahorro_disponible": float(data.get("ahorro_disponible", 0))
    }])

def predict_fraud_xgboost(data: Dict) -> Tuple[float, List[str]]:
    """
    Predice la probabilidad de fraude y extrae los factores usando SHAP.
    Si el modelo no está entrenado, usa fallback determinístico.
    """
    global _xgb_model
    
    features = _extract_features(data)
    time_to_submit = features["time_to_submit"].iloc[0]

    # Cargar modelo si existe y no está en memoria
    if _xgb_model is None and os.path.exists(MODEL_PATH):
        _xgb_model = xgb.XGBClassifier()
        _xgb_model.load_model(MODEL_PATH)
        
    # Si aún no hay modelo, usamos Fallback matemático para explicabilidad
    intentos = data.get("intentos_previos", 0)
    ahorro_actual = features["ahorro_disponible"].iloc[0] if "ahorro_disponible" in features else 0
    ahorro_previo = data.get("ahorro_previo_24h")
    renta = features["ingreso_mensual"].iloc[0] if "ingreso_mensual" in features else 0
    
    if _xgb_model is None:
        if ahorro_previo is not None and ahorro_actual > (ahorro_previo + (renta * 3)):
            return 99.0, [f"Avance de ahorro irreal detectado en 24h: subió de {ahorro_previo} a {ahorro_actual} (Fallback)."]
        elif intentos > 3:
            return 99.0, [f"Tanteo detectado: El dispositivo ha intentado {intentos} evaluaciones (Fallback)."]
        elif time_to_submit < 5:
            return 95.0, ["Tiempo de llenado anormalmente bajo (<5s). Posible script automátizado (Fallback)."]
        elif time_to_submit < 10:
            return 60.0, ["Tiempo de llenado rápido (<10s). Posible autocompletado (Fallback)."]
        return 5.0, []

    # --- PREDICCIÓN ML REAL ---
    # XGBoost predice clase 1 (Fraude) o 0 (Normal)
    proba = _xgb_model.predict_proba(features)[0][1] * 100.0  # Probabilidad de clase 1
    
    # --- EXPLICABILIDAD SHAP ---
    # TreeExplainer es extremadamente rápido para XGBoost
    explainer = shap.TreeExplainer(_xgb_model)
    shap_values = explainer.shap_values(features)
    
    # Extraer los factores más importantes
    feature_names = features.columns.tolist()
    shap_impact = shap_values[0] if isinstance(shap_values, list) else shap_values
    
    # Juntar nombre de feature con su impacto en la predicción actual
    impacts = list(zip(feature_names, shap_impact[0] if len(shap_impact.shape)>1 else shap_impact))
    # Ordenar por magnitud de impacto absoluto
    impacts.sort(key=lambda x: abs(x[1]), reverse=True)
    
    # Formatear los top factores que empujaron a fraude (impacto positivo)
    top_factors = []
    for fname, impact in impacts[:3]:
        if impact > 0.5: # Solo mencionar si aportó a la sospecha
            top_factors.append(f"La variable '{fname}' aumentó la sospecha (SHAP impact: +{impact:.2f}).")
            
    return float(proba), top_factors

def retrain_adaptive_model():
    """
    Se conecta a Supabase, descarga el historial de evaluaciones y el estado del Lead,
    entrena el XGBoost y lo guarda.
    Esto permite que si un lead fue "reactivado" (marcado como normal), el algoritmo aprenda.
    """
    supabase = get_supabase_client()
    
    # 1. Obtener Leads y sus estados (Target Y)
    profiles = supabase.table("profiles").select("id, reliability_status").execute().data
    if not profiles:
        return {"status": "error", "message": "No hay perfiles para entrenar."}
        
    status_map = {p["id"]: (1 if p["reliability_status"] in ["sospechoso", "reportado"] else 0) for p in profiles}
    
    # 2. Obtener Evaluaciones (Features X)
    evaluations = supabase.table("evaluations").select("user_id, financial_data").execute().data
    
    dataset = []
    labels = []
    for ev in evaluations:
        user_id = ev.get("user_id")
        fin_data = ev.get("financial_data", {})
        if not fin_data or user_id not in status_map:
            continue
            
        input_data = fin_data.get("input", {})
        # Usamos time_to_submit si existe, o un valor promedio si es antiguo
        dataset.append({
            "time_to_submit": float(input_data.get("time_to_submit", 30)),
            "ingreso_mensual": float(input_data.get("ingreso_mensual", 0)),
            "deuda_mensual": float(input_data.get("deuda_mensual", 0)),
            "edad": float(input_data.get("edad", 30)),
            "ahorro_disponible": float(input_data.get("ahorro_disponible", 0))
        })
        labels.append(status_map[user_id])
        
    if len(dataset) < 10:
        return {"status": "ignored", "message": "Insuficientes datos para entrenar ML adaptativo (< 10)."}
        
    df = pd.DataFrame(dataset)
    y = np.array(labels)
    
    # 3. Entrenar el clasificador XGBoost
    model = xgb.XGBClassifier(
        n_estimators=50,
        max_depth=3,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric='logloss'
    )
    model.fit(df, y)
    
    # 4. Guardar modelo en disco
    model.save_model(MODEL_PATH)
    
    # Refrescar en memoria
    global _xgb_model
    _xgb_model = model
    
    return {"status": "success", "message": f"Modelo adaptativo entrenado con {len(dataset)} registros y guardado."}
