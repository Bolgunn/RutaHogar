# System Actors — RutaHogar

The four actors of the RutaHogar system, from the **E4 Plan de Proyecto 2026**. Proficiency is rated on a 1–5 scale for both **technology handling** and **domain/context knowledge**.

---

## Strategic client

| | |
| :-- | :-- |
| **Name** | Ellison De Moraes Caram |
| **Profile** | Business Intelligence Manager with 11+ years in the real estate sector, specialized in commercial analysis, data management, and business-process optimization. |
| **Contact** | ecaram@ei.cl |

---

## Actors

### 1. Lead (person interested in buying a home)

- **Description:** person interested in acquiring their first home who does not know whether they meet the requirements to be a mortgage-credit subject.
- **Functions:** enter their financial/employment data; view their "financial health" diagnosis and follow the improvement-plan recommendations.
- **Technology handling:** intermediate (3).
- **Context knowledge:** low (1).
- **Justification:** as a first-time buyer, they don't know the banking requirements (income, required down payment, delinquency, employment history) or the technical jargon of the real estate/financial sector. However, as an average digital user, they handle web and mobile apps fluently at a general-user level.

### 2. Sales Executive

- **Description:** the real estate company's sales professional, responsible for closing deals.
- **Functions:** view the dashboard with the portfolio of pre-qualified leads in green/eligible status; filter prospects by scoring and contact viable clients.
- **Technology handling:** medium-high (4).
- **Context knowledge:** high (5).
- **Justification:** expert context knowledge — they master the real estate sales flow and credit requirements. Medium-high tech handling, as they already operate digital commercial-management tools such as CRMs and ERPs day to day.

### 3. Real Estate Admin

- **Description:** representative of the real estate company that contracted the service.
- **Functions:** assignment of executive roles within the company.
- **Technology handling:** intermediate (3).
- **Context knowledge:** high (5).
- **Justification:** expert context knowledge of the sales flow and credit requirements. Intermediate tech handling — they mostly operate their company's software and general tools (email, Excel), and struggle with new tools.

### 4. Admin Dev (development administrator)

- **Description:** representative of the system's development team.
- **Functions:** handling of traceability, logs, security, and manual adjustment of user scores.
- **Technology handling:** high (5).
- **Context knowledge:** intermediate (3).
- **Justification:** intermediate context knowledge, built from own research and client interviews. High tech handling — responsible for developing and maintaining features, so they understand the system architecture in depth and know the tools that make up the system.

---

## Summary

| Actor | Tech (1–5) | Context (1–5) | Primary stories |
| :---- | :--------: | :-----------: | :-------------- |
| Lead | 3 | 1 | [[UserStories/HU1-FinancialDataEntry\|HU 1]], [[UserStories/HU3-HybridScoring\|HU 3]], [[UserStories/HU4-ImprovementPlan\|HU 4]], [[UserStories/NFR-MobileLeadExperience\|Mobile Lead Experience (NFR)]] |
| Sales Executive | 4 | 5 | [[UserStories/HU2-LeadPrioritization\|HU 2]], [[UserStories/HU10-LeadProjectMatching\|HU 10]], [[UserStories/NFR-MobileExecutiveDashboard\|Mobile Executive Dashboard (NFR)]] |
| Real Estate Admin | 3 | 5 | [[UserStories/HU7-ProjectCatalog\|HU 7]], [[UserStories/OutOfBacklog-EventLogAnalytics\|Event-Log Analytics (out of backlog)]] |
| Admin Dev | 5 | 3 | [[UserStories/NFR-BasicSecurity\|Basic Security (NFR)]] |

---

Source: [[informes_entregas/E4 - GPI Plan de Proyecto 2026\|E4 — Plan de Proyecto 2026]], §2.
