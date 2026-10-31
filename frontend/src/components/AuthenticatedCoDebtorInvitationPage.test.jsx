import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InvitationAccessView } from "./AuthenticatedCoDebtorInvitationPage";
it("preserves the access card and disables retry while authorizing", () => {
  const html = renderToStaticMarkup(<InvitationAccessView phase="checking" />);
  expect(html).toContain("hu30-access-card");
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("hu30-spinner");
  expect(html).toContain('disabled=""');
  expect(html).toContain("Verificando acceso");
});
it.each(["checking", "unavailable", "wrong_account", "verification", "authorized"])("does not render financial forms or identity details in %s", phase => {
  const html = renderToStaticMarkup(<InvitationAccessView phase={phase} />);
  expect(html).not.toContain("ingreso_mensual");
  expect(html).not.toContain("treatment_consent");
  expect(html).not.toContain("Confirmar mis antecedentes");
  if (phase === "wrong_account") expect(html).toContain("cambiar de cuenta");
  if (phase === "authorized") expect(html).toContain("Todavía no se ha registrado");
});
