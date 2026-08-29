import urllib.request
import json
import time
import sys

# Por defecto usamos el entorno de producción
url = "https://score-leads-one.vercel.app/score"

# Permitir usar el entorno local con un flag
if len(sys.argv) > 1 and sys.argv[1] == "--local":
    url = "http://127.0.0.1:8000/score"

payload = {
    "ingreso_mensual": 1500000,
    "deuda_mensual": 200000,
    "edad": 35,
    "ahorro_disponible": 5000000,
    "plazo_credito_hipotecario": 20,
    "tipo_contrato": "indefinido",
    "continuidad_laboral": "mas_3_anios",
    "morosidad_actual": "no",
    "dividendo_estimado": 400000,
    "consentimiento": True
}

data = json.dumps(payload).encode('utf-8')
headers = {'Content-Type': 'application/json'}

req = urllib.request.Request(url, data=data, headers=headers)

start = time.time()
try:
    print(f"Evaluando endpoint en: {url}")
    with urllib.request.urlopen(req) as response:
        response.read()
    end = time.time()
    print(f"La evaluación tomó: {(end - start):.4f} segundos")
except Exception as e:
    print(f"Error al conectar con el servidor: {e}")
