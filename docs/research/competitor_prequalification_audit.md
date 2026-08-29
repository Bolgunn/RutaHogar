# ScoreLeads Competitor Prequalification Audit

Reviewed: 2026-06-17  
Scope: public-facing Chilean real estate, mortgage, proptech, banking, portal, and inmobiliaria flows.  
Deliverable status: raw evidence matrix completed before recommendations. See `competitor_field_matrix.csv` and `inmobiliaria_field_matrix.csv` for field-by-field rows.

## Methodology

I visited each target through public web pages and browser-visible flows. Where safe, I used synthetic personas only up to non-submitting calculator or pre-result states:

- Strong buyer: high income, low debt, 20% down payment, stable dependent worker, immediate purchase timing.
- Medium buyer: moderate property/pie assumptions where pages exposed defaults.
- Weak buyer: used only for validation checks, e.g. a too-low down payment in Casaverso.

I captured:

- Visible step order and step URLs.
- Exact field labels and answer options when exposed.
- Required/contact/RUT/CAPTCHA/login gates.
- Public thresholds and guidance shown in copy or calculator output.
- Stop point and evidence quality per site.

I did not submit any form that could create a lead, request an executive callback, transmit contact data, or pass a CAPTCHA.

## Safety Boundaries Followed

- Only public pages and public calculators were used.
- No private APIs, hidden admin endpoints, source maps, credentials, or non-public data were accessed.
- No real personal data was entered.
- Synthetic identity fields were used only where needed to reveal non-contact financial steps and were stopped before email/RUT/phone.
- No CAPTCHA was solved.
- No login was attempted.
- No final lead, contact, quote, WhatsApp, reservation, or bank application submission was completed.
- If a page required RUT, phone, email, login, CAPTCHA, or final contact before value, it was documented and stopped.

## Phase 1 - Deep Audit Highest-Signal Flows

### TOCTOC + Itaú

URL: https://www.toctoc.com/credito-hipotecario  
Category: portal / bank alliance  
Evidence quality: `observed_after_safe_synthetic_input`  
Confidence: high

Observed public flow:

1. User enters `Ingreso líquido`.
2. Optional checkbox: `¿Ya tienes la propiedad de tus sueños?`.
3. Click `Calcular`.
4. Page shows term tabs: 10, 15, 20, 25, 30 years.
5. Result block shows dividend max, property value, credit amount, insurance estimates, and property-value range.
6. CTA routes to `Simular crédito hipotecario` / pre-evaluation; stopped before that.

Synthetic evidence:

- Input: income $2,500,000.
- Output: `Dividendo máx.` $625,000, `Valor Propiedad` UF 1,823, `Monto Crédito` UF 1,458.
- Visible footnote: dividend max corresponds to 25% of declared salary.
- Visible footnote: credit calculation is based on 80% financing.

Visible guidance:

- Minimum monthly rent: $1,500,000.
- Good financial behavior/no morosities.
- Labor tenure: minimum 3 months for dependents and 1 year for independents.

Stop point: before pre-evaluation CTA because it would route to a bank/executive process.

### Creditú

URL: https://simulador.creditu.com/cl/simulation  
Category: proptech / mortgage advisor  
Evidence quality: `observed_after_safe_synthetic_input`, `stopped_due_contact_data`  
Confidence: medium

Observed field order:

1. `¿Cuál es tu nombre?` / `Nombre`.
2. `¿Cuál es tu apellido?` / `Apellido`.
3. `¿Deseas comprar con o sin subsidio habitacional?` with `Sin subsidio` / `Con subsidio`.
4. `¿Cuál es el valor de la vivienda?` UF.
5. `¿Cuál es el monto del Pie?` UF.
6. `¿Cuál es tu ingreso líquido mensual?`.
7. `¿Cuánto pagas mensualmente en cuotas de otros créditos?`.
8. Optional `Agregar un codeudor`, revealing `¿Cuál es el ingreso líquido mensual de tu codeudor?`.
9. Optional `Agregar inmobiliaria`.
10. `Situación laboral`: `Dependiente`, `Independiente`.
11. `Fecha estimada de compra`: `Menos de 3 meses`, `De 3 a 6 meses`, `De 6 meses a 1 año`, `Más de 1 año`, `No lo se`.
12. Contact gate: `¿Cuál es tu correo electrónico?`, `¿Cuál es tu Rut?`, `¿Cuál es tu telefono?`.

Stop point: email/RUT/phone gate before result. No contact data entered.

Key evidence:

- Other credit payments are first-class input.
- Codebtor is income amount, not a Boolean.
- Purchase timing is collected before result, likely for commercial readiness.

### Casaverso / BancoEstado Portal

URLs:

- https://bancoestado.enlaceinmobiliario.cl/
- https://casaverso.cl/simulador?step=TipoPropiedadCondicion

Category: bank portal / marketplace  
Evidence quality: `observed_after_safe_synthetic_input`, `partial_due_rendering`  
Confidence: medium

Observed portal entry:

- Portal search asks for `Busca por región o comuna` and property name/code.
- Visible CTA: `Simulador Hipotecario`.

Observed simulator steps:

1. Paso 1: `¿Qué tipo de propiedad estas buscando?` with `Departamento` / `Casa`.
2. Same step: `¿En qué condición estás buscando?` with `Nuevas` / `Usadas`.
3. For new property, checkbox appears: `¿Es una eco vivienda?`.
4. Paso 2: `¿Cuándo quieres comprar tu casa propia?` with `Inmediatamente`, `Antes de 2 meses`, `Entre 2 y 6 meses`, `Más de 6 meses, solo estoy mirando`.
5. Paso 3: `¿Cuánto quieres pedir?` with `Valor de la propiedad` in UF and `¿Cuál es tu pie?` in CLP; `¿Quieres complementar renta?` checkbox.
6. Paso 4: `¿Postulaste o ya tienes un subsidio habitacional?` with `SI` / `NO`; FOGAES checkbox and explanatory copy.
7. Paso 5: `¿Cuál es tu edad?`; copy says age determines maximum credit term.

Validation observed:

- With property UF 3,500 and a low CLP pie, the page showed: `El pie debe estar entre el 10% y el 90% del valor de la propiedad`.

Visible FOGAES/subsidy copy:

- For new homes up to 4,000 UF.
- For subsidized new homes up to 3,000 UF.
- Can reduce pie to 10%.

Stop point: `Ver resultados` stayed disabled after age input in browser; no component internals were forced.

### ComparaOnline

URL: https://www.comparaonline.cl/credito-hipotecario  
Category: portal / comparator  
Evidence quality: `observed_directly`  
Confidence: high

Observed fields:

- `Valor de la propiedad`.
- `Monto de pie`.
- `Plazo en años`.
- `Califica como DFL2` checkbox.
- Quick pie buttons: 10%, 15%, 20%, 25%, 30%.
- Quick term buttons: 5, 10, 15, 20, 25, 30 years.
- Filters: fixed/mixed/variable rate, bank/mutual, provider.

Visible outcome:

- Product ranking with dividend total, interest rate, total cost in UF, operational expenses, maximum term, and `Solicitar` CTA.

Stop point: before `Solicitar`, because that would create a lead or external request.

### Buydepa

URLs:

- https://buydepa.com/
- https://buydepa.com/credito
- https://buydepa.com/credito/formulario

Category: proptech / marketplace  
Evidence quality: `observed_directly`, `stopped_due_contact_data`  
Confidence: high

Observed homepage:

- Property filters: comuna, dormitorios, max price UF, type.
- Credit block: `Tu dividendo, calculado en 30 segundos`.
- Public guidance: pre-approval online, compares banks, dedicated advisory.
- Example: property UF 3,500, pie 15% UF 525, dividend from UF 16.5.
- Copy says Buydepa finances up to 15% of the down payment.

Observed full credit form:

- Titular/cotitular request code.
- Names, RUT, birth date, gender, phone, email, nationality.
- Housing situation, address, region/comuna.
- Profession, institution, education level, completion.
- Employment situation.
- Marital status, dependents.
- Debts: debt type, bank, currency, original amount, monthly payment, total/installments remaining, current debt.
- Real estate assets, investments, vehicles.
- Advisor type.
- Estimated target property price.
- Submit.

Stop point: field observation only. The form is a full personal/financial lead application with reCAPTCHA field visible.

### Banco Falabella

URL: https://www.bancofalabella.cl/creditos/hipotecario  
Category: bank  
Evidence quality: `inferred_from_public_copy` / public requirements page  
Confidence: medium

Visible requirements:

- Minimum age 26.
- Liquid monthly rent at least $800,000.
- Good financial behavior, without current moras or protestos.
- Labor tenure: 12 months dependent, 24 months independent.
- Financing up to 90% for first home.
- Term 5 to 30 years.

Stop point: before simulator/application CTA.

### Renta Nacional Mutuos Hipotecarios

URL: https://mutuoshipotecarios.rentanacional.cl/  
Category: mutuaria  
Evidence quality: `observed_directly`  
Confidence: high

Observed flow:

1. Plazo en años stepper.
2. Renta líquida monthly input.
3. `Estima tu cuota`.
4. Result area for `Dividendo máximo` and `Crédito máximo`.

Visible guidance:

- Up to 90% financing.
- Up to 40-year term.
- Up to 6 months grace.
- Age + term cannot exceed 76 years and 364 days for mortgage life insurance coverage.
- Public subsidy path for new homes up to 4,000 UF.

Stop point: before `Quiero ser contactado`.

### Socovesa

URLs:

- https://www.socovesa.cl/
- https://www.socovesa.cl/como-comprar/formas-de-financiamiento/complementar-renta/
- https://www.socovesa.cl/como-comprar/formas-de-financiamiento/pie-en-cuotas/

Category: inmobiliaria  
Evidence quality: `observed_directly`  
Confidence: high

Observed public patterns:

- Search filters: city/comuna, property type, status.
- AI advisor surfaced before contact.
- Financing guidance pages: property as part payment, complement rent, pie in cuotas, subsidy.

Complement rent page:

- Complement can be spouse, direct family, or a third party/partner with children in common.
- Requirements include last three payslips for dependent workers or tax returns for independent workers, AFP certificate for last 12 contributions, and ID copy.

Stop point: public guidance only; no contact or AI chat submission.

## Phase 2 - Remaining List A

### banca.me

URL: https://www.banca.me/  
Evidence quality: `inferred_from_public_copy`  
Confidence: low

Homepage exposes `Pie Hipotecario` and `Crédito Hipotecario` CTAs. Copy emphasizes 100% online, quick process, and pie financing for missing down payment. No public mortgage form fields were exposed before CTA.

### Tu Hipotecario

URL resolved: https://www.tuhipotecario.cl/  
Evidence quality: `observed_directly`, `stopped_due_contact_data`  
Confidence: medium

Observed contact/qualification form fields:

- Nombre y Apellidos.
- Email.
- Teléfono.
- Rut.
- Rango de Renta.

Visible income bands:

- Menos de $1,300,000.
- $1,300,000 a $1,500,000.
- $1,500,000 a $2,000,000.
- $2,000,000 a $3,000,000.
- $3,000,000 a $4,000,000.
- $5,000,000 o más.

Stop point: before sending contact/RUT.

### Credibid

URL: https://www.credibid.com/  
Evidence quality: `partial_due_rendering`, `inferred_from_public_copy`  
Confidence: low

Browser repeatedly rendered blank/about:blank. Public indexed copy suggests a mini mortgage/dividend calculator and B2B credit decisioning content, but field sequence was not directly verified. Treat as weak evidence only.

### LIDZ.ai

URL: https://www.lidz.ai/  
Evidence quality: `observed_directly`, `stopped_due_lead_submission`  
Confidence: medium

B2B SaaS lead qualification. Public demo form asks name, phone, email and message. Public copy emphasizes lead qualification, contactability, reservations, and response improvements. No consumer mortgage score flow.

### Bci

URLs:

- https://www.bci.cl/personas/credito-hipotecario
- https://www.bci.cl/personas/credito-hipotecario/simulador

Evidence quality: product page `partial_due_rendering`; simulator `observed_directly`, `stopped_due_contact_data`  
Confidence: low to medium

Simulator DOM exposed name, surname, RUT and email before a reliable calculator result. Login/account panels were visible. Stopped before entering identity/contact data.

### Itaú

URL: https://www.itau.cl/personas/creditos/credito-hipotecario  
Evidence quality: `observed_directly`, `inferred_from_public_copy`  
Confidence: medium

Product page routes to TOCTOC alliance and explains online approval, document upload/income validation, notifications, and advisor support. Public copy includes FOGAES/subsidio for new homes up to 4,000 UF.

### Scotiabank

URL: https://www.scotiabankchile.cl/credito-hipotecario  
Evidence quality: `partial_due_rendering`  
Confidence: low

The browser sweep did not expose reliable form fields. Title/copy indicates simulation and pre-approval online. No field order inferred.

### BancoEstado Product Page

URL: https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/creditos/creditos-hipotecarios.html  
Evidence quality: `observed_directly`, `inferred_from_public_copy`  
Confidence: medium

Public product guidance references up to 90% financing, terms 8/12/15/20/25/30, grace/no-payment options, preferred rate with account/PAC, and complement rent with family or non-family. Portal/simulator details are in Casaverso row.

### Banco de Chile

URLs:

- https://sitiospublicos.bancochile.cl/personas/credito-hipotecario
- https://appspublicas.bancochile.cl/persona/simulador-hipotecario/

Evidence quality: product `observed_directly`; simulator `observed_directly`, `stopped_due_captcha_or_login`, `stopped_due_contact_data`  
Confidence: medium

Product page explains request/evaluation process. Simulator asks RUT/name and property data at step 1 and is protected by reCAPTCHA. Stopped immediately.

### Coopeuch

URL: https://www.coopeuch.cl/personas/credito-hipotecario.html  
Evidence quality: `partial_due_rendering`  
Confidence: low

No reliable fields captured in the public browser sweep.

### CMF Educa

URL: https://www.cmfchile.cl/educa/621/w3-article-27376.html  
Evidence quality: `observed_directly`  
Confidence: high

Educational page lists documentation and capacity checks:

- Dependents: payslips and contract/antigüedad.
- Independents: tax declarations.
- Assets may be requested.
- Complement rent requires same antecedents from the complementing person.
- Mentions subsidy path for natural persons buying new homes up to 4,000 UF.

### MINVU

URL: https://www.minvu.gob.cl/nuevo-subsidio-al-credito-hipotecario/  
Evidence quality: `observed_directly`  
Confidence: high

Public subsidy page:

- New homes up to 4,000 UF.
- Rate reduction around 0.61% to 1.16%.
- Down payment reduced to 10%.
- Example shows monthly dividend reduction for 3,000 UF and 4,000 UF homes over 30 years.

## Phase 3 - Remaining Inmobiliarias

### Maestra

URL: https://maestra.cl/  
Evidence quality: `observed_directly`, `stopped_due_contact_data`  
Confidence: medium

Contact form asks name, RUT, surname, phone, email, request type and message. Public financing copy highlights:

- Pie amigable: pay down payment in up to 18 installments with credit card.
- Reserva liviana: reserve with $100,000.
- Pay pie monthly or via PAT/PAC.

### Fundamenta

URL: https://www.fundamenta.cl/  
Evidence quality: `partial_due_rendering`, `inferred_from_public_copy`  
Confidence: low

Mostly project search/newsletter/contact. No reliable public financial qualification fields captured.

### ECASA

URL: https://ecasa.cl/  
Evidence quality: `observed_directly`, `partial_due_rendering`  
Confidence: low

Project discovery and subsidy/how-to-buy pages. No public scoring/calculator captured before contact.

### Almagro

URL: https://www.almagro.cl/  
Evidence quality: `partial_due_rendering`  
Confidence: low

Page rendered blank/about:blank in browser run. No reliable fields captured.

### Pilares

URL: https://www.pilares.cl/  
Evidence quality: `observed_directly`, `stopped_due_contact_data`  
Confidence: medium

Public contact/advisory form asks:

- Nombre.
- Apellido.
- RUT.
- Email.
- Teléfono.
- Preferred contact mode: Email/Whatsapp/Teléfono.
- Project selection.

Visible financing guidance includes `Subsidio DS1`, `Tu depto es tu pie`, and `Subsidio a la tasa`.

### Inmobiliaria PY

URL: https://py.cl/  
Evidence quality: `partial_due_rendering`  
Confidence: low

Page rendered blank/about:blank in browser run. No reliable fields captured.

### INU / Nueva Urbe

URL: https://www.inu.cl/  
Evidence quality: `observed_directly`  
Confidence: medium

Public purchase process:

1. Cotización.
2. Oferta de Compra / reserva.
3. Financiamiento.
4. Firma de Promesa.
5. Firma de Escritura.
6. Entrega.

Useful for sales stage mapping, not scoring.

### iProvidencia

URL: https://www.iprovidencia.cl/  
Evidence quality: `partial_due_rendering`  
Confidence: low

Page rendered blank/about:blank in browser run. No reliable fields captured.

### Puerto Capital

URL: https://puertocapital.cl/  
Evidence quality: `observed_directly`, `stopped_due_lead_submission`  
Confidence: medium

Home exposes project filters by comuna and type of purchase, plus `Agenda Ahora`, `Simulador`, project agenda, and WhatsApp quote links. Stopped before agenda/WhatsApp.

### RVC

URL: https://www.rvc.cl/simulador-de-credito-hipotecario/  
Evidence quality: `observed_directly`  
Confidence: high

Calculator copy asks:

- Precio de la propiedad.
- Monto del pie.
- Años de plazo.
- Tasa de interés anual estimada.

Contact form on same page asks name, RUT, email, phone, and city of interest, but calculator is conceptually separate.

### SSILVA

URL: https://www.ssilva.cl/  
Evidence quality: `partial_due_rendering`  
Confidence: low

Current browser run rendered blank/about:blank. Earlier sweep found quote/newsletter patterns but no public calculator.

## Common Public Qualification Signals

High-confidence common signals:

- Renta líquida / ingreso mensual.
- Property value or desired financing amount.
- Down payment / pie available.
- Estimated dividend or term/rate inputs to derive it.
- Existing monthly debt or other credit payments.
- Employment type: dependent vs independent.
- Labor tenure / antigüedad.
- Credit behavior / no morosities.
- Codebtor/complement income amount.
- Subsidy/FOGAES eligibility.
- Property type and condition: house/apartment, new/used.
- Purchase timing / urgency.
- Property selected vs browsing.
- DFL2 or property tax/legal category in comparison contexts.

Medium-confidence or sales-readiness signals:

- Investor vs owner-occupier intent.
- Project selected.
- Preferred contact channel.
- Existing property as part payment.
- Pie en cuotas interest.
- Advisor/broker source.

Sensitive or invasive signals often seen in bank/full advisory forms:

- RUT.
- Phone and email.
- Age/date of birth.
- Nationality/residency.
- Gender.
- Marital status.
- Dependents.
- Full address.
- Education/profession.
- Assets, vehicles, investments.
- Document uploads or tax/payslip proofs.

## Visible Thresholds and Rules

- TOCTOC: max dividend is 25% of declared salary.
- TOCTOC: calculator assumes 80% financing.
- Casaverso: pie must be between 10% and 90% of property value.
- Casaverso/MINVU: FOGAES/subsidy can reduce pie to 10% for eligible new homes.
- MINVU/Casaverso/Itaú/Renta Nacional: subsidy/FOGAES broadly references new homes up to 4,000 UF; Casaverso also mentions subsidized new homes up to 3,000 UF.
- TOCTOC: minimum rent $1,500,000 for pre-evaluation guidance.
- Banco Falabella: minimum rent $800,000.
- TOCTOC: labor tenure 3 months dependent, 1 year independent.
- Banco Falabella: labor tenure 12 months dependent, 24 months independent.
- Renta Nacional: age + term cannot exceed 76 years and 364 days for life insurance coverage.
- Common standard: terms around 5-30 years; Renta Nacional advertises up to 40 years.

## UX Patterns

Better acquisition patterns:

- Give a useful estimate before asking for contact/RUT.
- Keep the first input low-friction: income, property value, or property target.
- Show assumptions beside output.
- Explain that the result is preliminary, not bank approval.
- Separate calculator from commercial handoff.

Patterns to avoid for ScoreLeads:

- Asking RUT/contact before showing any value.
- Asking full bank application data in a pre-score flow.
- Treating pie in cuotas as current savings.
- Treating subsidy as repayment capacity.
- Using sensitive data like nationality, gender, marital status, or dependents in a lightweight score.

## Direct Source List

Core observed URLs:

- https://www.toctoc.com/credito-hipotecario
- https://simulador.creditu.com/cl/simulation
- https://bancoestado.enlaceinmobiliario.cl/
- https://casaverso.cl/simulador?step=TipoPropiedadCondicion
- https://www.comparaonline.cl/credito-hipotecario
- https://buydepa.com/
- https://buydepa.com/credito
- https://buydepa.com/credito/formulario
- https://www.bancofalabella.cl/creditos/hipotecario
- https://mutuoshipotecarios.rentanacional.cl/
- https://www.socovesa.cl/
- https://www.socovesa.cl/como-comprar/formas-de-financiamiento/complementar-renta/
- https://www.rvc.cl/simulador-de-credito-hipotecario/
- https://www.cmfchile.cl/educa/621/w3-article-27376.html
- https://www.minvu.gob.cl/nuevo-subsidio-al-credito-hipotecario/
