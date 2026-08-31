# Technical Risks — RutaHogar

The main technical risks identified in the **E4 Plan de Proyecto 2026**, with their mitigation plans. Priority is computed to rank where mitigation effort should go first.

**Priority formula:**

```
Priority = (11 − Likelihood) × (11 − Impact) × Withdrawal Cost
```

Likelihood and Impact are rated 1–10. A **lower** priority number means a **more critical** risk (high likelihood and high impact drive the first two factors toward small values).

---

## Risk register

| # | Risk | Likelihood | Impact | Withdrawal cost | Priority | Mitigation |
| :- | :--- | :--------: | :----: | :-------------: | :------: | :--------- |
| 1 | **Exposure of sensitive data** — the system collects user-declared financial data; risk if more data than needed is stored or permissions are misconfigured. | 6 | 10 | 8 | **40** | Data minimization, no bank credentials, RLS, HTTPS, and correct per-user data separation. |
| 2 | **Authentication/authorization vulnerabilities** — multiple roles with access to sensitive information; risk if permissions or sessions are implemented incorrectly. | 5 | 10 | 8 | **48** | Secure authentication, role validation, and security testing. |
| 3 | **Unreliable scoring** — security/response-time parameters not fully integrated into the initial Definition of Done; risk if rules don't represent real financial criteria. | 7 | 9 | 7 | **56** | Include security and performance parameters as specific acceptance criteria within the HUs from the planning phase. |
| 4 | **Regulatory non-compliance** — the system handles financial and personal data; risk if controls aren't aligned with current regulation. | 4 | 10 | 9 | **63** | Privacy by Design, explicit consent, and ARSOBP mechanisms. |
| 5 | **Accumulation of technical debt** — the Scrum team prioritizes fast delivery over refactoring and code review. | 6 | 8 | 7 | **105** | Make refactoring, unit tests, and code review mandatory items in the sprint backlog. |
| 6 | **Dependency on external services** — the system uses Supabase, external APIs, and generative AI; risk if any of these fails or changes. | 5 | 8 | 6 | **108** | Design decoupled components and fallback mechanisms (e.g. alternative dependencies). |
| 7 | **Resistance from sales executives** — executives could perceive the system as a threat to their professional judgment. | 5 | 8 | 5 | **90** | Present the tool as decision support, not a replacement. |
| 8 | **Low participation of real estate companies in validation** — the project needs feedback from real actors. | 7 | 10 | 7 | **28** | Early interviews and periodic validations. |
| 9 | **Uncontrolled scope growth** — new ideas and features emerge during the project without proper prioritization. | 4 | 8 | 7 | **147** | Keep a prioritized backlog and control changes through the Product Owner. |

---

## Reading the priorities

Sorted by priority (most critical first):

1. **Low participation of real estate companies** (28)
2. **Exposure of sensitive data** (40)
3. **Authentication/authorization vulnerabilities** (48)
4. **Unreliable scoring** (56)
5. **Regulatory non-compliance** (63)
6. **Resistance from sales executives** (90)
7. **Technical debt** (105)
8. **Dependency on external services** (108)
9. **Uncontrolled scope growth** (147)

---

## Related pages

- [[UserStories/NFR-BasicSecurity\|Basic Security (NFR)]] mitigates risks 1 and 2.
- [[AtributosDeCalidad\|Atributos de calidad (RNF)]] — the quality attributes that formalize several mitigations.
- [[deuda-tecnica\|Deuda técnica]] — the project's technical-debt tracking (risk 5).
- Source: [[informes_entregas/E4 - GPI Plan de Proyecto 2026\|E4 — Plan de Proyecto 2026]], §5.
