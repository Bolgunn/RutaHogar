import React, { useState } from "react";
import { hasUsableAiText } from "../utils/text";

/**
 * Bloque único para la explicación IA: muestra el texto cuando existe y es
 * utilizable; si falta (o es un texto de error legado), muestra una tarjeta
 * con opción de regenerar. Consumidores: InterpretaTab, Result y
 * Recommendations.
 *
 * `onRetry` debe devolver una Promesa<boolean> (true = se generó y guardó).
 * Si no se entrega, la tarjeta aparece sin botón.
 */
export default function AiExplanationBlock({
  text,
  renderText,
  onRetry,
  actionLabel = "Intentar de nuevo",
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  if (hasUsableAiText(text)) {
    return (
      <div className="academy-ai-text">
        {renderText ? renderText(text) : <p>{text}</p>}
      </div>
    );
  }

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    setRetryFailed(false);
    try {
      const ok = await onRetry();
      if (!ok) setRetryFailed(true);
    } catch {
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="academy-ai-retry">
      <span className="academy-ai-retry-icon">
        <i className="ti ti-message-chatbot" aria-hidden="true" />
      </span>

      <div className="academy-ai-retry-body">
        <strong>
          {retryFailed
            ? "No pudimos generar la explicación en este momento"
            : "Aún no tienes explicación automática"}
        </strong>

        <p>
          {retryFailed
            ? "Espera unos segundos e inténtalo nuevamente."
            : "Puedes generar un resumen personalizado de los factores de tu calificación cuando quieras."}
        </p>
      </div>

      {onRetry && (
        <button
          type="button"
          className="academy-ai-retry-btn"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <>
              <span className="academy-spinner" aria-hidden="true" />
              Generando…
            </>
          ) : (
            <>
              <i className="ti ti-refresh" aria-hidden="true" />
              {actionLabel}
            </>
          )}
        </button>
      )}
    </div>
  );
}
