// frontend/src/services/crmService.js

function resolveApiBase() {
  const configuredUrl =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_BASE_URL;
  const fallbackUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : "http://localhost:8000";
  return String(configuredUrl || fallbackUrl).replace(/\/$/, "");
}

const API_BASE_URL = resolveApiBase();
const LOCAL_STORAGE_KEY = 'rutahogar_crm_leads_mock';

/**
 * Generates a SHA-256 or safe hash string for an object.
 */
async function generateHash(obj) {
  try {
    const str = JSON.stringify(obj);
    if (typeof crypto !== "undefined" && crypto?.subtle?.digest) {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  } catch (err) {
    return `hash_${Date.now()}`;
  }
}

/**
 * Constructs the payload required for CRM sync.
 * lead: the evaluation object from DashboardLeads
 * projectData: the selected project object
 * matchData: the matching result from rankLeadsForProject/matchLeadToProjects
 */
export async function buildCrmPayload(lead, projectData, matchData) {
  if (lead?.input?.consentimiento === false) {
    throw new Error("El usuario no ha otorgado consentimiento para compartir sus datos sensibles (Ley 19.628).");
  }

  const result = lead?.result || {};
  const commercialPriority = result?.commercial_priority_detail || {};
  
  const basePayload = {
    lead_id: String(lead?.id || `anon_${Date.now()}`),
    lead_info: {
      nombre: lead?.profile?.nombre || lead?.full_name || lead?.email || "Usuario",
      apellido_paterno: lead?.profile?.apellido_paterno || "",
      apellido_materno: lead?.profile?.apellido_materno || "",
      full_name: lead?.full_name || lead?.email || "Usuario",
      rut: lead?.profile?.rut || lead?.rut || "11111111-1",
      email: lead?.email || "sin_correo@ejemplo.cl",
      telefono: lead?.phone || lead?.profile?.phone || null,
      fecha_evaluacion: lead?.created_at || new Date().toISOString(),
      consentimiento: lead?.input?.consentimiento !== false
    },
    evaluacion_general: {
      score: result?.adjusted_score ?? result?.score ?? 0,
      clasificacion: result?.classification || "Sin dato",
      scoring_version: result?.scoring_version || "1.0"
    },
    priorizacion_comercial: {
      prioridad_general: commercialPriority.priority || "not_defined",
      nivel_accion: commercialPriority.action || commercialPriority.level || "Sin acción",
      motivo: commercialPriority.reason || "Sin información.",
      send_to_crm: true
    },
    proyecto_objetivo: projectData ? {
      proyecto_id: projectData.id,
      proyecto_nombre: projectData.nombre,
      inmobiliaria_id: projectData.inmobiliaria_id || "desconocida",
      compatibilidad_capacidad: {
        estado: matchData?.clasificacion || "desconocido",
        dividendo_estimado_uf: matchData?.evidencia?.dividendo_estimado_uf || 0,
        pie_requerido_uf: matchData?.evidencia?.pie_requerido_uf || 0,
        pie_disponible_uf: matchData?.evidencia?.pie_disponible_uf || 0,
        brecha_uf: matchData?.bloqueador_principal?.brecha_recurso_uf || 0
      },
      compatibilidad_afinidad: {
        puntaje_afinidad: matchData?.afinidad || 0,
        nivel: matchData?.clasificacion || "Sin afinidad",
        coincidencia_comuna: true, // simplified for mock
        coincidencia_tipologia: true
      }
    } : null
  };

  const version_hash = await generateHash(basePayload);

  return {
    ...basePayload,
    sincronizacion: {
      version_hash
    }
  };
}

/**
 * Syncs a single lead to the CRM Mock.
 */
export async function syncLeadToSimulatedCrm(lead, projectData, matchData) {
  let payload;
  try {
    payload = await buildCrmPayload(lead, projectData, matchData);
  } catch (err) {
    console.error("[CRM Service] Error al construir el payload:", err);
    return { status: "error", message: err.message };
  }
  
  try {
    console.log(`[CRM Service] Enviando POST a ${API_BASE_URL}/api/v1/crm-mock/sync para lead:`, payload.lead_id);
    const response = await fetch(`${API_BASE_URL}/api/v1/crm-mock/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[CRM Service] Error en POST (${response.status}):`, errText);
      throw new Error(`Error en servidor CRM mock: ${response.status}`);
    }

    const data = await response.json();
    console.log("[CRM Service] Respuesta POST exitosa:", data);
    return data;
  } catch (error) {
    console.warn("[CRM Service] Fallo de conexión con backend CRM, usando fallback a localStorage:", error);
    return saveToLocalStorageFallback(payload);
  }
}

/**
 * Retrieves all synced leads from the CRM Mock.
 */
export async function getSimulatedCrmLeads() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/crm-mock/leads`);
    if (response.ok) {
      const data = await response.json();
      return data.leads || [];
    }
  } catch (error) {
    console.warn("Backend offline, leyendo desde localStorage");
  }

  // Fallback
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  return stored ? Object.values(JSON.parse(stored)) : [];
}

/**
 * Fallback when backend is unreachable.
 */
function saveToLocalStorageFallback(payload) {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  const db = stored ? JSON.parse(stored) : {};
  const lead_id = payload.lead_id;
  
  const now_str = new Date().toISOString();
  
  if (db[lead_id]) {
    const existing_hash = db[lead_id].sincronizacion?.version_hash;
    if (existing_hash === payload.sincronizacion.version_hash) {
      return { status: "sin_cambios", message: "Registro ya se encuentra actualizado (Offline)." };
    }
    
    payload.sincronizacion.estado_sync = "actualizado";
    payload.sincronizacion.actualizado_el = now_str;
    payload.sincronizacion.sincronizado_el = db[lead_id].sincronizacion?.sincronizado_el || now_str;
    
    db[lead_id] = payload;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    return { status: "actualizado", message: "Actualizado en fallback local." };
  } else {
    payload.sincronizacion.estado_sync = "creado";
    payload.sincronizacion.actualizado_el = now_str;
    payload.sincronizacion.sincronizado_el = now_str;
    
    db[lead_id] = payload;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    return { status: "creado", message: "Creado en fallback local." };
  }
}
