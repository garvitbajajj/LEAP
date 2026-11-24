/**
 * Learning path sequencing. Pure functions over plain objects.
 *
 * A path covers every item teaching a goal skill the learner has not yet mastered,
 * plus all of those items' transitive prerequisites, minus what is already complete,
 * ordered so that prerequisites always come first.
 */
const { topologicalOrder, prerequisiteClosure } = require('../catalogue/graph');

const MASTERED = 0.85;
const DONE = new Set(['complete', 'skipped']);

function buildPath({ goalSkills, items, completedIds = [], mastery = [], masteredThreshold = MASTERED }) {
  const nodes = items.map((i) => ({
    id: String(i._id), prerequisites: (i.prerequisites || []).map(String),
    difficulty: i.difficulty, durationMins: i.durationMins, skills: i.skills,
  }));
  const mastered = new Set(mastery.filter((m) => m.score >= masteredThreshold).map((m) => m.skill));
  const completed = new Set(completedIds.map(String));

  const needed = new Set();
  for (const n of nodes) {
    if (n.skills.some((s) => goalSkills.includes(s) && !mastered.has(s))) {
      needed.add(n.id);
      prerequisiteClosure(n.id, nodes).forEach((id) => needed.add(id));
    }
  }
  const subset = nodes.filter((n) => needed.has(n.id) && !completed.has(n.id));
  return topologicalOrder(subset);
}

/**
 * Recomputes locked/available for unfinished steps. A step is available once every
 * prerequisite that appears in the path is complete or skipped; prerequisites outside
 * the path were already done when the path was built. Expects steps[].itemId populated
 * with `prerequisites`.
 */
function refreshStatuses(path) {
  const stepById = new Map(path.steps.map((s) => [String(s.itemId._id ?? s.itemId), s]));
  for (const step of path.steps) {
    if (DONE.has(step.status)) continue;
    const prereqs = (step.itemId.prerequisites || []).map(String).filter((id) => stepById.has(id));
    step.status = prereqs.every((id) => DONE.has(stepById.get(id).status)) ? 'available' : 'locked';
  }
  if (path.steps.length && path.steps.every((s) => DONE.has(s.status))) path.status = 'completed';
  return path;
}

/** Progress summary used by the API and the dashboard. */
function summarise(path, weeklyHours = 5) {
  const total = path.steps.length;
  const done = path.steps.filter((s) => DONE.has(s.status)).length;
  const remainingMins = path.steps
    .filter((s) => !DONE.has(s.status))
    .reduce((sum, s) => sum + (s.itemId.durationMins || 0), 0);
  return {
    totalSteps: total,
    completedSteps: done,
    progressPct: total ? Math.round((done / total) * 100) : 0,
    remainingMins,
    etaWeeks: +(remainingMins / (Math.max(weeklyHours, 1) * 60)).toFixed(1),
  };
}

module.exports = { buildPath, refreshStatuses, summarise, MASTERED };
