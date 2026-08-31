import React, { useState } from "react";
import { submitArcoRequest } from "../services/arcoService";

const CONSENT_VERSION = "1.0";

const dataBlocks = [
  {
    title: "Identificación",
    items: [
      "Nombre completo",
      "Correo electrónico",
      "Rol en la plataforma (usuario, ejecutivo, admin)",
    ],
  },
  {
    title: "Laboral",
    items: [
      "Tipo de contrato (indefinido, plazo fijo, independiente)",
      "Continuidad laboral (antigüedad declarada)",
    ],
  },
  {
    title: "Financiero",
    items: [
      "Ingreso mensual declarado",
      "Deuda mensual declarada",
      "Ahorro disponible declarado",
      "Dividendo estimado",
    ],
  },
  {
    title: "Historial crediticio",
    items: ["Morosidad actual autodeclarada (sí, no, no lo sé)"],
  },
  {
    title: "Perfil de compra",
    items: [
      "Comuna objetivo",
      "Comuna alternativa",
      "Plazo estimado de compra",
      "Tipo de propiedad deseada",
    ],
  },
  {
    title: "Documentos",
    items: ["No se solicitan documentos en la version actual"],
  },
];

const arcoRequestTypes = [
  {
    value: "acceso",
    label: "Acceso: conocer qué datos personales tenemos sobre ti",
  },
  {
    value: "rectificacion",
    label: "Rectificación: corregir datos inexactos o incompletos",
  },
  {
    value: "cancelacion",
    label: "Cancelación: solicitar la eliminación de tus datos",
  },
  {
    value: "otro",
    label: "Otra solicitud relacionada con tus datos personales",
  },
];

export default function DataConsent({ profile, onAccept, onBack, readonly }) {
  const [accepted, setAccepted] = useState(false);
  const [arcoOpen, setArcoOpen] = useState(false);
  const [arcoForm, setArcoForm] = useState({
    tipo: "",
    email: profile?.email || "",
    descripcion: "",
  });
  const [arcoSent, setArcoSent] = useState(false);
  const [arcoError, setArcoError] = useState("");
  const [arcoLoading, setArcoLoading] = useState(false);

  const handleArcoChange = (e) => {
    const { name, value } = e.target;
    setArcoForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleArcoSubmit = async (e) => {
    e.preventDefault();
    setArcoError("");

    if (!arcoForm.tipo) {
      setArcoError("Selecciona un tipo de solicitud.");
      return;
    }
    if (!arcoForm.descripcion.trim()) {
      setArcoError("Describe tu solicitud.");
      return;
    }

    setArcoLoading(true);
    try {
      await submitArcoRequest({
        tipo: arcoForm.tipo,
        email: arcoForm.email,
        descripcion: arcoForm.descripcion,
        userId: profile?.id || profile?.user_id,
        userRole: profile?.role,
        userName: profile?.full_name,
      });
      setArcoSent(true);
      setArcoForm({ tipo: "", email: profile?.email || "", descripcion: "" });
    } catch (err) {
      setArcoError(
        err.message || "Error al enviar la solicitud. Intenta de nuevo.",
      );
    } finally {
      setArcoLoading(false);
    }
  };

  const handleAccept = () => {
    const consentData = {
      granted: true,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
    };
    onAccept(consentData);
  };

  return (
    <section className="consent-panel">
      {/* Header fijo con botón volver */}
      <div className="consent-sticky-header">
        <button className="secondary-button compact-button" onClick={onBack}>
          ← {readonly ? "Volver al formulario" : "Volver"}
        </button>
      </div>

      {/* Cuerpo scrolleable */}
      <div className="consent-body">
        <div className="section-heading">
          <span className="eyebrow">Privacidad y datos personales</span>
          <h1>Autorización de Tratamiento de Datos Personales</h1>
          <p>
            Antes de realizar tu pre-evaluación financiera, necesitamos que
            autorices el tratamiento de tus datos personales de acuerdo con la
            legislación chilena.
          </p>
        </div>

        <div className="consent-section">
          <h3>1. ¿Quién recopila tus datos?</h3>
          <p>
            <strong>RutaHogar</strong> es la plataforma responsable del
            tratamiento de tus datos personales. Actuamos como encargados del
            tratamiento para la evaluación de factibilidad de compra de
            vivienda.
          </p>
          <p>
            Tu perfil actual en la plataforma es:{" "}
            <strong>{profile?.role || "usuario"}</strong>.
          </p>
        </div>

        <div className="consent-section">
          <h3>2. ¿Qué datos recopilamos?</h3>
          <p>
            Los datos que solicitas voluntariamente se agrupan en las siguientes
            categorías:
          </p>
          {dataBlocks.map((block) => (
            <div key={block.title} className="consent-block">
              <strong>{block.title}</strong>
              <ul className="consent-list">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="consent-note">
            No solicitamos claves bancarias, números de documentos de identidad,
            ni consultamos bases de datos externas como DICOM o CMF.
          </p>
        </div>

        <div className="consent-section">
          <h3>3. Finalidad del tratamiento</h3>
          <p>
            Tus datos serán utilizados <strong>exclusivamente</strong> para
            evaluar la factibilidad de compra de una vivienda mediante un score
            financiero orientativo.
          </p>
          <p>
            Conforme al principio de finalidad establecido en la{" "}
            <strong>Ley 20.575</strong>, los datos proporcionados{" "}
            <strong>no podrán ser utilizados para ningún otro propósito</strong>
            , incluyendo pero no limitado a: fines comerciales no relacionados,
            publicidad, cesión a terceros sin tu autorización expresa, o
            evaluación crediticia formal.
          </p>
          <p>
            Esta autorización es independiente y no reemplaza la que pudiera
            solicitar una institución bancaria en una etapa posterior.
          </p>
        </div>

        <div className="consent-section">
          <h3>4. Tus derechos (ARCO)</h3>
          <p>
            De acuerdo con la{" "}
            <strong>Ley 19.628 sobre Protección de la Vida Privada</strong>,
            tienes los siguientes derechos sobre tus datos personales:
          </p>
          <ul className="consent-list">
            <li>
              <strong>Acceso:</strong> Solicitar información sobre qué datos
              tuyos tenemos almacenados.
            </li>
            <li>
              <strong>Rectificación:</strong> Corregir datos inexactos,
              incompletos o desactualizados.
            </li>
            <li>
              <strong>Cancelación:</strong> Solicitar la eliminación de tus
              datos cuando ya no sean necesarios para la finalidad autorizada.
            </li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, puedes utilizar el
            formulario de contacto disponible en la Sección 6 de esta
            autorización.
          </p>
        </div>

        <div className="consent-section">
          <h3>5. Plazo de conservación</h3>
          <p>
            Tus datos personales serán conservados por un período máximo de{" "}
            <strong>12 meses</strong> contados desde la fecha de tu última
            evaluación. Transcurrido ese plazo, los datos serán eliminados de
            nuestros sistemas activos, salvo que exista una obligación legal que
            requiera su retención por un período adicional.
          </p>
        </div>

        <div className="consent-section">
          <h3>6. Contacto para solicitudes ARCO</h3>
          <p>
            Para ejercer tus derechos de acceso, rectificación o cancelación de
            datos personales, completa el siguiente formulario. Te responderemos
            dentro de los plazos establecidos por la ley.
          </p>

          {arcoSent ? (
            <div className="success-message">
              Solicitud enviada correctamente. Te contactaremos al correo
              registrado para dar seguimiento a tu requerimiento.
            </div>
          ) : (
            <>
              <label className="check-row consent-check-row">
                <input
                  type="checkbox"
                  checked={arcoOpen}
                  onChange={(e) => {
                    setArcoOpen(e.target.checked);
                    setArcoError("");
                  }}
                />
                <span>Deseo enviar una solicitud sobre mis datos personales</span>
              </label>

              {arcoOpen && (
                <form
                  onSubmit={handleArcoSubmit}
                  className="arco-form consent-form-margin"
                >
                  <label>
                    Tipo de solicitud
                    <select
                      name="tipo"
                      value={arcoForm.tipo}
                      onChange={handleArcoChange}
                    >
                      <option value="">Selecciona un tipo</option>
                      {arcoRequestTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Correo de contacto
                    <input
                      type="email"
                      name="email"
                      value={arcoForm.email}
                      onChange={handleArcoChange}
                      placeholder="tu@correo.cl"
                    />
                  </label>
                  <label>
                    Describe tu solicitud
                    <textarea
                      name="descripcion"
                      value={arcoForm.descripcion}
                      onChange={handleArcoChange}
                      rows={4}
                      placeholder="Indica qué datos deseas consultar, corregir o eliminar..."
                    />
                  </label>
                  {arcoError && (
                    <div className="error-message">{arcoError}</div>
                  )}
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={arcoLoading}
                  >
                    {arcoLoading ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {readonly ? null : (
          <div className="consent-footer">
            <label className="consent-check">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                He leído y acepto los términos de esta autorización de
                tratamiento de datos personales, y reconozco que los datos
                proporcionados serán utilizados exclusivamente para la
                evaluación de factibilidad de compra de vivienda.
              </span>
            </label>
            <div className="consent-actions">
              <button className="secondary-button" onClick={onBack}>
                Volver
              </button>
              <button className="consent-accept-btn" disabled={!accepted} onClick={handleAccept}>
                Aceptar y continuar
              </button>
            </div>
          </div>
        )}
      </div>
      {/* fin consent-body */}
    </section>
  );
}