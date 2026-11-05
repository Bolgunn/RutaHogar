import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectEvaluationModal from "../ProjectEvaluationModal";
import { localProvider as favoritesLocalProvider } from "../../services/favoritesService";
import { localLeadChangesProvider } from "../../services/leadChangeService";
import { localCatalogProvider } from "../../services/projectService";

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

const LEAD_USER_ID = "11111111-2222-3333-4444-555555555555";

const BASE_EVALUATION = {
  input: {
    ingreso_mensual: 1900000,
    deuda_mensual: 120000,
    ahorro_disponible: 14000000,
    uf_value_clp: 38000,
  },
  result: {
    score: 74,
    classification: "Medio",
    financial_indicators: {
      capacidad_compra_estimada_uf: 2850,
    },
    market_context: {
      uf_value: 38000,
    },
  },
};

describe("HU 31 — Radar de oportunidades y alertas por variación de condiciones de mercado", () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem("scoreleads_last_evaluation", JSON.stringify(BASE_EVALUATION));
  });

  it("E1: activa la campana 'Notificar cambios' sobre un favorito y registra el interés y el umbral de precio actual", () => {
    const project = {
      id: "proj-hu31-1",
      nombre: "Mirador del Parque",
      comuna: "Ñuñoa",
      tipo_vivienda: "departamento",
      valor_uf: 3200,
      precio_min_uf: 3200,
      precio_max_uf: 3800,
      bono_pie_pct: 0,
      descripcion: "A pasos del metro.",
    };

    // El usuario guarda el proyecto como favorito y activa la campana "Notificar cambios"
    const alertConfig = favoritesLocalProvider.setAlert(LEAD_USER_ID, project.id, true, project);

    expect(favoritesLocalProvider.get(LEAD_USER_ID)).toContain(project.id);
    expect(alertConfig).toMatchObject({
      usuario_id: LEAD_USER_ID,
      proyecto_id: project.id,
      notificar_cambios: true,
      umbral_precio_min_uf: 3200,
      umbral_precio_max_uf: 3800,
      umbral_bono_pie_pct: 0,
    });
    expect(alertConfig.alerta_activada_at).toBeTruthy();

    // Renderiza el modal del proyecto favorito con la campana activa
    const html = renderToStaticMarkup(
      <ProjectEvaluationModal
        project={project}
        projects={[project]}
        context={BASE_EVALUATION.input}
        ufValueClp={38000}
        onboarding={{}}
        isFavorite={true}
        favoriteAlert={alertConfig}
        onToggleFavorite={vi.fn()}
        onToggleFavoriteAlert={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Notificar cambios"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Notificar cambios (activa)");
    expect(html).toContain("Alerta activa · Umbral desde 3.200 UF");
  });

  it("E1 (acotamiento): no muestra la campana de alertas de catálogo en avisos externos del portal", () => {
    const portalProject = {
      id: "portal-ext-1",
      origen: "portal",
      nombre: "Aviso Externo Portal",
      comuna: "Providencia",
      tipo_vivienda: "departamento",
      valor_uf: 3100,
      precio_min_uf: 3100,
      precio_max_uf: 3100,
      url: "https://www.portalinmobiliario.com/MLC-1",
    };

    const html = renderToStaticMarkup(
      <ProjectEvaluationModal
        project={portalProject}
        projects={[]}
        context={BASE_EVALUATION.input}
        ufValueClp={38000}
        onboarding={{}}
        isFavorite={true}
        onToggleFavorite={vi.fn()}
        onToggleFavoriteAlert={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).not.toContain('aria-label="Notificar cambios"');
  });

  it("E2: recalcula compatibilidad y notifica en el próximo inicio de sesión cuando la inmobiliaria reduce el precio o aplica un bono pie de 5%", () => {
    const tenant = localCatalogProvider.getTenantContext();
    const created = localCatalogProvider.createProject({
      inmobiliaria_id: tenant.inmobiliaria_id,
      nombre: "Edificio Verde Ñuñoa",
      comuna: "Ñuñoa",
      tipo: "departamento",
      estado: "en_construccion",
      precio_min_uf: 3200,
      precio_max_uf: 3800,
      bono_pie_pct: 0,
      descripcion: "Entrega 2027",
      entrega_estimada: "2027-08",
    });

    // E1: El lead activa "Notificar cambios" cuando el proyecto parte en 3.200 UF (sin bono pie)
    favoritesLocalProvider.setAlert(LEAD_USER_ID, created.id, true, created);

    // E2: La inmobiliaria actualiza el catálogo bajando el precio a 2.800 UF y aplicando bono pie del 5%
    const updated = localCatalogProvider.updateProject(created.id, {
      inmobiliaria_id: tenant.inmobiliaria_id,
      nombre: "Edificio Verde Ñuñoa",
      comuna: "Ñuñoa",
      tipo: "departamento",
      estado: "en_construccion",
      precio_min_uf: 2800,
      precio_max_uf: 3500,
      bono_pie_pct: 5,
      descripcion: "Campaña con bono pie 5%",
      entrega_estimada: "2027-08",
    });

    expect(updated.precio_min_uf).toBe(2800);
    expect(updated.bono_pie_pct).toBe(5);

    // Verifica que el umbral del favorito se actualizó a las nuevas condiciones
    const updatedAlerts = favoritesLocalProvider.getAlerts(LEAD_USER_ID);
    expect(updatedAlerts[created.id]).toMatchObject({
      notificar_cambios: true,
      umbral_precio_min_uf: 2800,
      umbral_precio_max_uf: 3500,
      umbral_bono_pie_pct: 5,
    });

    // Verifica que en el próximo inicio de sesión el comprador recibe la notificación recalculada
    const unseen = localLeadChangesProvider.getUnseen();
    const opportunityEvent = unseen.find(
      (event) =>
        event.event_type === "favorite_project_opportunity" &&
        event.project_id === created.id,
    );

    expect(opportunityEvent).toBeTruthy();
    expect(opportunityEvent.project_name).toBe("Edificio Verde Ñuñoa");
    expect(opportunityEvent.payload.price_dropped).toBe(true);
    expect(opportunityEvent.payload.bono_pie_increased).toBe(true);
    expect(opportunityEvent.payload.bono_pie_actual_pct).toBe(5);
    expect(opportunityEvent.payload.compatibility_before.status).toBe("no_compatible");
    expect(opportunityEvent.payload.compatibility_after.status).toBe("compatible_con_ajustes");

    // El usuario marca la alerta como vista en Inicio
    localLeadChangesProvider.markSeen(opportunityEvent.id);
    const remainingUnseen = localLeadChangesProvider.getUnseen();
    expect(remainingUnseen.find((item) => item.id === opportunityEvent.id)).toBeUndefined();
  });
});
