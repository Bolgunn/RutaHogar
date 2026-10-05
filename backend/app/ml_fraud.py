import os
from typing import Dict, Tuple, List
from supabase import create_client, Client

def get_supabase_client() -> Client:
    # Usamos las variables de entorno o mock
    url: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "http://localhost:54321"
    
    # Primero buscamos la llave de servicio. Si no está, intentamos la publica
    key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        print("WARNING: SUPABASE_SERVICE_ROLE_KEY no está configurada. Usando anon key. Debido a las políticas RLS, el backend no podrá leer el historial de evaluaciones del usuario y el antifraude no funcionará correctamente.")
        key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or "dummy"
        
    return create_client(url, key)

def predict_fraud(data: Dict) -> Tuple[float, List[str]]:
    """
    Predice la probabilidad de fraude y extrae los factores usando reglas determinísticas.
    """
    raw_time = data.get("time_to_submit")
    time_to_submit = 30.0 if raw_time is None else float(raw_time)
    ingreso_mensual = float(data.get("ingreso_mensual") or 0)
    ahorro_disponible = float(data.get("ahorro_disponible") or 0)

    # 1. Reglas Duras (Hard Rules / Fallback determinístico)
    intentos = data.get("intentos_previos", 0)
    ahorro_previo = data.get("ahorro_previo_24h")
    
    if ahorro_previo is not None and ahorro_disponible > (ahorro_previo + (ingreso_mensual * 3)):
        prev_fmt = f"${int(ahorro_previo):,}".replace(",", ".")
        act_fmt = f"${int(ahorro_disponible):,}".replace(",", ".")
        return 99.0, [f"Avance de ahorro irreal detectado en 24h: subió de {prev_fmt} a {act_fmt} (Regla estricta)."]
    elif intentos > 3:
        return 99.0, [f"Tanteo detectado: El dispositivo ha intentado {intentos} evaluaciones (Regla estricta)."]
    elif time_to_submit < 5:
        return 95.0, ["Tiempo de llenado anormalmente bajo (<5s). Posible script automátizado (Regla estricta)."]

    # 2. Score base o fallback
    if time_to_submit < 10:
        return 60.0, ["Tiempo de llenado rápido (<10s). Posible autocompletado (Fallback)."]
        
    return 5.0, []
