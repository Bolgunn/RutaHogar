import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACADEMY_ARTICLES,
  ACADEMY_CAPSULES,
  ACADEMY_TOPICS,
  CASE_STUDIES,
  STARTER_ARTICLE_IDS,
  classifyRiskText,
  findMatchingCase,
  getCapsulesForTopic,
} from "../constants/academyContent";
import GlossaryTerm, { splitTextWithGlossaryTerms } from "./GlossaryTerm";
import AiExplanationBlock from "./AiExplanationBlock";

const LEVEL_ORDER = {
  Básico: 0,
  Intermedio: 1,
  Avanzado: 2,
};

const CLASSIFICATION_CLASS = {
  Alto: "is-high",
  Medio: "is-medium",
  Bajo: "is-low",
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// ----------------------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------------------

function plural(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function formatReviewedDate(reviewedAt) {
  if (!reviewedAt) return null;
  const [year, month] = reviewedAt.split("-");
  const monthName = MONTHS_ES[Number(month) - 1];
  return monthName ? `Revisado en ${monthName} de ${year}` : null;
}

// Convierte una URL de YouTube/Vimeo en URL de reproductor embebible.
// Si la URL no corresponde a un proveedor conocido, se devuelve tal cual.
function toEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    if (parsed.hostname === "youtu.be") {
      return `https://www.youtube-nocookie.com/embed${parsed.pathname}`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      return `https://player.vimeo.com/video${parsed.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

function renderTextWithGlossary(text, onOpenArticle) {
  return splitTextWithGlossaryTerms(text).map((part, i) =>
    typeof part === "string" ? (
      <React.Fragment key={i}>{part}</React.Fragment>
    ) : (
      <GlossaryTerm key={i} term={part.term} onOpenArticle={onOpenArticle} />
    )
  );
}


// ============================================================================
// ICONO DE TEMA
// ============================================================================

function TopicIcon({ topicId, size = "md" }) {
  const topic = ACADEMY_TOPICS.find((t) => t.id === topicId);

  if (!topic) return null;

  return (
    <span
      className={`academy-topic-icon academy-topic-icon--${size}`}
      style={{
        background: `${topic.accent}1a`,
        color: topic.accent,
      }}
    >
      <i className={`ti ${topic.icon}`} aria-hidden="true" />
    </span>
  );
}


// ============================================================================
// CARRUSEL DE CÁPSULAS
// ============================================================================

// Franja horizontal de cápsulas con flechas laterales en lugar de scrollbar.
function CapsuleCarousel({ children }) {
  const stripRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();

    const el = stripRef.current;
    if (!el) return undefined;

    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);

    // Las tarjetas pueden terminar de cargar y cambiar el ancho total.
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
      observer.disconnect();
    };
  }, [updateArrows]);

  const scrollByPage = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 240) * direction;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div
      className={`academy-carousel ${canPrev ? "has-prev" : ""} ${canNext ? "has-next" : ""
        }`}
    >
      <button
        type="button"
        className="academy-carousel-arrow is-left"
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label="Ver cápsulas anteriores"
      >
        <i className="ti ti-chevron-left" aria-hidden="true" />
      </button>

      <div className="academy-capsule-strip" ref={stripRef}>
        {children}
      </div>

      <button
        type="button"
        className="academy-carousel-arrow is-right"
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label="Ver más cápsulas"
      >
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>
    </div>
  );
}


// ============================================================================
// TARJETA DE ARTÍCULO
// ============================================================================

function ArticleCard({ article, onOpen }) {
  const topic = ACADEMY_TOPICS.find((t) => t.id === article.topic);

  return (
    <button
      type="button"
      className="academy-card"
      style={{ "--card-accent": topic?.accent }}
      onClick={() => onOpen(article.id)}
      >
        <div className="academy-card-top">
          <TopicIcon topicId={article.topic} size="sm" />
        </div>

      <h3>{article.title}</h3>

      <p>{article.summary}</p>

      <div className="academy-card-footer">
        <span className="academy-card-topic" style={{ color: topic?.accent }}>
          {topic?.label}
        </span>

        {article.id !== "docs-1" && article.sources?.length > 0 && (
          <span className="academy-meta-pill academy-meta-pill--soft">
            <i className="ti ti-shield-check" aria-hidden="true" />
            {plural(article.sources.length, "fuente oficial", "fuentes oficiales")}
          </span>
        )}
      </div>
    </button>
  );
}


// ============================================================================
// TARJETA DE CÁPSULA
// ============================================================================

function CapsuleCard({ capsule, variant = "row", onOpen }) {
  const topic = ACADEMY_TOPICS.find((t) => t.id === capsule.topicId);
  const hasVideo = Boolean(capsule.videoUrl);

  if (variant === "strip") {
    return (
      <button
        type="button"
        className="academy-capsule-chip"
        style={{ "--cap-accent": topic?.accent }}
        onClick={() => onOpen(capsule.id)}
      >
        <span className="academy-capsule-play">
          <i className="ti ti-player-play-filled" aria-hidden="true" />
        </span>

        <span className="academy-capsule-chip-body">
          <span className="academy-capsule-kicker">
            {hasVideo ? "Video" : "Cápsula"} · {topic?.label}
          </span>

          <span className="academy-capsule-title">{capsule.title}</span>
        </span>

        <span className="academy-meta-pill academy-meta-pill--soft">
          <i className="ti ti-clock" aria-hidden="true" />
          {capsule.minutes} min
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="academy-capsule-row"
      style={{ "--cap-accent": topic?.accent }}
      onClick={() => onOpen(capsule.id)}
    >
      <span className="academy-capsule-play">
        <i className="ti ti-player-play-filled" aria-hidden="true" />
      </span>

      <span className="academy-capsule-row-body">
        <span className="academy-capsule-kicker">
          {hasVideo ? "Video" : "Cápsula"} · {plural(capsule.minutes, "minuto", "minutos")}
        </span>

        <span className="academy-capsule-title">{capsule.title}</span>

        <span className="academy-capsule-desc">{capsule.description}</span>
      </span>

      <i className="ti ti-chevron-right academy-capsule-arrow" aria-hidden="true" />
    </button>
  );
}


// ============================================================================
// MODAL DE CÁPSULA
// ============================================================================

function CapsuleModal({ capsule, onClose, onOpenArticle }) {
  const scrollRef = useRef(null);

  // Al abrir otra cápsula desde un artículo, el modal parte desde arriba.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [capsule?.id]);

  if (!capsule) return null;

  const topic = ACADEMY_TOPICS.find((t) => t.id === capsule.topicId);
  const article = capsule.articleId
    ? ACADEMY_ARTICLES.find((a) => a.id === capsule.articleId)
    : null;

  return (
    <div className="academy-modal-backdrop" onClick={onClose}>
      <div
        className="academy-modal academy-modal--capsule"
        role="dialog"
        aria-modal="true"
        aria-label={capsule.title}
        onClick={(e) => e.stopPropagation()}
        ref={scrollRef}
      >
        <button
          type="button"
          className="academy-modal-close"
          onClick={onClose}
          aria-label="Cerrar"
          autoFocus
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>

        <div className="academy-modal-header">
          <span
            className="academy-capsule-badge"
            style={{
              background: `${topic?.accent}1a`,
              color: topic?.accent,
            }}
          >
            <i className="ti ti-player-play-filled" aria-hidden="true" />
          </span>

          <div>
            <span className="eyebrow" style={{ color: topic?.accent }}>
              {capsule.videoUrl ? "Video" : "Cápsula"} · {topic?.label}
            </span>

            <h2>{capsule.title}</h2>

            <p className="academy-capsule-lede">{capsule.description}</p>
          </div>
        </div>

        {/* REPRODUCTOR: solo cuando la cápsula tiene video publicado */}

        {capsule.videoUrl && (
          <div className="academy-video-frame">
            <iframe
              src={toEmbedUrl(capsule.videoUrl)}
              title={capsule.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}

        {/* MINI-LECCIÓN */}

        <div className="academy-takeaways">
          <strong>Ideas clave</strong>

          <ol>
            {capsule.takeaways.map((idea, i) => (
              <li key={i}>
                <span className="academy-takeaway-num">{i + 1}</span>
                <p>{idea}</p>
              </li>
            ))}
          </ol>
        </div>

        {article && (
          <div className="academy-capsule-footer">
            <p>¿Quieres profundizar? Este tema se explica en detalle aquí:</p>

            <button
              type="button"
              className="secondary-button"
              onClick={() => onOpenArticle(article.id)}
            >
              <i className="ti ti-book-2" aria-hidden="true" />
              {article.title}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================================
// MODAL DE ARTÍCULO
// ============================================================================

function ArticleModal({ article, onClose, onOpenArticle, onOpenCapsule, related, canGoBack, onBack }) {
  const scrollRef = useRef(null);

  // Al abrir un artículo relacionado desde el modal, el contenido nuevo
  // debe mostrarse desde el inicio, no a la altura del artículo anterior.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [article?.id]);

  if (!article) return null;

  const topic = ACADEMY_TOPICS.find((t) => t.id === article.topic);
  const reviewedLabel = formatReviewedDate(article.reviewedAt);
  const topicCapsules = getCapsulesForTopic(article.topic);

  return (
    <div className="academy-modal-backdrop" onClick={onClose}>
      <div
        className="academy-modal"
        role="dialog"
        aria-modal="true"
        aria-label={article.title}
        onClick={(e) => e.stopPropagation()}
        ref={scrollRef}
      >
        <button
          type="button"
          className="academy-modal-close"
          onClick={onClose}
          aria-label="Cerrar"
          autoFocus
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>

        {canGoBack && (
          <button type="button" className="academy-modal-back" onClick={onBack}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
            Volver
          </button>
        )}

        {/* HEADER */}

        <div className="academy-modal-header">
          <TopicIcon topicId={article.topic} />

          <div>
            <span className="eyebrow" style={{ color: topic?.accent }}>
              {topic?.label}
            </span>

            <h2>{article.title}</h2>
          </div>
        </div>

        {reviewedLabel && (
          <div className="academy-modal-meta">
            <span className="academy-meta-pill">
              <i className="ti ti-calendar-check" aria-hidden="true" />
              {reviewedLabel}
            </span>
          </div>
        )}

        {/* CONTENIDO */}

        <div className="academy-modal-body">
          {article.body.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        {article.id !== "docs-1" && article.sources?.length > 0 && (
          <div className="academy-modal-sources">
            <div className="academy-sources-intro">
              <i className="ti ti-shield-check" aria-hidden="true" />
              <div>
                <strong>Fuentes oficiales</strong>
                <p>Este artículo se basa en información de organismos chilenos. Verifica los detalles directamente en cada fuente:</p>
              </div>
            </div>
            <ul className="academy-source-list">
              {article.sources.map((source, i) => (
                <li key={`${source.institution}-${i}`}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="academy-source-link">
                    <strong>{source.institution}</strong>
                    <span className="academy-source-comma">,</span>
                    <em>{source.title}</em>
                    <i className="ti ti-external-link" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CÁPSULAS DEL TEMA */}

        {topicCapsules.length > 0 && (
          <div className="academy-modal-capsules">
            <strong>
              {topicCapsules.length === 1
                ? "Cápsula relacionada"
                : "Cápsulas relacionadas"}
            </strong>

            <div className="academy-capsule-mini-list">
              {topicCapsules.map((capsule) => (
                <CapsuleCard
                  key={capsule.id}
                  capsule={capsule}
                  variant="strip"
                  onOpen={(id) => {
                    onClose();
                    onOpenCapsule(id);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* TÉRMINOS */}

        {article.tags?.length > 0 && (
          <div className="academy-modal-terms">
            <strong>Términos relacionados</strong>

            <p className="academy-term-list">
              {article.tags.map((tag, i) => (
                <React.Fragment key={tag}>
                  {i > 0 && <span className="academy-term-sep">, </span>}
                  <GlossaryTerm term={tag} onOpenArticle={onOpenArticle} />
                </React.Fragment>
              ))}
            </p>
          </div>
        )}

        {/* RELACIONADOS */}

        {related.length > 0 && (
          <div className="academy-modal-related">
            <strong>Artículos relacionados</strong>

            <div className="academy-related-grid">
              {related.map((item) => (
                <ArticleCard
                  key={item.id}
                  article={item}
                  onOpen={onOpenArticle}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================================
// TAB CONCEPTOS
// ============================================================================

function RouteStop({ topic, index, onOpen }) {
  const articleCount = ACADEMY_ARTICLES.filter(
    (article) => article.topic === topic.id
  ).length;
  const capsuleCount = getCapsulesForTopic(topic.id).length;

  return (
    <li className="route-stop">
      <button
        type="button"
        className="route-stop-btn"
        onClick={() => onOpen(topic.id)}
        style={{ "--stop-accent": topic.accent }}
      >
        <span className="route-stop-node">
          <i className={`ti ${topic.icon}`} aria-hidden="true" />
        </span>

        <span className="route-stop-body">
          <span className="route-stop-index">Parada {index}</span>
          <h3>{topic.label}</h3>
          <p>{topic.description}</p>
        </span>

        <span className="route-stop-count">
          <span>{plural(articleCount, "artículo", "artículos")}</span>
          <em>{plural(capsuleCount, "cápsula", "cápsulas")}</em>
        </span>

        <i className="ti ti-chevron-right route-stop-arrow" aria-hidden="true" />
      </button>
    </li>
  );
}

function articleMatchesAcademyQuery(article, normalizedQuery) {
  return (
    !normalizedQuery ||
    article.title.toLowerCase().includes(normalizedQuery) ||
    article.summary.toLowerCase().includes(normalizedQuery) ||
    article.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
  );
}

function ConceptosTab({ onOpenArticle, onOpenCapsule, query }) {
  const [activeTopic, setActiveTopic] = useState("todos");
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredArticles = useMemo(() => {
    return ACADEMY_ARTICLES.filter((article) => {
      const matchesTopic =
        activeTopic === "todos" || article.topic === activeTopic;
      return matchesTopic && articleMatchesAcademyQuery(article, normalizedQuery);
    }).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  }, [activeTopic, normalizedQuery]);

  const activeTopicMeta = ACADEMY_TOPICS.find((t) => t.id === activeTopic);

  // Vista por defecto: directorio de temas. Solo se abandona cuando el
  // usuario elige un tema puntual o escribe una búsqueda — así nunca se
  // muestran los 36 artículos de golpe.
  const showDirectory = activeTopic === "todos" && !isSearching;

  useEffect(() => {
    if (normalizedQuery) setActiveTopic("todos");
  }, [normalizedQuery]);

  const topicCapsules = useMemo(
    () => (activeTopicMeta ? getCapsulesForTopic(activeTopicMeta.id) : []),
    [activeTopicMeta]
  );

  return (
    <div className="conceptos-tab">

      {showDirectory ? (
        <>
          {/* CÁPSULAS DESTACADAS — CARRUSEL */}

          <div className="academy-capsules-section">
            <div className="academy-capsules-header">
              <div>
                <h3 className="academy-directory-heading">
                  <i className="ti ti-player-play" aria-hidden="true" />
                  Cápsulas rápidas
                </h3>
                <p className="academy-directory-sub">
                  Ideas clave en 2 o 3 minutos, antes de entrar en detalle.
                </p>
              </div>
            </div>

            <CapsuleCarousel>
              {ACADEMY_CAPSULES.map((capsule) => (
                <CapsuleCard
                  key={capsule.id}
                  capsule={capsule}
                  variant="strip"
                  onOpen={onOpenCapsule}
                />
              ))}
            </CapsuleCarousel>
          </div>

          {/* LA RUTA: temas en el orden en que conviene aprenderlos */}

          <div className="academy-route-section">
            <div className="academy-route-header">
              <div>
                <h3 className="academy-directory-heading academy-directory-heading--route">
                  <i className="ti ti-route" aria-hidden="true" />
                  Tu ruta financiera
                </h3>
                <p className="academy-directory-sub">
                  10 paradas, del crédito a la compra. Elige por dónde partir.
                </p>
              </div>
            </div>

            <ol className="route-path">
              {ACADEMY_TOPICS.map((topic, i) => (
                <RouteStop
                  key={topic.id}
                  topic={topic}
                  index={i + 1}
                  onOpen={setActiveTopic}
                />
              ))}
            </ol>
          </div>
        </>
      ) : (
        <>
          {/* MIGA DE PAN: volver al directorio */}

          {!isSearching && (
            <button
              type="button"
              className="academy-back-link"
              onClick={() => setActiveTopic("todos")}
            >
              <i className="ti ti-arrow-left" aria-hidden="true" />
              Todos los temas
            </button>
          )}

          {/* ENCABEZADO DEL TEMA */}

          {!isSearching && activeTopicMeta && (
            <div className="academy-topic-hero">
              <TopicIcon topicId={activeTopicMeta.id} size="lg" />

              <div className="academy-topic-hero-text">
                <h2 style={{ color: activeTopicMeta.accent }}>
                  {activeTopicMeta.label}
                </h2>
                <p>{activeTopicMeta.description}</p>
              </div>
            </div>
          )}

          {/* CÁPSULAS DEL TEMA */}

          {topicCapsules.length > 0 && !isSearching && (
            <section className="academy-topic-capsules">
              <h3>
                <i className="ti ti-player-play" aria-hidden="true" />
                Cápsulas de este tema
              </h3>

              <div className="academy-capsule-rows">
                {topicCapsules.map((capsule) => (
                  <CapsuleCard
                    key={capsule.id}
                    capsule={capsule}
                    onOpen={onOpenCapsule}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ARTÍCULOS — DISEÑO CREATIVO */}

          {filteredArticles.length ? (
            <div className="academy-articles-section">
              <h3 className="academy-directory-heading">
                <i className="ti ti-books" aria-hidden="true" />
                {isSearching
                  ? `Resultados para "${query.trim()}"`
                  : `Artículos de ${activeTopicMeta?.label}`}
              </h3>

              <div className="academy-articles-grid academy-articles-grid--directory">
                {filteredArticles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onOpen={onOpenArticle}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No encontramos artículos con ese filtro.</strong>

              <p>Prueba con otro tema o modifica la búsqueda.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ============================================================================
// TAB INTERPRETA TU SCORE
// ============================================================================

// Indicador circular del score (0-100).
function ScoreDial({ score, classification }) {
  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const percent = Math.max(0, Math.min(100, Number(score) || 0)) / 100;
  const toneClass =
    CLASSIFICATION_CLASS[classification] || "is-medium";

  return (
    <div className={`academy-dial ${toneClass}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="academy-dial-track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="academy-dial-value"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent)}
        />
      </svg>

      <div className="academy-dial-center">
        <strong>{score}</strong>
        <span>{classification}</span>
      </div>
    </div>
  );
}

function InterpretaTab({ evaluation, onStartEvaluation, onOpenArticle, onRetryExplanation }) {
  const result = evaluation?.result;
  const risks = result?.risks || [];
  const positives = result?.positive_indicators || [];

  // Artículos recomendados según los riesgos detectados.
  const suggestedArticles = useMemo(() => {
    if (!result) return [];

    const articleIds = [];

    risks.forEach((risk) => {
      const recommendation = classifyRiskText(risk);
      if (
        recommendation.articleId &&
        !articleIds.includes(recommendation.articleId)
      ) {
        articleIds.push(recommendation.articleId);
      }
    });

    const finalIds = articleIds.length ? articleIds : STARTER_ARTICLE_IDS;

    return [...new Set(finalIds)]
      .slice(0, 3)
      .map((id) => ACADEMY_ARTICLES.find((article) => article.id === id))
      .filter(Boolean);
  }, [result, risks]);

  // SIN EVALUACIÓN

  if (!result) {
    return (
      <div className="academy-empty">
        <span className="academy-empty-icon">
          <i className="ti ti-chart-pie" aria-hidden="true" />
        </span>

          <h3>Aún no tienes una precalificación</h3>

        <p>
          Completa tu precalificación financiera para conocer tu score,
          entender los factores que influyen en él y recibir contenido
          educativo relevante para tu situación.
        </p>

        <button type="button" onClick={onStartEvaluation}>
          Ir a precalificación
          <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="academy-interpreta">
      {/* RESULTADO */}

      <div className="academy-score-hero">
        <div className="academy-score-hero-text">
          <span className="eyebrow">Tu resultado</span>

          <h3>
            {risks.length
              ? "Esto está influyendo en tu score"
              : "Tu perfil no muestra riesgos relevantes"}
          </h3>

          <AiExplanationBlock
            text={result?.ai_explanation}
            renderText={(t) => <p>{renderTextWithGlossary(t, onOpenArticle)}</p>}
            onRetry={onRetryExplanation}
          />
        </div>

        <ScoreDial score={result.score} classification={result.classification} />
      </div>

      {/* RIESGOS */}

      {risks.length > 0 && (
        <section className="academy-factor-block academy-factor-block--risks">
          <header>
            <span className="academy-factor-icon is-risk">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
            </span>

            <div>
              <h4>Factores que deberías revisar</h4>
              <p>
                Cada factor incluye una explicación y el concepto que conviene
                repasar.
              </p>
            </div>
          </header>

          <ul className="academy-risk-cards">
            {risks.map((risk, index) => {
              const recommendation = classifyRiskText(risk);
              const article = recommendation.articleId
                ? ACADEMY_ARTICLES.find(
                  (item) => item.id === recommendation.articleId
                )
                : null;

              return (
                <li key={`${risk}-${index}`} className="academy-risk-card">
                  <div className="academy-risk-text">
                    {recommendation.term
                      ? renderTextWithGlossary(risk, onOpenArticle)
                      : risk}
                  </div>

                  {article && (
                    <button
                      type="button"
                      className="academy-risk-article"
                      onClick={() => onOpenArticle(article.id)}
                    >
                      <i className="ti ti-book-2" aria-hidden="true" />
                      Aprender sobre esto
                      <i className="ti ti-arrow-right" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* POSITIVOS */}

      {positives.length > 0 && (
        <section className="academy-factor-block academy-factor-block--positives">
          <header>
            <span className="academy-factor-icon is-positive">
              <i className="ti ti-circle-check" aria-hidden="true" />
            </span>

            <div>
              <h4>Lo que ya juega a tu favor</h4>
              <p>Mantén esas fortalezas al momento de postular.</p>
            </div>
          </header>

          <ul className="academy-positive-list">
            {positives.map((item) => (
              <li key={item}>
                <i className="ti ti-circle-check" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ARTÍCULOS RECOMENDADOS */}

      {suggestedArticles.length > 0 && (
        <section className="academy-recommendations">
          <div className="academy-recommendations-heading">
            <span className="eyebrow">Recomendado para ti</span>

            <h3>Contenido relacionado con tu calificación</h3>

            <p>
              Seleccionamos estos artículos a partir de los factores
              detectados en tu precalificación.
            </p>
          </div>

          <div className="academy-suggested-grid">
            {suggestedArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onOpen={onOpenArticle}
              />
            ))}
          </div>
        </section>
      )}

      {/* DISCLAIMER */}

      <div className="academy-score-disclaimer">
        <i className="ti ti-info-circle" aria-hidden="true" />

        <p>
          Tu score es una herramienta de orientación y no representa una
          aprobación de crédito. La decisión final corresponde a la
          institución financiera y depende de sus propios criterios de
          evaluación.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TAB CASOS PRÁCTICOS
// ============================================================================

const CASE_SECTIONS = [
  { key: "situation", icon: "ti-user", label: "La situación" },
  { key: "why", icon: "ti-help-circle", label: "¿Por qué importa?" },
  { key: "action", icon: "ti-flag", label: "¿Qué conviene hacer?" },
];

function CasosTab({ evaluation, onOpenArticle }) {
  const matchingCase = useMemo(
    () => findMatchingCase(evaluation),
    [evaluation]
  );

  const [openCaseId, setOpenCaseId] = useState(matchingCase?.id || null);

  const openCaseAndScroll = useCallback((caseId, isOpen) => {
    setOpenCaseId(isOpen ? null : caseId);
    if (isOpen) return;

    window.setTimeout(() => {
      document
        .getElementById(`academy-case-${caseId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);
  }, []);

  return (
    <div>
      <div className="academy-cases-intro">
        <span className="eyebrow">Aprender con ejemplos</span>

        <h3>Casos prácticos</h3>

        <p>
          Situaciones ilustrativas que ayudan a entender por qué un
          determinado perfil puede presentar fortalezas o riesgos.
        </p>
      </div>

      {/* CASO RELACIONADO CON EL USUARIO */}

      {matchingCase && (
        <div className="academy-personal-case">
          <div className="academy-personal-case-icon">
            <i className="ti ti-sparkles" aria-hidden="true" />
          </div>

          <div className="academy-personal-case-body">
            <span className="academy-personal-case-label">
              Caso parecido a tu situación
            </span>

            <h4>{matchingCase.title}</h4>

            <p>
              Encontramos un caso educativo con características similares a
              algunos factores de tu calificación.
            </p>
          </div>


        </div>
      )}

      {/* LISTA */}

      <div className="academy-cases">
        {CASE_STUDIES.map((item, index) => {
          const isOpen = openCaseId === item.id;
          const isMatch = matchingCase?.id === item.id;
          const toneClass =
            CLASSIFICATION_CLASS[item.tag.classification] || "is-medium";

          return (
            <article
              key={item.id}
              id={`academy-case-${item.id}`}
              className={`academy-case ${toneClass} ${isOpen ? "is-open" : ""
                } ${isMatch ? "is-match" : ""}`}
            >
              <button
                type="button"
                className="academy-case-header"
                aria-expanded={isOpen}
                onClick={() => openCaseAndScroll(item.id, isOpen)}
              >
                <span className="academy-case-index">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span className="academy-case-title-wrap">
                  {isMatch && (
                    <span className="academy-case-match">
                      <i className="ti ti-sparkles" aria-hidden="true" />
                      Se parece a tu situación
                    </span>
                  )}

                  <strong>{item.title}</strong>
                </span>

                <span
                  className={`academy-class-chip ${toneClass}`}
                  aria-label={`Clasificación ${item.tag.classification}`}
                >
                  {item.tag.classification}
                </span>

                <i
                  className={`ti ti-chevron-${isOpen ? "up" : "down"
                    } academy-case-chevron`}
                  aria-hidden="true"
                />
              </button>

              {/* CUERPO */}

              {isOpen && (
                <div className="academy-case-body">
                  {CASE_SECTIONS.map(({ key, icon, label }) => (
                    <div key={key} className="academy-case-section">
                      <span className="academy-case-section-label">
                        <i className={`ti ${icon}`} aria-hidden="true" />
                        {label}
                      </span>

                      <p>{item[key]}</p>
                    </div>
                  ))}

                  {/* ARTÍCULOS RELACIONADOS */}

                  {item.relatedArticleIds?.length > 0 && (
                    <div className="academy-case-links">
                      <span>Aprende más:</span>

                      <div className="academy-case-links-row">
                        {item.relatedArticleIds.map((id) => {
                          const article = ACADEMY_ARTICLES.find(
                            (a) => a.id === id
                          );

                          if (!article) return null;

                          return (
                            <button
                              key={id}
                              type="button"
                              className="secondary-button academy-case-link"
                              onClick={() => onOpenArticle(id)}
                            >
                              <i className="ti ti-book-2" aria-hidden="true" />
                              {article.title}
                              <i
                                className="ti ti-arrow-up-right"
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* AVISO */}

      <div className="academy-cases-disclaimer">
        <i className="ti ti-info-circle" aria-hidden="true" />

        <p>
          Estos casos son ejemplos educativos y no representan una predicción
          individual ni una garantía de aprobación de crédito.
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// TABS
// ============================================================================

const TABS = [
  { id: "conceptos", label: "Conceptos", icon: "ti-books" },
  { id: "interpretar", label: "Interpreta tu score", icon: "ti-chart-bar" },
  { id: "casos", label: "Casos prácticos", icon: "ti-list-details" },
];

export default function AcademiaFinanciera({ evaluation, onStartEvaluation, onNavigate, initialArticleId, onRetryExplanation }) {
  const [activeTab, setActiveTab] = useState("conceptos");
  const [academyQuery, setAcademyQuery] = useState("");
  const [openArticleId, setOpenArticleId] = useState(initialArticleId || null);
  const [openCapsuleId, setOpenCapsuleId] = useState(null);
  const [articleHistory, setArticleHistory] = useState([]);

  const normalizedAcademyQuery = academyQuery.trim().toLowerCase();
  const isAcademySearching = normalizedAcademyQuery.length > 0;
  const academySearchCount = useMemo(
    () => ACADEMY_ARTICLES.filter((article) => articleMatchesAcademyQuery(article, normalizedAcademyQuery)).length,
    [normalizedAcademyQuery],
  );

  const handleAcademySearchChange = (event) => {
    const nextQuery = event.target.value;
    setAcademyQuery(nextQuery);
    if (nextQuery.trim()) setActiveTab("conceptos");
  };

  useEffect(() => {
    if (initialArticleId) {
      setOpenArticleId(initialArticleId);
      setArticleHistory([]);
    }
  }, [initialArticleId]);

  const openArticle = useCallback((id) => {
    setOpenArticleId((currentId) => {
      if (currentId && currentId !== id) {
        setArticleHistory((history) => [...history, currentId].slice(-8));
      }
      return id;
    });
  }, []);
  const openCapsule = useCallback((id) => setOpenCapsuleId(id), []);

  // Desde una cápsula, abrir su artículo debe cerrar la cápsula: los dos
  // modales son excluyentes y si no se limpia, el artículo nunca se muestra.
  const openArticleFromCapsule = useCallback((id) => {
    setOpenCapsuleId(null);
    setOpenArticleId(id);
  }, []);
  const goBackArticle = useCallback(() => {
    setArticleHistory((history) => {
      const previousId = history.at(-1);
      if (previousId) setOpenArticleId(previousId);
      return history.slice(0, -1);
    });
  }, []);

  const closeOverlays = useCallback(() => {
    setOpenArticleId(null);
    setOpenCapsuleId(null);
    setArticleHistory([]);
  }, []);

  const activeArticle =
    ACADEMY_ARTICLES.find((article) => article.id === openArticleId) || null;

  const activeCapsule =
    ACADEMY_CAPSULES.find((capsule) => capsule.id === openCapsuleId) || null;

  // Esc cierra los modales y se bloquea el scroll de fondo mientras hay
  // alguno abierto.
  useEffect(() => {
    if (!activeArticle && !activeCapsule) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeOverlays();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeArticle, activeCapsule, closeOverlays]);

  const relatedArticles = useMemo(() => {
    if (!activeArticle) return [];

    return ACADEMY_ARTICLES.filter(
      (article) =>
        article.topic === activeArticle.topic &&
        article.id !== activeArticle.id
    ).slice(0, 2);
  }, [activeArticle]);

  return (
    <section className="section-block academia-panel">
      {/* HEADER */}

      <header className="academy-intro">
        <div>
          <span className="eyebrow">Academia financiera</span>

          <h1>Prepárate antes de comprar</h1>

          <p>
            Aprende sobre crédito hipotecario, ahorro, endeudamiento, UF,
            subsidios y compra de vivienda con información respaldada por
            fuentes oficiales chilenas.
          </p>
        </div>

        <div className="academy-stats" aria-label="Contenido disponible">
          <span className="academy-stat">
            <i className="ti ti-route" aria-hidden="true" />
            {ACADEMY_TOPICS.length} temas
          </span>

          <span className="academy-stat">
            <i className="ti ti-books" aria-hidden="true" />
            {ACADEMY_ARTICLES.length} artículos
          </span>

          <span className="academy-stat">
            <i className="ti ti-player-play" aria-hidden="true" />
            {ACADEMY_CAPSULES.length} cápsulas
          </span>

          <span className="academy-stat academy-stat--sources">
            <i className="ti ti-shield-check" aria-hidden="true" />
            SERNAC · CMF · MINVU · Banco Central
          </span>
        </div>
      </header>

      {/* TABS + BÚSQUEDA */}

      <div className="academy-nav-search-row">
        <div className="academy-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`academy-tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`ti ${tab.icon}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="academy-search-group">
          <div className="academy-search academy-search-wide">
            <i className="ti ti-search" aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar por tema, subsidio, tasa, UF..."
              value={academyQuery}
              onChange={handleAcademySearchChange}
              aria-label="Buscar artículos de la academia"
            />
          </div>
          {isAcademySearching && (
            <span className="academy-search-count">
              {plural(academySearchCount, "resultado", "resultados")} para "{academyQuery.trim()}"
            </span>
          )}
        </div>
      </div>

      {/* CONTENIDO */}

      {activeTab === "conceptos" && (
        <ConceptosTab
          onOpenArticle={openArticle}
          onOpenCapsule={openCapsule}
          query={academyQuery}
        />
      )}

      {activeTab === "interpretar" && (
        <InterpretaTab
          evaluation={evaluation}
          onStartEvaluation={onStartEvaluation}
          onOpenArticle={openArticle}
          onRetryExplanation={onRetryExplanation}
        />
      )}

      {activeTab === "casos" && (
        <CasosTab evaluation={evaluation} onOpenArticle={openArticle} />
      )}

      {/* MODALES */}

      {activeCapsule && (
        <CapsuleModal
          capsule={activeCapsule}
          onClose={closeOverlays}
          onOpenArticle={openArticleFromCapsule}
        />
      )}

      {!activeCapsule && (
        <ArticleModal
          article={activeArticle}
          onClose={closeOverlays}
          onOpenArticle={openArticle}
          onOpenCapsule={openCapsule}
          related={relatedArticles}
          canGoBack={articleHistory.length > 0}
          onBack={goBackArticle}
        />
      )}
    </section>
  );
}
