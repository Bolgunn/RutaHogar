export async function submitProjectGoal(onSetGoal, project) {
  try {
    const saved = await onSetGoal(project);
    return saved
      ? { saved: true, error: "" }
      : { saved: false, error: "No pudimos actualizar tu preferencia de proyecto. Intenta nuevamente." };
  } catch (cause) {
    return { saved: false, error: cause?.message || "No pudimos actualizar tu preferencia de proyecto. Intenta nuevamente." };
  }
}
