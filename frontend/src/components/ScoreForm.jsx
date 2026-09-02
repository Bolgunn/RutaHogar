import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { calculateAge } from "../utils/helpers";
import {
  calculateMortgageDividend,
  REFERENTIAL_MORTGAGE_ANNUAL_RATE,
  roundCurrency,
} from "../lib/mortgage";
import FieldTooltip from "./FieldTooltip";
import DataConsent from "./DataConsent";

const FALLBACK_UF_VALUE_CLP = 40695;
const DEBUG_SCORE_REQUESTS =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_SCORE === "true";

const currentYear = new Date().getFullYear();
const dayOptions = Array.from({ length: 31 }, (_, i) => {
  const value = String(i + 1).padStart(2, "0");
  return { value, label: value };
});
const monthOptions = [
  ["01", "Enero"], ["02", "Febrero"], ["03", "Marzo"], ["04", "Abril"],
  ["05", "Mayo"], ["06", "Junio"], ["07", "Julio"], ["08", "Agosto"],
  ["09", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
].map(([value, month]) => ({ value, label: `${value} ${month}` }));
const yearOptions = Array.from({ length: currentYear - 18 - 1900 + 1 }, (_, i) => {
  const value = String(currentYear - 18 - i);
  return { value, label: value };
});

function onlyDigits(value, maxLength) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function buildBirthDateIso({ birth_day, birth_month, birth_year }) {
  const day = onlyDigits(birth_day, 2).padStart(2, "0");
  const month = onlyDigits(birth_month, 2).padStart(2, "0");
  const year = onlyDigits(birth_year, 4);
  if (year.length !== 4 || day.length !== 2 || month.length !== 2) return "";
  return `${year}-${month}-${day}`;
}

function normalizeBirthDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return "";
}

function BirthDateField({ name, value, placeholder, ariaLabel, maxLength, options, activeDropdown, onOpen, onClose, onBlur, onChange, onSelect }) {
  const isOpen = activeDropdown === name;
  return (
    <div className="date-dropdown-field">
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        onFocus={() => onOpen(name)}
        onBlur={onBlur}
        inputMode="numeric"
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        autoComplete="off"
      />
      {isOpen && (
        <div className="date-dropdown-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(name, option.value); onClose(); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const mortgageTerms = [10, 15, 20, 25, 30];
const buyerObjectives = new Set([
  "comprar_ahora",
  "prepararme",
  "evaluar_capacidad",
]);
const referencePropertyValuesUf = {
  Buin: 2800,
  "Calera de Tango": 4300,
  Cerrillos: 3000,
  "Cerro Navia": 2400,
  Colina: 3800,
  Conchalí: 2800,
  "El Bosque": 2300,
  "Estación Central": 3100,
  Huechuraba: 4700,
  Independencia: 3300,
  "La Cisterna": 3200,
  "La Florida": 3900,
  "La Granja": 2500,
  "La Pintana": 2200,
  "La Reina": 7200,
  Lampa: 3000,
  "Las Condes": 9200,
  "Lo Barnechea": 10500,
  "Lo Espejo": 2200,
  "Lo Prado": 2700,
  Macul: 4100,
  Maipú: 3600,
  Melipilla: 2400,
  Ñuñoa: 6200,
  "Padre Hurtado": 3000,
  Paine: 2700,
  "Pedro Aguirre Cerda": 2600,
  Peñaflor: 2900,
  Peñalolén: 4700,
  Pirque: 4300,
  Providencia: 7600,
  Pudahuel: 2900,
  "Puente Alto": 3100,
  Quilicura: 3200,
  "Quinta Normal": 3300,
  Recoleta: 3400,
  Renca: 2600,
  "San Bernardo": 2800,
  "San Joaquín": 3500,
  "San José de Maipo": 3300,
  "San Miguel": 4500,
  "San Ramón": 2400,
  Santiago: 3800,
  Talagante: 3100,
  Vitacura: 12000,
};
const DEFAULT_REFERENCE_PROPERTY_VALUE_UF = 3500;
const weakComplementRelations = new Set(["amigo", "otro"]);
const continuityMinimumYears = {
  menos_6_meses: 0,
  entre_6_y_12_meses: 0.5,
  entre_1_y_3_anios: 1,
  mas_3_anios: 3,
};

// Campos enteros (solo dígitos, sin decimales)
const integerFormattedFields = new Set([
  "ingreso_mensual",
  "deuda_mensual",
  "ahorro_disponible",
  "dividendo_estimado",
  "monto_morosidad",
  "ingreso_mensual_complementario",
  "deuda_mensual_complementario",
  "valor_vehiculos",
  "valor_inmuebles",
  "property_value",
]);

function formatPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return `${Math.round(numericValue * 1000) / 10}%`;
}

function normalizePurchaseTermForScore(value) {
  const labels = {
    "0_3_meses": "inmediato",
    "3_6_meses": "3_a_6_meses",
    "6_12_meses": "6_a_12_meses",
    "3_a_6_meses": "3_a_6_meses",
    "6_a_12_meses": "6_a_12_meses",
    inmediato: "inmediato",
    mas_12_meses: "mas_12_meses",
    solo_explorando: "solo_explorando",
  };
  return labels[value] || undefined;
}

function buildPropertyValues(value, unit, ufValueClp) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return {
      property_value: undefined,
      property_value_unit: unit,
      property_value_uf: undefined,
      property_value_clp: undefined,
    };
  }

  const valueUf = unit === "uf" ? numericValue : numericValue / ufValueClp;
  const valueClp = unit === "clp" ? numericValue : numericValue * ufValueClp;

  return {
    property_value: numericValue,
    property_value_unit: unit,
    property_value_uf: roundCurrency(valueUf),
    property_value_clp: Math.round(valueClp),
  };
}

function buildReferencePropertyValues(commune, ufValueClp) {
  const referenceUf =
    referencePropertyValuesUf[commune] || DEFAULT_REFERENCE_PROPERTY_VALUE_UF;
  return {
    property_value: referenceUf,
    property_value_unit: "uf",
    property_value_uf: referenceUf,
    property_value_clp: Math.round(referenceUf * ufValueClp),
    property_value_source: referencePropertyValuesUf[commune]
      ? "referencia_comuna"
      : "referencia_general",
  };
}

// Formatea un string de dígitos a formato es-CL (puntos de miles)
function formatInteger(raw) {
  if (raw === "" || raw == null) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits === "") return "";
  return Number(digits).toLocaleString("es-CL");
}

// Quita los puntos de miles para obtener el valor numérico raw
function stripFormat(value) {
  return String(value)
    .replace(/\./g, "")
    .replace(/[^0-9]/g, "");
}

function isContinuityIncompatibleWithAge(continuity, age) {
  if (!continuity || !Number.isFinite(age)) return false;
  const minimumYears = continuityMinimumYears[continuity];
  if (minimumYears == null) return false;
  return minimumYears > Math.max(0, age - 18);
}

function resolveApiBase() {
  const configuredUrl =
    import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const fallbackUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
  return String(configuredUrl || fallbackUrl).replace(/\/$/, "");
}

function findInvalidScoringNumbers(payload) {
  const requiredNumericFields = [
    "ingreso_mensual",
    "deuda_mensual",
    "edad",
    "ahorro_disponible",
    "plazo_credito_hipotecario",
    "dividendo_estimado",
    "uf_value_clp",
  ];

  return requiredNumericFields
    .filter((field) => !Number.isFinite(Number(payload[field])))
    .concat(
      payload.property_value_uf != null &&
        !Number.isFinite(Number(payload.property_value_uf))
        ? ["property_value_uf"]
        : [],
    );
}

export default function ScoreForm({
  targetCommune,
  objective,
  onboardingData,
  birthDate,
  profile,
  consentGranted,
  isAnon = false,
  onResult,
  onConsentAccept,
  onViewConsent,
  onBirthDateSave,
}) {
  const debtIncomeMessage =
    "El monto de deuda mensual no puede ser mayor a tus ingresos declarados. Revisa este valor antes de continuar.";
  const storedBirthDate = normalizeBirthDate(
    birthDate || profile?.birth_date || profile?.fecha_nacimiento || "",
  );
  const needsBirthDate = !storedBirthDate;
  const contextCompleted = Boolean(onboardingData);
  const [birthFields, setBirthFields] = useState({ birth_day: "", birth_month: "", birth_year: "" });
  const [activeDateDropdown, setActiveDateDropdown] = useState(null);
  const effectiveBirthDate = needsBirthDate ? buildBirthDateIso(birthFields) : storedBirthDate;
  const declaredAge = useMemo(() => calculateAge(effectiveBirthDate), [effectiveBirthDate]);
  const asksPropertyValue = buyerObjectives.has(objective);

  const [form, setForm] = useState({
    ingreso_mensual: "",
    deuda_mensual: "",
    ahorro_disponible: "",
    property_value: "",
    property_value_unit: "uf",
    plazo_credito_hipotecario: "",
    tipo_contrato: "",
    continuidad_laboral: "",
    morosidad_actual: "",
    monto_morosidad: "",
    antiguedad_morosidad: "",
    dividendo_estimado: "",
    complemento_renta: false,
    ingreso_mensual_complementario: "",
    deuda_mensual_complementario: "",
    tipo_contrato_complementario: "",
    continuidad_laboral_complementario: "",
    morosidad_complementario: "",
    relacion_complementario: "",
    consentimiento: false,
    declara_patrimonio: false,
    valor_vehiculos: "",
    valor_inmuebles: "",
    patrimonio_unit: "clp",
  });

  // Estado paralelo solo para mostrar los valores formateados en pantalla
  const [displayValues, setDisplayValues] = useState({});
  const [dividendWasManuallyEdited, setDividendWasManuallyEdited] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ufValueClp, setUfValueClp] = useState(FALLBACK_UF_VALUE_CLP);
  const [ufStatus, setUfStatus] = useState("fallback");
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState(null);
  const [currentStep, setCurrentStep] = useState(contextCompleted ? 2 : (needsBirthDate ? 1 : 2));

  const consentDate = consentTimestamp
    ? new Date(consentTimestamp).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;

  const debtExceedsIncome =
    form.ingreso_mensual !== "" &&
    form.deuda_mensual !== "" &&
    Number(form.deuda_mensual) > Number(form.ingreso_mensual);

  const mortgageTerm = Number(form.plazo_credito_hipotecario);
  const showMortgageAgeWarning =
    Number.isFinite(declaredAge) &&
    Number.isFinite(mortgageTerm) &&
    mortgageTerm > 0 &&
    declaredAge + mortgageTerm > 70;

  const showComplementRelationWarning = weakComplementRelations.has(
    form.relacion_complementario,
  );
  const showComplementMorosityWarning = form.morosidad_complementario === "si";
  const complementRequiredFields = [
    form.ingreso_mensual_complementario,
    form.deuda_mensual_complementario,
    form.tipo_contrato_complementario,
    form.continuidad_laboral_complementario,
    form.morosidad_complementario,
    form.relacion_complementario,
  ];
  const complementFieldsIncomplete = complementRequiredFields.some(
    (value) => value === "" || value == null,
  );
  const patrimonioValues = [form.valor_vehiculos, form.valor_inmuebles];
  const patrimonioFieldsIncomplete = patrimonioValues.every(
    (value) => value === "" || value == null,
  );
  const continuityAgeMismatch = isContinuityIncompatibleWithAge(
    form.continuidad_laboral,
    declaredAge,
  );

  const ufHelpText =
    ufStatus === "loading"
      ? `Consultando valor UF referencial. Respaldo interno: $${ufValueClp.toLocaleString("es-CL")}.`
      : ufStatus === "live"
        ? `Valor UF referencial actualizado: $${ufValueClp.toLocaleString("es-CL")}.`
        : `Valor UF referencial: $${ufValueClp.toLocaleString("es-CL")} (respaldo interno).`;

  const propertyValuesForDividend = useMemo(
    () =>
      asksPropertyValue
        ? buildPropertyValues(form.property_value, form.property_value_unit, ufValueClp)
        : buildReferencePropertyValues(targetCommune, ufValueClp),
    [asksPropertyValue, form.property_value, form.property_value_unit, targetCommune, ufValueClp],
  );
  const mortgageEstimate = useMemo(
    () =>
      calculateMortgageDividend({
        propertyValueClp: propertyValuesForDividend.property_value_clp,
        savingsClp: form.ahorro_disponible,
        termYears: form.plazo_credito_hipotecario,
        annualRate: REFERENTIAL_MORTGAGE_ANNUAL_RATE,
      }),
    [
      propertyValuesForDividend.property_value_clp,
      form.ahorro_disponible,
      form.plazo_credito_hipotecario,
    ],
  );
  const savingsDownPaymentRatio = useMemo(() => {
    const propertyValueClp = Number(propertyValuesForDividend.property_value_clp);
    const savingsClp = Number(form.ahorro_disponible);
    if (
      !Number.isFinite(propertyValueClp) ||
      propertyValueClp <= 0 ||
      !Number.isFinite(savingsClp) ||
      savingsClp < 0
    ) {
      return null;
    }
    return savingsClp / propertyValueClp;
  }, [propertyValuesForDividend.property_value_clp, form.ahorro_disponible]);
  const savingsDownPaymentLabel = formatPercent(savingsDownPaymentRatio);
  const calculatedDividend = mortgageEstimate.dividend;
  const effectiveDividend =
    dividendWasManuallyEdited || calculatedDividend == null
      ? Number(form.dividendo_estimado)
      : calculatedDividend;
  const hasValidDividend =
    Number.isFinite(effectiveDividend) &&
    effectiveDividend >= 0 &&
    (form.dividendo_estimado !== "" || calculatedDividend != null);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2500);

    async function loadUfValue() {
      try {
        setUfStatus("loading");
        const response = await fetch("https://mindicador.cl/api/uf", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No se pudo obtener la UF.");
        const data = await response.json();
        const latestUf = Number(data?.serie?.[0]?.valor);
        if (!Number.isFinite(latestUf) || latestUf <= 0)
          throw new Error("UF invalida.");
        setUfValueClp(Math.round(latestUf));
        setUfStatus("live");
      } catch {
        setUfValueClp(FALLBACK_UF_VALUE_CLP);
        setUfStatus("fallback");
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    loadUfValue();
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    setForm((prev) => ({ ...prev, consentimiento: consentGranted }));
    if (consentGranted && !consentTimestamp) {
      setConsentTimestamp(new Date().toISOString());
    } else if (!consentGranted) {
      setConsentTimestamp(null);
    }
  }, [consentGranted]);

  useEffect(() => {
    if (consentModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    // Limpieza al desmontar
    return () => {
      document.body.style.overflow = "";
    };
  }, [consentModalOpen]);

  useEffect(() => {
    if (dividendWasManuallyEdited) return;

    if (calculatedDividend == null) {
      setForm((prev) => (prev.dividendo_estimado === "" ? prev : { ...prev, dividendo_estimado: "" }));
      setDisplayValues((prev) => {
        if (!("dividendo_estimado" in prev)) return prev;
        const next = { ...prev };
        delete next.dividendo_estimado;
        return next;
      });
      return;
    }

    const nextDividend = String(calculatedDividend);
    setForm((prev) =>
      prev.dividendo_estimado === nextDividend
        ? prev
        : { ...prev, dividendo_estimado: nextDividend },
    );
    setDisplayValues((prev) => ({
      ...prev,
      dividendo_estimado: formatInteger(nextDividend),
    }));
  }, [calculatedDividend, dividendWasManuallyEdited]);

  const handleBirthFieldChange = (e) => {
    const { name, value } = e.target;
    const maxLen = name === "birth_year" ? 4 : 2;
    setBirthFields((prev) => ({ ...prev, [name]: onlyDigits(value, maxLen) }));
  };

  const handleBirthFieldSelect = (name, value) => {
    setBirthFields((prev) => ({ ...prev, [name]: value }));
  };

  const normalizeBirthField = (name) => {
    setBirthFields((prev) => {
      if (name !== "birth_day" && name !== "birth_month") return prev;
      const digits = onlyDigits(prev[name], 2);
      if (!digits) return prev;
      return { ...prev, [name]: digits.padStart(2, "0") };
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Campos de montos enteros: autoformatear con puntos de miles
    if (integerFormattedFields.has(name)) {
      const raw = stripFormat(value); // "1200000"
      const formatted = formatInteger(raw); // "1.200.000"
      if (name === "dividendo_estimado") {
        setDividendWasManuallyEdited(true);
      }
      setDisplayValues((prev) => ({ ...prev, [name]: formatted }));
      setForm((prev) => {
        const next = { ...prev, [name]: raw };
        if (name === "morosidad_actual" && value !== "si") {
          next.monto_morosidad = "";
          next.antiguedad_morosidad = "";
        }
        return next;
      });
      return;
    }

    // Resto de campos: lógica original
    setForm((prev) => {
      const next = {
        ...prev,
        [name]:
          type === "checkbox"
            ? checked
            : type === "number"
              ? value === ""
                ? ""
                : value
              : value,
      };

      if (name === "morosidad_actual" && value !== "si") {
        next.monto_morosidad = "";
        next.antiguedad_morosidad = "";
      }

      return next;
    });
  };

  // Helper para obtener el valor de display de un campo formateado
  const displayVal = (name) => {
    if (name in displayValues) return displayValues[name];
    const raw = form[name];
    if (raw === "" || raw == null) return "";
    if (integerFormattedFields.has(name)) return formatInteger(raw);
    return raw;
  };

  const useCalculatedDividend = () => {
    if (calculatedDividend == null) return;
    const nextDividend = String(calculatedDividend);
    setDividendWasManuallyEdited(false);
    setForm((prev) => ({ ...prev, dividendo_estimado: nextDividend }));
    setDisplayValues((prev) => ({
      ...prev,
      dividendo_estimado: formatInteger(nextDividend),
    }));
  };

  const switchPropertyUnit = () => {
    setForm((prev) => {
      const nextUnit = prev.property_value_unit === "uf" ? "clp" : "uf";
      const currentValue = Number(prev.property_value);
      if (!Number.isFinite(currentValue) || currentValue <= 0) {
        return { ...prev, property_value_unit: nextUnit };
      }
      const convertedValue =
        nextUnit === "clp"
          ? Math.round(currentValue * ufValueClp)
          : Math.round(currentValue / ufValueClp);
      const convertedRaw = String(convertedValue);
      setDisplayValues((d) => ({
        ...d,
        property_value: formatInteger(convertedRaw),
      }));
      return {
        ...prev,
        property_value_unit: nextUnit,
        property_value: convertedRaw,
      };
    });
  };

  const switchPatrimonioUnit = () => {
    setForm((prev) => {
      const nextUnit = prev.patrimonio_unit === "uf" ? "clp" : "uf";
      const nextForm = { ...prev, patrimonio_unit: nextUnit };
      const nextDisplay = { ...displayValues };

      if (prev.valor_vehiculos !== "") {
        const val = Number(prev.valor_vehiculos);
        const converted =
          nextUnit === "clp"
            ? String(Math.round(val * ufValueClp))
            : String(roundCurrency(val / ufValueClp));
        nextForm.valor_vehiculos = converted;
        nextDisplay.valor_vehiculos = formatInteger(converted);
      }
      if (prev.valor_inmuebles !== "") {
        const val = Number(prev.valor_inmuebles);
        const converted =
          nextUnit === "clp"
            ? String(Math.round(val * ufValueClp))
            : String(roundCurrency(val / ufValueClp));
        nextForm.valor_inmuebles = converted;
        nextDisplay.valor_inmuebles = formatInteger(converted);
      }

      setDisplayValues(nextDisplay);
      return nextForm;
    });
  };

  const validate = () => {
    const missing = [];
    if (form.ingreso_mensual === "") missing.push("Ingreso mensual");
    if (form.deuda_mensual === "") missing.push("Deuda mensual");
    if (!Number.isFinite(declaredAge))
      missing.push(needsBirthDate ? "Fecha de nacimiento" : "Fecha de nacimiento del perfil");
    if (form.ahorro_disponible === "") missing.push("Ahorro disponible");
    if (asksPropertyValue && form.property_value === "")
      missing.push("Monto estimado de vivienda");
    if (!form.plazo_credito_hipotecario)
      missing.push("Plazo estimado del crédito hipotecario");
    if (!form.tipo_contrato) missing.push("Tipo de contrato");
    if (!form.continuidad_laboral) missing.push("Continuidad laboral");
    if (!form.morosidad_actual) missing.push("Situacion de morosidad");
    if (form.morosidad_actual === "si") {
      if (form.monto_morosidad === "") missing.push("Monto de morosidad");
      if (!form.antiguedad_morosidad) missing.push("Antiguedad de morosidad");
    }
    if (!targetCommune) missing.push("Comuna objetivo preliminar");
    if (!hasValidDividend) missing.push("Dividendo estimado");

    if (form.complemento_renta && complementFieldsIncomplete) {
      setError(
        "Completa los datos del complementario antes de calcular tu preevaluación.",
      );
      return false;
    }

    if (form.declara_patrimonio && patrimonioFieldsIncomplete) {
      setError(
        "Completa la información de patrimonio antes de calcular tu preevaluación.",
      );
      return false;
    }

    if (missing.length) {
      setError(`Complete todos los campos: ${missing.join(", ")}`);
      return false;
    }

    if (continuityAgeMismatch) {
      setError(
        "La continuidad laboral declarada no es coherente con tu edad registrada. Revisa este dato antes de continuar.",
      );
      return false;
    }

    const numericRules = [
      [
        "Ingreso mensual",
        form.ingreso_mensual,
        (value) => value > 0,
        "debe ser mayor que 0.",
      ],
      [
        "Deuda mensual",
        form.deuda_mensual,
        (value) => value >= 0,
        "debe ser mayor o igual a 0.",
      ],
      [
        "Edad declarada",
        declaredAge,
        (value) => value >= 18 && value <= 100,
        "debe estar entre 18 y 100.",
      ],
      [
        "Ahorro disponible",
        form.ahorro_disponible,
        (value) => value >= 0,
        "no puede ser negativo.",
      ],
      [
        "Dividendo estimado",
        effectiveDividend,
        (value) => value >= 0,
        "no puede ser negativo.",
      ],
      [
        "Plazo estimado del crédito hipotecario",
        form.plazo_credito_hipotecario,
        (value) => mortgageTerms.includes(value),
        "es invalido.",
      ],
    ];

    if (asksPropertyValue) {
      numericRules.push([
        "Monto estimado de vivienda",
        form.property_value,
        (value) => value > 0,
        "debe ser mayor que 0.",
      ]);
    }

    if (form.morosidad_actual === "si") {
      numericRules.push([
        "Monto de morosidad",
        form.monto_morosidad,
        (value) => value > 0,
        "debe ser mayor que 0.",
      ]);
    }

    if (form.complemento_renta) {
      numericRules.push(
        [
          "Ingreso mensual complementario",
          form.ingreso_mensual_complementario,
          (parsed) => parsed > 0,
          "debe ser mayor que 0.",
        ],
        [
          "Deuda mensual complementaria",
          form.deuda_mensual_complementario,
          (parsed) => parsed >= 0,
          "no puede ser negativo.",
        ],
      );
    }

    if (form.declara_patrimonio) {
      [
        ["Valor de vehiculos", form.valor_vehiculos],
        ["Valor de inmuebles", form.valor_inmuebles],
      ].forEach(([label, value]) => {
        if (value !== "") {
          numericRules.push([
            label,
            value,
            (parsed) => parsed > 0,
            "debe ser mayor que 0.",
          ]);
        }
      });
    }

    const invalidNumber = numericRules.find(([, value, isValid]) => {
      const parsedValue = Number(value);
      return !Number.isFinite(parsedValue) || !isValid(parsedValue);
    });
    if (invalidNumber) {
      setError(`${invalidNumber[0]} ${invalidNumber[3]}`);
      return false;
    }

    if (debtExceedsIncome) {
      setError(debtIncomeMessage);
      return false;
    }

    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    let scoreUrl = "";
    let scorePayload = null;
    try {
      const propertyValues = propertyValuesForDividend;
      const dividendValue =
        dividendWasManuallyEdited || calculatedDividend == null
          ? Number(form.dividendo_estimado)
          : calculatedDividend;
      if (!Number.isFinite(dividendValue) || dividendValue < 0) {
        setError("No pudimos calcular un dividendo estimado válido. Revisa monto de vivienda, ahorro disponible y plazo del crédito.");
        setLoading(false);
        return;
      }
      const dividendSource =
        dividendWasManuallyEdited || calculatedDividend == null
          ? "manual"
          : "calculado_referencial";

      const payload = {
        birth_date: effectiveBirthDate || undefined,
        ingreso_mensual: parseFloat(form.ingreso_mensual),
        deuda_mensual: parseFloat(form.deuda_mensual),
        edad: declaredAge,
        ahorro_disponible: parseFloat(form.ahorro_disponible),
        ...propertyValues,
        plazo_credito_hipotecario: parseInt(form.plazo_credito_hipotecario, 10),
        tipo_contrato: form.tipo_contrato,
        continuidad_laboral: form.continuidad_laboral,
        morosidad_actual: form.morosidad_actual,
        monto_morosidad:
          form.morosidad_actual === "si"
            ? parseFloat(form.monto_morosidad)
            : undefined,
        antiguedad_morosidad:
          form.morosidad_actual === "si"
            ? form.antiguedad_morosidad
            : undefined,
        comuna_objetivo: targetCommune,
        dividendo_estimado: dividendValue,
        dividendo_esperado: dividendValue,
        dividendo_estimado_origen: dividendSource,
        dividendo_estimado_calculado: calculatedDividend ?? undefined,
        dividendo_estimado_manual:
          dividendSource === "manual" ? dividendValue : undefined,
        dividendo_tasa_anual_referencial: REFERENTIAL_MORTGAGE_ANNUAL_RATE,
        dividendo_monto_credito_estimado_clp: mortgageEstimate.principalClp,
        dividendo_monto_credito_estimado_uf:
          mortgageEstimate.principalClp && ufValueClp
            ? roundCurrency(mortgageEstimate.principalClp / ufValueClp)
            : undefined,
        dividendo_uf_referencial_clp: ufValueClp,
        complemento_renta: form.complemento_renta,
        ingreso_mensual_complementario:
          form.complemento_renta && form.ingreso_mensual_complementario !== ""
            ? parseFloat(form.ingreso_mensual_complementario)
            : undefined,
        deuda_mensual_complementario:
          form.complemento_renta && form.deuda_mensual_complementario !== ""
            ? parseFloat(form.deuda_mensual_complementario)
            : undefined,
        tipo_contrato_complementario:
          form.tipo_contrato_complementario || undefined,
        continuidad_laboral_complementario:
          form.continuidad_laboral_complementario || undefined,
        morosidad_complementario: form.morosidad_complementario || undefined,
        relacion_complementario: form.relacion_complementario || undefined,
        consentimiento: form.consentimiento,
        declara_patrimonio: form.declara_patrimonio,
        valor_vehiculos:
          form.declara_patrimonio && form.valor_vehiculos !== ""
            ? parseFloat(form.valor_vehiculos)
            : 0,
        valor_inmuebles:
          form.declara_patrimonio && form.valor_inmuebles !== ""
            ? parseFloat(form.valor_inmuebles)
            : 0,
        patrimonio_unit: form.patrimonio_unit,
        uf_value_clp: ufValueClp,
        plazo_compra: normalizePurchaseTermForScore(onboardingData?.plazo_compra),
        tiene_propiedad_vista: onboardingData?.tiene_propiedad_vista === true,
      };
      scorePayload = payload;

      if (needsBirthDate && effectiveBirthDate && onBirthDateSave) {
        try {
          await onBirthDateSave(effectiveBirthDate);
        } catch (saveError) {
          console.warn("No se pudo guardar la fecha de nacimiento en el perfil.", saveError);
        }
      }

      const invalidNumbers = findInvalidScoringNumbers(payload);
      if (invalidNumbers.length) {
        if (DEBUG_SCORE_REQUESTS) {
          console.error("RutaHogar /score payload inválido", {
            invalidNumbers,
            payload,
          });
        } else {
          console.warn("RutaHogar /score payload inválido", {
            invalidNumbers,
          });
        }
        setError(
          `No se pudo enviar el formulario porque estos campos no tienen un número válido: ${invalidNumbers.join(", ")}.`,
        );
        return;
      }

      const apiBase = resolveApiBase();
      scoreUrl = `${apiBase}/score`;
      if (DEBUG_SCORE_REQUESTS) {
        console.info("RutaHogar /score request", {
          url: scoreUrl,
          payload,
          onboarding_data: onboardingData || {
            objetivo_principal: objective,
            comuna_interes: targetCommune,
          },
          dividendo_esperado: payload.dividendo_esperado,
          property_value_uf: payload.property_value_uf,
          ahorro_disponible: payload.ahorro_disponible,
          plazo_credito_hipotecario: payload.plazo_credito_hipotecario,
          uf_value_clp: payload.uf_value_clp,
        });
      }

      const res = await axios.post(scoreUrl, payload, {
        timeout: 60000,
      });

      onResult(res.data, payload);
    } catch (err) {
      const calledUrl = scoreUrl || `${resolveApiBase()}/score`;
      const errorLog = {
        url: calledUrl,
        status: err?.response?.status,
        message: err?.message,
        code: err?.code,
      };
      if (DEBUG_SCORE_REQUESTS) {
        errorLog.responseBody = err?.response?.data;
        errorLog.payload = scorePayload;
        errorLog.error = err;
      }
      console.error("RutaHogar /score error", errorLog);
      if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
        setError("La petición tardó demasiado, por favor intenta nuevamente.");
      } else if (import.meta.env.DEV && err.response?.status) {
        setError(
          `No se pudo calcular el score. El backend respondió ${err.response.status}. Revisa la consola para ver el detalle.`,
        );
      } else if (import.meta.env.DEV && err.request) {
        setError(
          `No se pudo conectar con el backend local en ${calledUrl}. Verifica que FastAPI esté corriendo en el puerto 8000.`,
        );
      } else {
        setError(
          "Hubo un problema con la petición, por favor intenta nuevamente.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = 4;
  const stepLabels = ["Contexto", "Finanzas", "Trabajo", "Resultado"];
  const stepToRealStep = (s) => (needsBirthDate ? s : s + 1);

  const canGoNext = () => {
    if (currentStep === 1 && needsBirthDate && !contextCompleted) {
      return Boolean(effectiveBirthDate);
    }
    if (currentStep === 2) {
      if (!form.ingreso_mensual || form.ingreso_mensual === "") return false;
      if (!form.deuda_mensual || form.deuda_mensual === "") return false;
      if (!form.ahorro_disponible || form.ahorro_disponible === "") return false;
      if (!form.plazo_credito_hipotecario) return false;
      if (asksPropertyValue && (!form.property_value || form.property_value === "")) return false;
      return true;
    }
    if (currentStep === 3) {
      if (!form.tipo_contrato) return false;
      if (!form.continuidad_laboral) return false;
      if (!form.morosidad_actual) return false;
      if (form.morosidad_actual === "si") {
        if (form.monto_morosidad === "" || form.monto_morosidad === undefined) return false;
        if (!form.antiguedad_morosidad) return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (currentStep < totalSteps) {
      setError(null);
      setCurrentStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goBack = () => {
    if (currentStep > 1 && !(currentStep === 2 && !needsBirthDate)) {
      setError(null);
      setCurrentStep((s) => s - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <form onSubmit={submit} className="pre-wizard">
      {/* Progress bar */}
      <div className="pre-wizard-progress">
        <div className="pre-wizard-progress-top">
          <span className="pre-wizard-progress-label">Precalificación</span>
          <span className="pre-wizard-progress-step">Paso {currentStep} de {totalSteps}</span>
        </div>
        <div className="pre-wizard-progress-bar">
          <div className="pre-wizard-progress-fill" style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
        </div>
      </div>

      {/* Step indicators */}
      <div className="pre-wizard-steps">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const isDone = (stepNum < currentStep) || (stepNum === 1 && contextCompleted && currentStep > 1);
          const isActive = stepNum === currentStep;
          return (
            <div key={label} className={`pre-wizard-step${isDone ? " is-done" : ""}${isActive ? " is-active" : ""}`}>
              <span className="pre-wizard-step-num">{isDone ? "✓" : stepNum}</span>
              <span className="pre-wizard-step-label">{label}</span>
              {stepNum < totalSteps && <span className="pre-wizard-step-line" />}
            </div>
          );
        })}
      </div>

      {/* ═══ Step 1: Datos personales ═══ */}
      {needsBirthDate && currentStep === 1 && (
        <div className="pre-wizard-card">
          <div className="pre-wizard-card-header">
            <div className="pre-wizard-card-eyebrow">Información personal</div>
            <h1 className="pre-wizard-card-title">¿Cuándo naciste?</h1>
            <p className="pre-wizard-card-desc">
              Tu edad se usa para calcular el plazo máximo del crédito hipotecario.
            </p>
          </div>

          <div className="pre-wizard-field">
            <label className="pre-wizard-field-label">Fecha de nacimiento</label>
            <div className="birth-date-grid" onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setActiveDateDropdown(null);
            }}>
              <BirthDateField
                name="birth_day"
                value={birthFields.birth_day}
                onChange={handleBirthFieldChange}
                onOpen={setActiveDateDropdown}
                onClose={() => setActiveDateDropdown(null)}
                onSelect={handleBirthFieldSelect}
                onBlur={() => normalizeBirthField("birth_day")}
                maxLength="2"
                placeholder="DD"
                ariaLabel="Día de nacimiento"
                options={dayOptions}
                activeDropdown={activeDateDropdown}
              />
              <BirthDateField
                name="birth_month"
                value={birthFields.birth_month}
                onChange={handleBirthFieldChange}
                onOpen={setActiveDateDropdown}
                onClose={() => setActiveDateDropdown(null)}
                onSelect={handleBirthFieldSelect}
                onBlur={() => normalizeBirthField("birth_month")}
                maxLength="2"
                placeholder="MM"
                ariaLabel="Mes de nacimiento"
                options={monthOptions}
                activeDropdown={activeDateDropdown}
              />
              <BirthDateField
                name="birth_year"
                value={birthFields.birth_year}
                onChange={handleBirthFieldChange}
                onOpen={setActiveDateDropdown}
                onClose={() => setActiveDateDropdown(null)}
                onSelect={handleBirthFieldSelect}
                onBlur={() => normalizeBirthField("birth_year")}
                maxLength="4"
                placeholder="AAAA"
                ariaLabel="Año de nacimiento"
                options={yearOptions}
                activeDropdown={activeDateDropdown}
              />
            </div>
          </div>

          <div className="pre-wizard-nav">
            <div />
            <button type="button" className="pre-wizard-btn-next" onClick={goNext} disabled={!effectiveBirthDate}>
              Continuar
              <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Datos financieros ═══ */}
      {currentStep === 2 && (
        <div className="pre-wizard-card">
          <div className="pre-wizard-card-header">
            <div className="pre-wizard-card-eyebrow">Datos financieros</div>
            <h1 className="pre-wizard-card-title">Tu situación financiera</h1>
            <p className="pre-wizard-card-desc">
              Usa montos aproximados. No pedimos claves, documentos ni información bancaria privada.
            </p>
          </div>

          <div className="tip" style={{ marginBottom: '1.25rem' }}>
            <div className="tip__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
            <div className="tip__text">
              <strong>Consejo:</strong> Usa tu ingreso líquido real. No incluyas propinas o bonos variables.
            </div>
          </div>

          {/* ── Datos financieros ── */}
          <div className="pre-wizard-grid-2">
            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="ingreso_mensual">
                  Ingreso mensual
                </label>
                <FieldTooltip text="Sueldo líquido o renta variable promedio de los últimos 6 meses." />
              </div>
              <input
                type="text"
                inputMode="numeric"
                id="ingreso_mensual"
                name="ingreso_mensual"
                value={displayVal("ingreso_mensual")}
                onChange={handleChange}
                placeholder="Ej: 1.200.000"
              />
            </div>

            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="deuda_mensual">
                  Deuda mensual
                </label>
                <FieldTooltip text="Considera el total de tus compromisos financieros mensuales vigentes: créditos de consumo, automotrices e hipotecarios, cuota mínima de tarjetas de crédito, línea de crédito, avances o superavances, créditos estudiantiles, préstamos de cooperativas, cajas de compensación, casas comerciales y pensiones alimenticias. No considera gastos comunes, servicios básicos, alimentación ni otros gastos cotidianos." />
              </div>
              <input
                type="text"
                inputMode="numeric"
                id="deuda_mensual"
                name="deuda_mensual"
                value={displayVal("deuda_mensual")}
                onChange={handleChange}
                placeholder="Ej: 150.000"
                aria-invalid={debtExceedsIncome}
              />
              {debtExceedsIncome && (
                <span className="field-warning" style={{ color: '#B83232', fontSize: 12 }}>
                  {debtIncomeMessage}
                </span>
              )}
            </div>
          </div>

          <div className="pre-wizard-field">
            <div className="pre-wizard-field-label-row">
              <label className="pre-wizard-field-label" htmlFor="ahorro_disponible">
                Ahorro disponible
              </label>
              <FieldTooltip text="Dinero disponible hoy para el pago inicial de la vivienda: ahorros propios, APV o Cuenta 2 que puedas usar. No incluyas apoyos no confirmados como si ya fueran ahorro disponible." />
            </div>
            <input
              type="text"
              inputMode="numeric"
              id="ahorro_disponible"
              name="ahorro_disponible"
              value={displayVal("ahorro_disponible")}
              onChange={handleChange}
              placeholder="Ej: 3.000.000"
            />
            {savingsDownPaymentLabel && (
              <span className="pre-wizard-field-hint">
                Equivale aproximadamente al {savingsDownPaymentLabel} del valor objetivo.
              </span>
            )}
          </div>

          {asksPropertyValue && (
            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="property_value">
                  Monto estimado de la vivienda
                </label>
                <FieldTooltip text="Precio de venta aproximado de la propiedad que deseas adquirir." />
              </div>
              <div className="unit-input">
                <input
                  type="text"
                  inputMode="decimal"
                  id="property_value"
                  name="property_value"
                  value={displayVal("property_value")}
                  onChange={handleChange}
                  placeholder={form.property_value_unit === "uf" ? "Ej: 3.500" : "Ej: 136.500.000"}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary-button unit-toggle"
                  onClick={switchPropertyUnit}
                >
                  {form.property_value_unit === "uf" ? "UF" : "CLP"}
                </button>
              </div>
              {form.property_value && (
                <span className="pre-wizard-field-hint">
                  {form.property_value_unit === "uf"
                    ? `Referencia: $${(Number(form.property_value) * ufValueClp).toLocaleString("es-CL")} CLP`
                    : `Referencia: ${(Number(form.property_value) / ufValueClp).toFixed(2)} UF`}
                  . {ufHelpText}
                </span>
              )}
            </div>
          )}

          <div className="pre-wizard-grid-2">
            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="plazo_credito_hipotecario">
                  Plazo del crédito
                </label>
                <FieldTooltip text="Número de años en que planeas pagar el crédito. Los plazos más comunes van de 10 a 30 años." />
              </div>
              <select
                id="plazo_credito_hipotecario"
                name="plazo_credito_hipotecario"
                value={form.plazo_credito_hipotecario}
                onChange={handleChange}
              >
                <option value="">Selecciona un plazo</option>
                {mortgageTerms.map((term) => (
                  <option key={term} value={term}>{term} años</option>
                ))}
              </select>
              {showMortgageAgeWarning && (
                <span className="field-warning" style={{ color: '#C4841D', fontSize: 12 }}>
                  Con {declaredAge} años, el plazo máximo recomendado es {Math.max(10, 70 - declaredAge)} años.
                </span>
              )}
            </div>

            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="dividendo_estimado">
                  Dividendo estimado
                </label>
                <FieldTooltip text="Cuota mensual referencial calculada con monto de vivienda, ahorro disponible, plazo y tasa hipotecaria referencial." />
              </div>
              <input
                type="text"
                inputMode="numeric"
                id="dividendo_estimado"
                name="dividendo_estimado"
                value={displayVal("dividendo_estimado")}
                onChange={handleChange}
                placeholder="Se calcula automáticamente"
              />
              {calculatedDividend != null && dividendWasManuallyEdited && (
                <button type="button" className="pre-wizard-field-hint" onClick={useCalculatedDividend} style={{ background: 'none', border: 'none', color: 'var(--rh-gold-dark)', cursor: 'pointer', fontWeight: 600, padding: 0, textAlign: 'left', font: 'inherit' }}>
                  Usar cálculo referencial: ${formatInteger(String(calculatedDividend))}
                </button>
              )}
              {calculatedDividend != null && !dividendWasManuallyEdited && (
                <span className="pre-wizard-field-hint">
                  Dividendo referencial: ${formatInteger(String(calculatedDividend))} (tasa {formatPercent(REFERENTIAL_MORTGAGE_ANNUAL_RATE)} anual)
                </span>
              )}
            </div>
          </div>

          <div className="pre-wizard-nav">
            <button type="button" className="pre-wizard-btn-back" onClick={goBack}>
              <svg viewBox="0 0 20 20" fill="none"><path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Volver
            </button>
            <button type="button" className="pre-wizard-btn-next" onClick={goNext} disabled={!canGoNext()}>
              Continuar
              <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      )}
      {/* ═══ Step 3: Trabajo y antecedentes ═══ */}
      {currentStep === 3 && (
        <div className="pre-wizard-card">
          <div className="pre-wizard-card-header">
            <div className="pre-wizard-card-eyebrow">Trabajo y antecedentes</div>
            <h1 className="pre-wizard-card-title">Situación laboral</h1>
            <p className="pre-wizard-card-desc">
              La morosidad es autodeclarada y sólo se usa como señal orientativa.
            </p>
          </div>

          <div className="pre-wizard-grid-2">
            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="tipo_contrato">Tipo de contrato</label>
                <FieldTooltip text="Modalidad bajo la cual recibes tus ingresos actualmente." />
              </div>
              <select id="tipo_contrato" name="tipo_contrato" value={form.tipo_contrato} onChange={handleChange}>
                <option value="">Selecciona un tipo</option>
                <option value="indefinido">Indefinido</option>
                <option value="independiente">Independiente</option>
                <option value="plazo_fijo">Plazo fijo</option>
                <option value="honorarios_variable">Honorarios / variable</option>
              </select>
            </div>

            <div className="pre-wizard-field">
              <div className="pre-wizard-field-label-row">
                <label className="pre-wizard-field-label" htmlFor="continuidad_laboral">Continuidad laboral</label>
                <FieldTooltip text="Tiempo que llevas trabajando de forma continua en tu empleo o actividad actual." />
              </div>
              <select id="continuidad_laboral" name="continuidad_laboral" value={form.continuidad_laboral} onChange={handleChange}>
                <option value="">Selecciona una opción</option>
                <option value="menos_6_meses">Menos de 6 meses</option>
                <option value="entre_6_y_12_meses">Entre 6 y 12 meses</option>
                <option value="entre_1_y_3_anios">Entre 1 y 3 años</option>
                <option value="mas_3_anios">Más de 3 años</option>
              </select>
              {continuityAgeMismatch && (
                <span className="pre-wizard-field-hint" style={{ color: '#B83232' }}>
                  La continuidad laboral declarada no es coherente con tu edad registrada.
                </span>
              )}
            </div>
          </div>

          <div className="pre-wizard-field">
            <div className="pre-wizard-field-label-row">
              <label className="pre-wizard-field-label" htmlFor="morosidad_actual">Morosidad actual</label>
              <FieldTooltip text="Indica si tienes cuotas o pagos vencidos en este momento." />
            </div>
            <select id="morosidad_actual" name="morosidad_actual" value={form.morosidad_actual} onChange={handleChange}>
              <option value="">Selecciona una opción</option>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </div>

          {form.morosidad_actual === "si" && (
            <div className="pre-wizard-grid-2">
              <div className="pre-wizard-field">
                <div className="pre-wizard-field-label-row">
                  <label className="pre-wizard-field-label" htmlFor="monto_morosidad">Monto de morosidad</label>
                  <FieldTooltip text="Total aproximado de deuda morosa que tienes actualmente." />
                </div>
                <input type="text" inputMode="numeric" id="monto_morosidad" name="monto_morosidad" value={displayVal("monto_morosidad")} onChange={handleChange} placeholder="Ej: 250.000" />
              </div>
              <div className="pre-wizard-field">
                <div className="pre-wizard-field-label-row">
                  <label className="pre-wizard-field-label" htmlFor="antiguedad_morosidad">Antigüedad de morosidad</label>
                  <FieldTooltip text="Hace cuánto tiempo tienes esta deuda morosa sin regularizar." />
                </div>
                <select id="antiguedad_morosidad" name="antiguedad_morosidad" value={form.antiguedad_morosidad} onChange={handleChange}>
                  <option value="">Selecciona una opción</option>
                  <option value="menos_3_meses">Menos de 3 meses</option>
                  <option value="3_a_12_meses">3 a 12 meses</option>
                  <option value="1_a_3_anios">1 a 3 años</option>
                  <option value="mas_3_anios">Más de 3 años</option>
                </select>
              </div>
            </div>
          )}

          {/* Complemento de renta */}
          <div className="pre-wizard-divider" />

          <label className="pre-wizard-check-row">
            <input type="checkbox" name="complemento_renta" checked={form.complemento_renta} onChange={handleChange} />
            <span>Complementar renta con una persona</span>
          </label>

          {form.complemento_renta && (
            <div className="pre-wizard-nested">
              <div className="pre-wizard-nested-title">Datos del complemento de renta</div>
              <div className="pre-wizard-grid-2">
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="ingreso_mensual_complementario">Ingreso mensual complementario</label>
                    <FieldTooltip text="Sueldo líquido o renta promedio de la persona que complementa tu renta." />
                  </div>
                  <input type="text" inputMode="numeric" id="ingreso_mensual_complementario" name="ingreso_mensual_complementario" value={displayVal("ingreso_mensual_complementario")} onChange={handleChange} placeholder="Ej: 800.000" />
                </div>
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="deuda_mensual_complementario">Deuda mensual complementaria</label>
                    <FieldTooltip text="Total de cuotas mensuales comprometidas de la persona complementaria." />
                  </div>
                  <input type="text" inputMode="numeric" id="deuda_mensual_complementario" name="deuda_mensual_complementario" value={displayVal("deuda_mensual_complementario")} onChange={handleChange} placeholder="Ej: 100.000" />
                </div>
              </div>
              <div className="pre-wizard-grid-2">
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="tipo_contrato_complementario">Tipo de contrato complementario</label>
                    <FieldTooltip text="Modalidad contractual de la persona que complementa la renta." />
                  </div>
                  <select id="tipo_contrato_complementario" name="tipo_contrato_complementario" value={form.tipo_contrato_complementario} onChange={handleChange}>
                    <option value="">Selecciona un tipo</option>
                    <option value="indefinido">Indefinido</option>
                    <option value="independiente">Independiente</option>
                    <option value="plazo_fijo">Plazo fijo</option>
                    <option value="honorarios_variable">Honorarios / variable</option>
                  </select>
                </div>
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="continuidad_laboral_complementario">Continuidad laboral complementaria</label>
                    <FieldTooltip text="Tiempo que lleva trabajando de forma continua la persona complementaria." />
                  </div>
                  <select id="continuidad_laboral_complementario" name="continuidad_laboral_complementario" value={form.continuidad_laboral_complementario} onChange={handleChange}>
                    <option value="">Selecciona una opción</option>
                    <option value="menos_6_meses">Menos de 6 meses</option>
                    <option value="entre_6_y_12_meses">Entre 6 y 12 meses</option>
                    <option value="entre_1_y_3_anios">Entre 1 y 3 años</option>
                    <option value="mas_3_anios">Más de 3 años</option>
                  </select>
                </div>
              </div>
              <div className="pre-wizard-grid-2">
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="morosidad_complementario">Morosidad complementaria</label>
                    <FieldTooltip text="Indica si la persona complementaria tiene cuotas o pagos vencidos." />
                  </div>
                  <select id="morosidad_complementario" name="morosidad_complementario" value={form.morosidad_complementario} onChange={handleChange}>
                    <option value="">Selecciona una opción</option>
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </div>
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="relacion_complementario">Relación complementaria</label>
                    <FieldTooltip text="Vínculo que tienes con la persona que complementa tu renta." />
                  </div>
                  <select id="relacion_complementario" name="relacion_complementario" value={form.relacion_complementario} onChange={handleChange}>
                    <option value="">Selecciona una relación</option>
                    <option value="conyuge">Cónyuge</option>
                    <option value="pareja_conviviente">Pareja conviviente</option>
                    <option value="pareja_hijos_comun">Pareja con hijos en común</option>
                    <option value="padre_madre">Padre/Madre</option>
                    <option value="hijo_hija">Hijo/a</option>
                    <option value="hermano_hermana">Hermano/a</option>
                    <option value="otro_familiar">Otro familiar</option>
                    <option value="amigo">Amigo/a</option>
                    <option value="otro">Otro</option>
                  </select>
                  {showComplementRelationWarning && (
                    <span className="pre-wizard-field-hint" style={{ color: '#C4841D' }}>
                      Esta relación puede requerir mayor respaldo en una evaluación hipotecaria formal.
                    </span>
                  )}
                </div>
              </div>
              {showComplementMorosityWarning && (
                <div className="pre-wizard-warning">
                  Si la persona complementaria declara morosidad, no se considerará válida para mejorar el score orientativo.
                </div>
              )}
            </div>
          )}

          {/* Patrimonio */}
          <div className="pre-wizard-divider" />

          <label className="pre-wizard-check-row">
            <input type="checkbox" name="declara_patrimonio" checked={form.declara_patrimonio} onChange={handleChange} />
            <span>Declarar patrimonio (Vehículos, Inmuebles, etc.)</span>
          </label>

          {form.declara_patrimonio && (
            <div className="pre-wizard-nested">
              <div className="pre-wizard-nested-header">
                <span className="pre-wizard-nested-title" style={{ margin: 0 }}>Activos y Patrimonio</span>
                <div className="pre-wizard-nested-actions">
                  <button type="button" className={`pre-wizard-unit-btn${form.patrimonio_unit === "clp" ? " is-active" : ""}`} onClick={() => form.patrimonio_unit !== "clp" && switchPatrimonioUnit()}>CLP</button>
                  <button type="button" className={`pre-wizard-unit-btn${form.patrimonio_unit === "uf" ? " is-active" : ""}`} onClick={() => form.patrimonio_unit !== "uf" && switchPatrimonioUnit()}>UF</button>
                </div>
              </div>
              <div className="pre-wizard-grid-2">
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="valor_vehiculos">Valor total de vehículos</label>
                    <FieldTooltip text="Valor comercial estimado de todos los vehículos de tu propiedad." />
                  </div>
                  <input type="text" inputMode="decimal" id="valor_vehiculos" name="valor_vehiculos" value={displayVal("valor_vehiculos")} onChange={handleChange} placeholder={form.patrimonio_unit === "uf" ? "Ej: 400" : "Ej: 15.000.000"} />
                </div>
                <div className="pre-wizard-field">
                  <div className="pre-wizard-field-label-row">
                    <label className="pre-wizard-field-label" htmlFor="valor_inmuebles">Valor total de inmuebles / otros</label>
                    <FieldTooltip text="Valor comercial estimado de propiedades u otros activos que poseas." />
                  </div>
                  <input type="text" inputMode="decimal" id="valor_inmuebles" name="valor_inmuebles" value={displayVal("valor_inmuebles")} onChange={handleChange} placeholder={form.patrimonio_unit === "uf" ? "Ej: 2.500" : "Ej: 100.000.000"} />
                </div>
              </div>
              <span className="pre-wizard-field-hint">
                Puedes ingresarlo en UF o CLP. {ufHelpText}
              </span>
            </div>
          )}

          <div className="pre-wizard-nav">
            <button type="button" className="pre-wizard-btn-back" onClick={goBack}>
              <svg viewBox="0 0 20 20" fill="none"><path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Volver
            </button>
            <button type="button" className="pre-wizard-btn-next" onClick={goNext} disabled={!canGoNext()}>
              Continuar
              <svg viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 4: Consentimiento y cálculo ═══ */}
      {currentStep === totalSteps && (
        <div className="pre-wizard-card">
          <div className="pre-wizard-card-header">
            <div className="pre-wizard-card-eyebrow">Último paso</div>
            <h1 className="pre-wizard-card-title">Autorización y cálculo</h1>
            <p className="pre-wizard-card-desc">
              Revisa tu información y acepta la autorización de tratamiento de datos para obtener tu precalificación.
            </p>
          </div>

          {/* Summary */}
          <div className="pre-wizard-summary">
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Ingreso mensual</span>
              <span className="pre-wizard-summary-value">${displayVal("ingreso_mensual")}</span>
            </div>
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Deuda mensual</span>
              <span className="pre-wizard-summary-value">${displayVal("deuda_mensual")}</span>
            </div>
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Ahorro disponible</span>
              <span className="pre-wizard-summary-value">${displayVal("ahorro_disponible")}</span>
            </div>
            {form.property_value && (
              <div className="pre-wizard-summary-row">
                <span className="pre-wizard-summary-label">Vivienda estimada</span>
                <span className="pre-wizard-summary-value">{displayVal("property_value")} {form.property_value_unit === "uf" ? "UF" : "CLP"}</span>
              </div>
            )}
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Dividendo estimado</span>
              <span className="pre-wizard-summary-value">${displayVal("dividendo_estimado")}</span>
            </div>
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Tipo de contrato</span>
              <span className="pre-wizard-summary-value">{form.tipo_contrato || "—"}</span>
            </div>
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Continuidad laboral</span>
              <span className="pre-wizard-summary-value">{form.continuidad_laboral || "—"}</span>
            </div>
            <div className="pre-wizard-summary-row">
              <span className="pre-wizard-summary-label">Morosidad</span>
              <span className="pre-wizard-summary-value">{form.morosidad_actual === "si" ? "Sí" : "No"}</span>
            </div>
          </div>

          {/* Consent */}
          <div className="pre-wizard-divider" />
          <div className="pre-wizard-consent">
            {!isAnon && (consentGranted ? (
              <div className="consent-info">
                <span className="consent-info-icon">✓ </span>
                <span>
                  Autorización de tratamiento de datos personales otorgada el <strong>{consentDate}</strong>.
                  <button type="button" className="consent-ref-link" onClick={() => setConsentModalOpen(true)}>
                    Ver detalle
                  </button>
                </span>
              </div>
            ) : (
              <div className="consent-required">
                <p>Debes aceptar la autorización de tratamiento de datos personales antes de calcular tu score.</p>
                <button type="button" className="secondary-button" onClick={() => setConsentModalOpen(true)}>
                  Aceptar autorización
                </button>
              </div>
            ))}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="pre-wizard-nav">
            <button type="button" className="pre-wizard-btn-back" onClick={goBack}>
              <svg viewBox="0 0 20 20" fill="none"><path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Volver
            </button>
            <button
              type="submit"
              className="pre-wizard-btn-submit"
              disabled={loading || debtExceedsIncome || !consentGranted}
            >
              {loading ? (
                <>
                  <span className="loading-spinner" />
                  Calculando...
                </>
              ) : (
                <>
                  Calcular mi precalificación
                  <svg viewBox="0 0 20 20" fill="none"><path d="M16.667 5L7.5 14.167 3.333 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Consent modal */}
      {consentModalOpen && (
        <div
          className="consent-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setConsentModalOpen(false)}
        >
          <div className="consent-modal-content" onClick={(e) => e.stopPropagation()}>
            <DataConsent
              profile={profile}
              readonly={consentGranted}
              onAccept={(consentData) => {
                setConsentTimestamp(consentData.timestamp);
                setConsentModalOpen(false);
                onConsentAccept?.(consentData);
              }}
              onBack={() => setConsentModalOpen(false)}
            />
          </div>
        </div>
      )}
    </form>
  );
}
