import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ states: [], refs: [], effects: [], stateIndex: 0, refIndex: 0 }));
const projectApi = vi.hoisted(() => ({ getProjectInstallmentScheme: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  const useState = (initial) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) {
      hooks.states[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      hooks.states[index],
      (next) => {
        hooks.states[index] = typeof next === "function" ? next(hooks.states[index]) : next;
      },
    ];
  };

  const useRef = (initial) => {
    const index = hooks.refIndex++;
    if (!(index in hooks.refs)) {
      hooks.refs[index] = { current: initial };
    }
    return hooks.refs[index];
  };

  const useMemo = (fn) => fn();
  const useCallback = (fn) => fn;

  const useEffect = (effect, deps) => {
    hooks.effects.push({ effect, deps });
  };

  return {
    ...actual,
    default: { ...actual.default, useState, useRef, useEffect, useMemo, useCallback },
    useState,
    useRef,
    useEffect,
    useMemo,
    useCallback,
  };
});

vi.mock("../services/projectService", () => ({
  getProjectInstallmentScheme: projectApi.getProjectInstallmentScheme,
}));

import GreenSavingsPlanner from "./GreenSavingsPlanner";

function find(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return null;
  return predicate(node) ? node : find(node.props.children, predicate);
}

const flushEffects = async () => {
  const currentEffects = [...hooks.effects];
  hooks.effects = [];
  for (const { effect } of currentEffects) {
    const cleanup = effect();
    if (typeof cleanup === "function") {
      // keep if needed
    }
  }
  await Promise.resolve();
};

const renderComponent = (props = {}) => {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  return GreenSavingsPlanner({
    referenceDate: new Date("2026-11-04T12:00:00Z"),
    ...props,
  });
};

describe("GreenSavingsPlanner - Actualización asíncrona de fecha de entrega", () => {
  beforeEach(() => {
    hooks.states = [];
    hooks.refs = [];
    hooks.effects = [];
    hooks.stateIndex = 0;
    hooks.refIndex = 0;
    vi.clearAllMocks();
  });

  it("actualiza plazoMeses a 4 meses al resolver la fecha de entrega (2027-03) si el usuario no lo editó", async () => {
    // Snapshot sin fecha de entrega
    const snapshotProject = {
      id: "proj-async-1",
      nombre: "Edificio Futuro",
      precio_min_uf: 3000,
      estado_proyecto: "verde",
    };

    projectApi.getProjectInstallmentScheme.mockResolvedValue({
      entrega_estimada: "2027-03",
      esquema_pie_inmobiliaria: null,
    });

    const onScheduleChange = vi.fn();

    // 1er render sincrónico
    let tree = renderComponent({
      project: snapshotProject,
      onScheduleChange,
    });

    // En el primer render, todavía no se resuelve la promesa del catálogo: plazo inicial es 18 meses
    let input = find(tree, (n) => n.type === "input" && n.props.id === "green-planner-plazo-meses");
    expect(input.props.value).toBe("18");

    // Ejecutar efectos (dispara getProjectInstallmentScheme)
    await flushEffects();
    await Promise.resolve();

    // 2do render: catalogScheme ya tiene entrega_estimada "2027-03"
    tree = renderComponent({
      project: snapshotProject,
      onScheduleChange,
    });

    // Ejecutar el efecto de sincronización de deliveryMonths -> plazoMesesInput
    await flushEffects();

    // 3er render: plazoMesesInput actualizado a "4"
    tree = renderComponent({
      project: snapshotProject,
      onScheduleChange,
    });
    await flushEffects();

    input = find(tree, (n) => n.type === "input" && n.props.id === "green-planner-plazo-meses");
    expect(input.props.value).toBe("4");

    // La cuota mensual sugerida en UF debe haberse calculado en base a 4 meses (300 UF / 4 = 75 UF)
    // y no en base a 18 meses (300 UF / 18 = 16.67 UF)
    const metric = find(tree, (n) => n.props && n.props["data-testid"] === "green-monthly-uf");
    expect(metric.props.children.join("")).toContain("75,00 UF");

    // onScheduleChange debió recibir el cronograma recalculado para 4 meses
    expect(onScheduleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        plazoMeses: 4,
        cuotaMensualUfDisplay: 75,
      }),
    );
  });

  it("no sobrescribe el plazo si el usuario ya lo había editado antes de resolver la promesa", async () => {
    const snapshotProject = {
      id: "proj-async-2",
      nombre: "Edificio Parque",
      precio_min_uf: 3000,
      estado_proyecto: "verde",
    };

    projectApi.getProjectInstallmentScheme.mockResolvedValue({
      entrega_estimada: "2027-03",
    });

    // 1er render
    let tree = renderComponent({ project: snapshotProject });

    // El usuario edita manualmente el input a "10" meses
    let input = find(tree, (n) => n.type === "input" && n.props.id === "green-planner-plazo-meses");
    input.props.onChange({ target: { value: "10" } });

    // Resolver promesa de catálogo y ejecutar efectos
    await flushEffects();
    await Promise.resolve();

    tree = renderComponent({ project: snapshotProject });
    await flushEffects();

    tree = renderComponent({ project: snapshotProject });
    input = find(tree, (n) => n.type === "input" && n.props.id === "green-planner-plazo-meses");

    // Debe conservar el valor ingresado por el usuario ("10") y NO sobrescribirlo con "4"
    expect(input.props.value).toBe("10");
  });

  it("no sobrescribe el plazo si se especificó initialPlazoMeses explícitamente", async () => {
    const snapshotProject = {
      id: "proj-async-3",
      nombre: "Edificio Central",
      precio_min_uf: 3000,
      estado_proyecto: "verde",
    };

    projectApi.getProjectInstallmentScheme.mockResolvedValue({
      entrega_estimada: "2027-03",
    });

    let tree = renderComponent({
      project: snapshotProject,
      initialPlazoMeses: 24,
    });

    await flushEffects();
    await Promise.resolve();

    tree = renderComponent({
      project: snapshotProject,
      initialPlazoMeses: 24,
    });
    await flushEffects();

    tree = renderComponent({
      project: snapshotProject,
      initialPlazoMeses: 24,
    });
    const input = find(tree, (n) => n.type === "input" && n.props.id === "green-planner-plazo-meses");
    expect(input.props.value).toBe("24");
  });
});
