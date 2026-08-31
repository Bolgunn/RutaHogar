import { supabase } from "../utils/supabase";
import { ensureUserProfile, getAuthenticatedUser, isSupabaseDataConfigured, logSupabaseError } from "./profileService";

const GOALS_KEY = "RutaHogar_improvement_goals";
const GOAL_PROGRESS_KEY = "RutaHogar_goal_progress";

function readLocalGoals() {
  try {
    return JSON.parse(localStorage.getItem(GOALS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

function readLocalProgress() {
  try {
    return JSON.parse(localStorage.getItem(GOAL_PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLocalProgress(progress) {
  localStorage.setItem(GOAL_PROGRESS_KEY, JSON.stringify(progress));
}

function progressKey(userId, goalId) {
  return `${userId || "local-user"}:${goalId}`;
}

function normalizeGoal(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    evaluation_id: row.evaluation_id,
    title: row.title,
    description: row.description || "",
    status: row.status || "pendiente",
    progress_data: row.progress_data || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function withStoredProgress(goal, userId) {
  const storedProgress = readLocalProgress()[progressKey(userId, goal.id)];
  return storedProgress ? { ...goal, progress_data: storedProgress } : goal;
}

export async function getGoals(userId, evaluationId) {
  if (!isSupabaseDataConfigured) {
    return readLocalGoals().filter(
      (goal) => goal.user_id === userId && (!evaluationId || goal.evaluation_id === evaluationId),
    );
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para cargar metas.");
  }
  await ensureUserProfile(user);

  let query = supabase
    .from("improvement_goals")
    .select("id, user_id, evaluation_id, title, description, status, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (evaluationId) {
    query = query.eq("evaluation_id", evaluationId);
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return (data || []).map(normalizeGoal).map((goal) => withStoredProgress(goal, user.id));
}

export async function createGoal(userId, evaluationId, goal) {
  if (!isSupabaseDataConfigured) {
    const payload = {
      user_id: userId,
      evaluation_id: evaluationId,
      title: goal.title,
      description: goal.description || null,
      status: goal.status || "pendiente",
    };
    const entry = {
      ...payload,
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${goal.title}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const next = [...readLocalGoals(), entry];
    writeLocalGoals(next);
    return entry;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para crear metas.");
  }
  await ensureUserProfile(user);

  const payload = {
    user_id: user.id,
    evaluation_id: evaluationId,
    title: goal.title,
    description: goal.description || null,
    status: goal.status || "pendiente",
  };

  const { data, error } = await supabase
    .from("improvement_goals")
    .insert(payload)
    .select("id, user_id, evaluation_id, title, description, status, created_at, updated_at")
    .single();

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return withStoredProgress(normalizeGoal(data), user.id);
}

export async function updateGoalStatus(goalId, userId, status) {
  if (!isSupabaseDataConfigured) {
    const next = readLocalGoals().map((goal) =>
      goal.id === goalId && goal.user_id === userId
        ? { ...goal, status, updated_at: new Date().toISOString() }
        : goal,
    );
    writeLocalGoals(next);
    return next.find((goal) => goal.id === goalId && goal.user_id === userId) || null;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para actualizar metas.");
  }

  const { data, error } = await supabase
    .from("improvement_goals")
    .update({ status })
    .eq("id", goalId)
    .eq("user_id", user.id)
    .select("id, user_id, evaluation_id, title, description, status, created_at, updated_at")
    .single();

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return withStoredProgress(normalizeGoal(data), user.id);
}

export async function updateGoalProgress(goalId, userId, progressData) {
  const progress = {
    ...readLocalProgress(),
    [progressKey(userId, goalId)]: progressData,
  };
  writeLocalProgress(progress);

  if (!isSupabaseDataConfigured) {
    const next = readLocalGoals().map((goal) =>
      goal.id === goalId && goal.user_id === userId
        ? { ...goal, progress_data: progressData, updated_at: new Date().toISOString() }
        : goal,
    );
    writeLocalGoals(next);
    return next.find((goal) => goal.id === goalId && goal.user_id === userId) || null;
  }

  return {
    id: goalId,
    user_id: userId,
    progress_data: progressData,
    updated_at: new Date().toISOString(),
  };
}

export async function deleteGoal(goalId, userId) {
  if (!isSupabaseDataConfigured) {
    writeLocalGoals(readLocalGoals().filter((goal) => !(goal.id === goalId && goal.user_id === userId)));
    return;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para eliminar metas.");
  }

  const { error } = await supabase
    .from("improvement_goals")
    .delete()
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (error) {
    logSupabaseError(error);
    throw error;
  }
}
