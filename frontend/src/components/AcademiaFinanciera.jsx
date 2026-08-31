import React, { useMemo, useState } from "react";
import {
  ACADEMY_ARTICLES,
  ACADEMY_TOPICS,
  CASE_STUDIES,
  STARTER_ARTICLE_IDS,
  classifyRiskText,
  findMatchingCase,
} from "../constants/academyContent";
import GlossaryTerm, { splitTextWithGlossaryTerms } from "./GlossaryTerm";

const LEVEL_ORDER = { Básico: 0, Intermedio: 1, Avanzado: 2 };
const CLASSIFICATION_CLASS = { Alto: "score-high", Medio: "score-medium", Bajo: "score-low" };

function TopicIcon({ topicId }) {
  const topic = ACADEMY_TOPICS.find((t) => t.id === topicId);
  if (!topic) return null;
  return (
    <span className="academy-topic-icon" style={{ background: `${topic.accent}1a`, color: topic.accent }}>
      <i className={`ti ${topic.icon}`} />
    </span>
  );
}

function ArticleCard({ article, onOpen }) {
  const topic = ACADEMY_TOPICS.find((t) => t.id === article.topic);
  return (
    <button type="button" className="academy-card" onClick={() => onOpen(article.id)}>
      <div className="academy-card-top">
        <TopicIcon topicId={article.topic} />
        <span className="academy-level-chip">{article.level}</span>
      </div>
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      <div className="academy-card-footer">
        <span style={{ color: topic?.accent }}>{topic?.label}</span>
        <span><i className="ti ti-clock" /> {article.minutes} min</span>
      </div>
    </button>
  );
}

function ArticleModal({ article, onClose, onOpenArticle, related }) {
  if (!article) return null;
  const topic = ACADEMY_TOPICS.find((t) => t.id === article.topic);

  return (
    <div className="academy-modal-backdrop" onClick={onClose}>
      <div className="academy-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="academy-modal-close" onClick={onClose} aria-label="Cerrar">
          <i className="ti ti-x" />
        </button>

        <div className="academy-modal-header">
          <TopicIcon topicId={article.topic} />
          <div>
            <span className="eyebrow" style={{ color: topic?.accent }}>{topic?.label}</span>
            <h2>{article.title}</h2>
          </div>
        </div>

        <div className="academy-modal-meta">
          <span><i className="ti ti-signal-3" /> Nivel {article.level}</span>
          <span><i className="ti ti-clock" /> {article.minutes} min de lectura</span>
        </div>

        <div className="academy-modal-body">
          {article.body.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        {article.tags?.length > 0 && (
          <div className="academy-modal-terms">
            <strong>Términos relacionados</strong>
            <div className="academy-term-chips">
              {article.tags.map((tag) => (
                <GlossaryTerm key={tag} term={tag} onOpenArticle={onOpenArticle} />
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div className="academy-modal-related">
            <strong>Artículos relacionados</strong>
            <div className="academy-related-grid">
              {related.map((item) => (
                <ArticleCard key={item.id} article={item} onOpen={onOpenArticle} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptosTab({ onOpenArticle }) {
  const [activeTopic, setActiveTopic] = useState("todos");
  const [query, setQuery] = useState("");

  const filteredArticles = useMemo(() => {
    return ACADEMY_ARTICLES.filter((article) => {
      const matchesTopic = activeTopic === "todos" || article.topic === activeTopic;
      const matchesQuery =
        !query.trim() ||
        article.title.toLowerCase().includes(query.toLowerCase()) ||
        article.summary.toLowerCase().includes(query.toLowerCase()) ||
        article.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()));
      return matchesTopic && matchesQuery;
    }).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  }, [activeTopic, query]);

  return (
    <div>
      {/* HU12 - E1: catálogo educativo organizado por tema */}
      <div className="academy-toolbar">
        <div className="academy-topic-pills">
          <button
            type="button"
            className={`academy-pill ${activeTopic === "todos" ? "is-active" : ""}`}
            onClick={() => setActiveTopic("todos")}
          >
            Todos
          </button>
          {ACADEMY_TOPICS.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`academy-pill ${activeTopic === topic.id ? "is-active" : ""}`}
              onClick={() => setActiveTopic(topic.id)}
              style={activeTopic === topic.id ? { borderColor: topic.accent, color: topic.accent } : undefined}
            >
              <i className={`ti ${topic.icon}`} /> {topic.label}
            </button>
          ))}
        </div>
        <div className="academy-search">
          <i className="ti ti-search" />
          <input
            type="text"
            placeholder="Buscar por tema, ej: subsidio, tasa, plazo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filteredArticles.length ? (
        <div className="academy-grid">
          {filteredArticles.map((article) => (
            <ArticleCard key={article.id} article={article} onOpen={onOpenArticle} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No encontramos artículos con ese filtro.</strong>
          <p>Prueba con otro tema o borra la búsqueda.</p>
        </div>
      )}

    </div>
  );
}

function InterpretaTab({ evaluation, onStartEvaluation, onOpenArticle }) {
  const result = evaluation?.result;

  const risks = result?.risks || [];
  const positives = result?.positive_indicators || [];

  const suggestedArticleIds = useMemo(() => {
    if (!result) return [];
    const topics = [];
    risks.forEach((risk) => {
      const { topic } = classifyRiskText(risk);
      if (topic && !topics.includes(topic)) topics.push(topic);
    });
    const fromRisks = topics
      .map((topicId) => ACADEMY_ARTICLES.find((a) => a.topic === topicId))
      .filter(Boolean)
      .map((a) => a.id);
    const withFallback = fromRisks.length ? fromRisks : STARTER_ARTICLE_IDS;
    return [...new Set(withFallback)].slice(0, 3);
  }, [result, risks]);

  if (!result) {
    return (
      <div className="empty-state">
        <strong>Aún no tienes una preevaluación.</strong>
        <p>Completa tu preevaluación financiera para ver aquí qué significa tu score, tus riesgos y qué contenido te conviene revisar primero.</p>
        <button type="button" onClick={onStartEvaluation}>Ir a precalificación</button>
      </div>
    );
  }

  const suggestedArticles = suggestedArticleIds
    .map((id) => ACADEMY_ARTICLES.find((a) => a.id === id))
    .filter(Boolean);

  return (
    <div>
      <div className="academy-suggested">
        <div className="academy-suggested-header">
          <div>
            <span className="eyebrow">Tu resultado</span>
            <h3>{risks.length ? "Esto está influyendo en tu score" : "Tu perfil no muestra riesgos relevantes"}</h3>
            <p>
              {result.ai_explanation
                ? splitTextWithGlossaryTerms(result.ai_explanation).map((part, i) =>
                  typeof part === "string" ? (
                    <React.Fragment key={i}>{part}</React.Fragment>
                  ) : (
                    <GlossaryTerm
                      key={i}
                      term={part.term}
                      onOpenArticle={onOpenArticle}
                    />
                  )
                )
                : "Revisa el detalle de tu evaluación más reciente."}
            </p>
          </div>
          <div className={`score-badge-wrap ${CLASSIFICATION_CLASS[result.classification] || "score-medium"}`}>
            <span>Score actual</span>
            <strong>{result.score}</strong>
            <small>{result.classification}</small>
          </div>
        </div>

        {risks.length > 0 && (
          <div className="academy-risk-list">
            <strong>Riesgos identificados en tu evaluación</strong>
            <ul>
              {risks.map((risk) => {
                const { term } = classifyRiskText(risk);
                return (
                  <li key={risk}>
                    {term ? (
                      splitTextWithGlossaryTerms(risk).map((part, i) =>
                        typeof part === "string" ? (
                          <React.Fragment key={i}>{part}</React.Fragment>
                        ) : (
                          <GlossaryTerm key={i} term={part.term} onOpenArticle={onOpenArticle} />
                        )
                      )
                    ) : (
                      risk
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {positives.length > 0 && (
          <div className="academy-positive-list">
            <strong>Lo que ya juega a tu favor</strong>
            <ul>
              {positives.map((item) => (
                <li key={item}><i className="ti ti-circle-check" /> {item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="academy-suggested-grid">
          {suggestedArticles.map((article) => (
            <ArticleCard key={article.id} article={article} onOpen={onOpenArticle} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CasosTab({ evaluation, onOpenArticle }) {
  const matchingCase = useMemo(() => findMatchingCase(evaluation), [evaluation]);
  const [openCaseId, setOpenCaseId] = useState(matchingCase?.id || null);

  return (
    <div>
      <div className="section-heading compact">
        <h3>Casos "de borde": cuando el resultado no es obvio</h3>
        <p>Ejemplos ilustrativos de situaciones frecuentes donde un buen score convive con un bloqueador puntual, o viceversa.</p>
      </div>

      <div className="academy-cases">
        {CASE_STUDIES.map((item) => {
          const isOpen = openCaseId === item.id;
          const isMatch = matchingCase?.id === item.id;
          return (
            <div key={item.id} className={`academy-case ${isMatch ? "is-match" : ""}`}>
              <button
                type="button"
                className="academy-case-header"
                onClick={() => setOpenCaseId(isOpen ? null : item.id)}
              >
                <div>
                  {isMatch && <span className="academy-case-match">Se parece a tu situación</span>}
                  <strong>{item.title}</strong>
                </div>
                <i className={`ti ${isOpen ? "ti-chevron-up" : "ti-chevron-down"}`} />
              </button>

              {isOpen && (
                <div className="academy-case-body">
                  <p><strong>La situación:</strong> {item.situation}</p>
                  <p><strong>Por qué pasa esto:</strong> {item.why}</p>
                  <p><strong>Qué conviene hacer:</strong> {item.action}</p>
                  {item.relatedArticleIds?.length > 0 && (
                    <div className="academy-case-links">
                      {item.relatedArticleIds.map((id) => {
                        const article = ACADEMY_ARTICLES.find((a) => a.id === id);
                        if (!article) return null;
                        return (
                          <button key={id} type="button" className="secondary-button" onClick={() => onOpenArticle(id)}>
                            {article.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TABS = [
  { id: "conceptos", label: "Conceptos", icon: "ti-books" },
  { id: "interpretar", label: "Interpreta tu score", icon: "ti-chart-bar" },
  { id: "casos", label: "Casos prácticos", icon: "ti-list-details" },
];

export default function AcademiaFinanciera({ evaluation, onStartEvaluation, onNavigate, initialArticleId }) {
  const [activeTab, setActiveTab] = useState("conceptos");
  const [openArticleId, setOpenArticleId] = useState(initialArticleId || null);

  React.useEffect(() => {
    if (initialArticleId) {
      setOpenArticleId(initialArticleId);
    }
  }, [initialArticleId]);

  const openArticle = (id) => setOpenArticleId(id);
  const closeArticle = () => setOpenArticleId(null);

  const activeArticle = ACADEMY_ARTICLES.find((a) => a.id === openArticleId) || null;
  const relatedArticles = activeArticle
    ? ACADEMY_ARTICLES.filter((a) => a.topic === activeArticle.topic && a.id !== activeArticle.id).slice(0, 2)
    : [];

  return (
    <section className="section-block academia-panel">
      <div className="section-heading">
        <span className="eyebrow">Academia financiera</span>
        <h1>Prepárate antes de comprar</h1>
        <p>Conceptos clave, una lectura de tu score real y ejemplos de casos límite frecuentes.</p>
      </div>

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
            <i className={`ti ${tab.icon}`} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "conceptos" && <ConceptosTab onOpenArticle={openArticle} />}
      {activeTab === "interpretar" && (
        <InterpretaTab evaluation={evaluation} onStartEvaluation={onStartEvaluation} onOpenArticle={openArticle} />
      )}
      {activeTab === "casos" && <CasosTab evaluation={evaluation} onOpenArticle={openArticle} />}

      <ArticleModal
        article={activeArticle}
        onClose={closeArticle}
        onOpenArticle={openArticle}
        related={relatedArticles}
      />
    </section>
  );
}