import React, { useCallback, useEffect, useRef, useState } from "react";
import { ACADEMY_ARTICLES, ACADEMY_GLOSSARY } from "../constants/academyContent";

/**
 * HU12 - E3 "Enlaces contextuales"
 * Envuelve un término financiero (pie, tasa, subsidio, plazo, dividendo...)
 * para que sea reconocible e interactivo dondequiera que aparezca
 * (Resultado, Plan de mejora, Mapa, Recomendaciones).
 *
 * Uso: <GlossaryTerm term="pie" onOpenArticle={openAcademyArticle} />
 */
export default function GlossaryTerm({ term, onOpenArticle }) {
  // El glosario tiene claves con mayúsculas (UF, IPC, RSH, DS1...), por lo
  // que se busca primero la etiqueta tal cual y luego en minúsculas.
  const entry =
    ACADEMY_GLOSSARY[term] || ACADEMY_GLOSSARY[term.toLowerCase()];
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  if (!entry) return <span>{term}</span>;

  const hasArticleTarget = Boolean(
    entry.articleId && ACADEMY_ARTICLES.some((article) => article.id === entry.articleId),
  );

  if (!hasArticleTarget) {
    return <span className="glossary-term-static">{entry.label}</span>;
  }

  return (
    <span className="glossary-term-wrap" ref={ref}>
      <button
        type="button"
        className={`glossary-term ${open ? "is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {entry.label}
      </button>

      {open && (
        <div className="glossary-popover" role="dialog">
          <p>{entry.definition}</p>
          <button
            type="button"
            className="glossary-popover-link"
            onClick={() => {
              close();
              onOpenArticle?.(entry.articleId);
            }}
          >
            Ver artículo completo <i className="ti ti-arrow-right" />
          </button>
        </div>
      )}
    </span>
  );
}

/**
 * Utilidad de apoyo: detecta términos del glosario dentro de un texto plano
 * y los transforma en un arreglo de fragmentos (string | { term }) para
 * renderizar con GlossaryTerm. Sirve para reutilizar el glosario en textos
 * ya existentes (ej. recomendaciones generadas dinámicamente).
 */
export function splitTextWithGlossaryTerms(text) {
  const terms = Object.keys(ACADEMY_GLOSSARY).sort((a, b) => b.length - a.length);
  if (!terms.length || !text) return [text];

  const pattern = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
  const parts = text.split(pattern);

  return parts.map((part) => {
    const match = terms.find((t) => t.toLowerCase() === part?.toLowerCase());
    return match ? { term: match } : part;
  });
}
