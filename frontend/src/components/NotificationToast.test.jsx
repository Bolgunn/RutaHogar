import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotificationToast, { notificationLayout } from "./NotificationToast";

const high = { id: "high", className: "notification-toast--high-score" };
const opportunity = { id: "opportunity", className: "notification-toast--opportunities" };

describe("notification stacking", () => {
  it("anchors either notification alone to the bottom", () => {
    expect(notificationLayout([high])[0].bottom).toBe(0);
    expect(notificationLayout([opportunity])[0].bottom).toBe(0);
  });
  it("stacks opportunities above high scores using measured heights, regardless of registration order", () => {
    const layout = notificationLayout([opportunity, high], { high: 164, opportunity: 120 });
    expect(layout.map((item) => item.id)).toEqual(["high", "opportunity"]);
    expect(layout[1].bottom).toBe(176);
  });
  it("moves the remaining upper notification to the bottom after dismissal", () => {
    const before = notificationLayout([high, opportunity], { high: 164 });
    const after = notificationLayout([opportunity], { high: 164 });
    expect(before[1].bottom).toBe(176);
    expect(after[0].bottom).toBe(0);
  });
  it("keeps zero counts hidden and provides distinct accessible action and close buttons", () => {
    expect(renderToStaticMarkup(<NotificationToast count={0} />)).toBe("");
    const html = renderToStaticMarkup(<NotificationToast count={11} title="11 oportunidades nuevas" className={opportunity.className} />);
    expect(html).toContain('Cerrar notificación: 11 oportunidades nuevas');
    expect(html).toContain('Revisar oportunidades');
    expect((html.match(/type="button"/g) || []).length).toBe(2);
  });
});
