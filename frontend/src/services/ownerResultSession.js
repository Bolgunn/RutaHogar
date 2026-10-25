import { currentTrackingEvaluation } from "../lib/tracking/currentEvaluation";

// This state lives only for the mounted owner view, never in browser storage.
export function createOwnerResultSession({ ownerId, read, incorporate, onChange }) {
  let state = { ownerId, evaluation: null, tracking: null, scoreChange: null, loading: true, updating: false, message: "", error: "" };
  let persistedRows = [];
  let comparisonIds = null;
  const scoreChange = () => {
    if (!comparisonIds) return null;
    const [before, after] = comparisonIds.map(id => persistedRows.find(row => row.id === id && (!row.user_id || row.user_id === ownerId)));
    if (!before || !after || before.id === after.id || after.co_debtor?.evaluation_type !== "bipersonal_confirmed"
      || !Number.isFinite(before.result?.score) || !Number.isFinite(after.result?.score)) return null;
    return { previousId: before.id, evaluationId: after.id, previousScore: before.result.score, score: after.result.score };
  };
  let disposed = false;
  let reading = null;
  let updating = null;
  let readRevision = 0;
  const publish = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const refresh = ({ force = false } = {}) => {
    if (disposed) return Promise.resolve(null);
    if (reading && !force) return reading;
    const revision = ++readRevision;
    persistedRows = [];
    publish({ loading: true, evaluation: null, tracking: null, scoreChange: null, error: "" });
    reading = Promise.resolve().then(() => disposed ? null : read()).then((bundle) => {
      if (disposed || revision !== readRevision) return null;
      const evaluation = currentTrackingEvaluation(bundle.tracking, bundle.evaluations, ownerId);
      persistedRows = bundle.evaluations || [];
      if (comparisonIds && comparisonIds[1] !== evaluation?.id) comparisonIds = null;
      publish({ evaluation, tracking: bundle.tracking, loading: false, scoreChange: scoreChange() });
      return evaluation;
    }).catch(() => {
      if (disposed || revision !== readRevision) return null;
      publish({ evaluation: null, tracking: null, loading: false, error: "No pudimos actualizar tu evaluación. Reintenta para consultar los datos vigentes." });
      return null;
    }).finally(() => { if (revision === readRevision) reading = null; });
    return reading;
  };
  const update = () => {
    if (disposed || updating || reading || state.evaluation?.co_debtor?.update_required !== true || state.evaluation?.co_debtor?.matching_confirmed_later === true) return updating;
    const previousId = state.evaluation?.id;
    comparisonIds = null;
    publish({ updating: true, scoreChange: null, message: "", error: "" });
    updating = Promise.resolve().then(() => disposed ? null : incorporate()).then(async (saved) => {
      if (disposed) return;
      const evaluation = await refresh();
      if (disposed) return;
      // Compare only rows re-read from owner persistence; never the write response
      // or the tracking fallback, and never manufacture a delta after a failed read.
      const savedId = saved?.evaluation_ids?.[0];
      comparisonIds = evaluation && evaluation.id !== previousId && (!savedId || savedId === evaluation.id)
        ? [previousId, evaluation.id] : null;
      publish({ scoreChange: scoreChange(), message: "Los antecedentes fueron incorporados a una nueva evaluación." });
    }).catch(async (failure) => {
      if (disposed) return;
      // A race may have closed participation or incorporated this revision already.
      // Re-read authority before exposing a retry; never retry the write automatically.
      await refresh();
      publish({ error: failure?.message || "No se pudo actualizar tu evaluación. Intenta nuevamente." });
    }).finally(() => { updating = null; publish({ updating: false }); });
    return updating;
  };
  return { refresh, update, getState: () => state, dispose: () => { disposed = true; } };
}
