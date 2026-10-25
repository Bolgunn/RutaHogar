import React from "react";

export default function CoDebtorPageShell({ children }) {
  return <div className="co-debtor-public-page hu30-page">
    <header className="co-debtor-public-page__brand">
      <img src="/brand/rutahogar/logo-rutahogar.svg" alt="RutaHogar" width="154" height="50" />
    </header>
    <main className="co-debtor-public-page__main">{children}</main>
  </div>;
}
