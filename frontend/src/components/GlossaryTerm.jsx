import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [popoverStyle, setPopoverStyle] = useState({});
  const [placement, setPlacement] = useState("top");
  const ref = useRef(null);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      const clickedTrigger = ref.current?.contains(event.target);
      const clickedPopover = popoverRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedPopover) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;

    const MARGIN = 12;
    const GAP = 10;
    const rect = triggerRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - MARGIN * 2);
    const left = Math.max(
      MARGIN,
      Math.min(rect.left, window.innerWidth - width - MARGIN),
    );
    const canOpenAbove = rect.top >= popover.height + GAP + MARGIN;
    const nextPlacement = canOpenAbove ? "top" : "bottom";

    setPlacement(nextPlacement);
    setPopoverStyle({
      width,
      left,
      [nextPlacement === "top" ? "bottom" : "top"]:
        nextPlacement === "top"
          ? window.innerHeight - rect.top + GAP
          : rect.bottom + GAP,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

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
        ref={triggerRef}
        className={`glossary-term ${open ? "is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {entry.label}
      </button>

      {open && createPortal(
        <div
          className={`glossary-popover glossary-popover--${placement}`}
          role="dialog"
          ref={popoverRef}
          style={popoverStyle}
        >
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
        </div>,
        document.body,
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
