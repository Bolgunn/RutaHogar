# Quality Attributes (RNF) — RutaHogar

The non-functional requirements (RNF) for RutaHogar, from the **E4 Plan de Proyecto 2026**. Each attribute has a SMART goal and a verification mechanism.

---

## Attributes

| Attribute | SMART goal | Verification mechanism |
| :-------- | :--------- | :--------------------- |
| **Ease of use** | At least 80% of users complete the form without help in under 10 minutes. | Tests with users seeking their first home, measuring average time, completeness, error count, and abandonment. |
| **Response time** | Page operations respond in ≤ 60 seconds on average. | Debug/testing tools (asserts) that run operations and print the average time, measured with a timer started at the beginning of the operation. |
| **Security** | The system must not request bank credentials or sensitive documents without first using security mechanisms such as HTTPS and two-factor access control. | Form review, security checklist, and deployment-configuration validation. |
| **Data privacy** | The system collects only the minimum necessary data (income, debt, savings, contract duration). | Data-model review and verification that no unnecessary fields are stored. |
| **Scalability** | The system supports more than 2,000 concurrent evaluations/queries. | Simulated load test of records in Supabase. |
| **Uptime** | The system is available at least 95% of the time. | Monitoring of the deployed service, logging/notifying outages. |
| **Maintainability** | The code is organized into separate modules: frontend, backend, and scoring rules. | Periodic review of the repository and the project structure. |
| **Traceability** | Each evaluation stores the date, the score obtained, and the generated classification. | View or direct query on the database to verify correct persistence. |

---

## Where these are enforced

| Attribute | Related stories / pages |
| :-------- | :---------------------- |
| Ease of use | [[UserStories/HU1-FinancialDataEntry\|HU 1]], [[UserStories/NFR-MobileLeadExperience\|Mobile Lead Experience (NFR)]] |
| Response time | [[UserStories/HU3-HybridScoring\|HU 3]] (E1 — 60 s), [[UserStories/NFR-SystemAvailability\|System Availability (NFR)]] |
| Security | [[UserStories/NFR-BasicSecurity\|Basic Security (NFR)]], [[Riesgos\|Riesgos técnicos]] |
| Data privacy | [[UserStories/HU1-FinancialDataEntry\|HU 1]] (consent), [[UserStories/NFR-PrivacyPanel\|Privacy Panel (NFR)]] (privacy panel), [[UserStories/OutOfBacklog-EventLogAnalytics\|Event-Log Analytics (out of backlog)]] (consent-gated logs) |
| Scalability & Uptime | [[UserStories/NFR-SystemAvailability\|System Availability (NFR)]] — System Availability & Scalability |
| Maintainability | [[deuda-tecnica\|Deuda técnica]], repository module structure |
| Traceability | [[UserStories/HU3-HybridScoring\|HU 3]] (E5), [[UserStories/NFR-EvaluationAudit\|Evaluation Audit (NFR)]] (audit), [[UserStories/NFR-ImmutableEvaluationHistory\|Immutable Evaluation History (NFR)]] (versioned history), [[Database/evaluations\|evaluations]] |

---

Source: [[informes_entregas/E4 - GPI Plan de Proyecto 2026\|E4 — Plan de Proyecto 2026]], §3.
