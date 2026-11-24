const { buildPath, refreshStatuses, summarise } = require('../src/path/sequencer');

const item = (_id, skills, prerequisites = [], difficulty = 1, durationMins = 30) => ({
  _id, skills, prerequisites, difficulty, durationMins,
});

const CATALOGUE = [
  item('py1', ['python-basics']),
  item('py2', ['python-basics'], ['py1'], 2),
  item('sql1', ['sql']),
  item('pd', ['data-wrangling'], ['py2'], 2),
  item('web', ['html-css']),
];

describe('buildPath', () => {
  test('covers goal skills plus their prerequisites, in dependency order', () => {
    const order = buildPath({ goalSkills: ['data-wrangling'], items: CATALOGUE });
    expect(order).toEqual(['py1', 'py2', 'pd']);
  });

  test('excludes completed items', () => {
    const order = buildPath({ goalSkills: ['data-wrangling'], items: CATALOGUE, completedIds: ['py1'] });
    expect(order).toEqual(['py2', 'pd']);
  });

  test('skips skills the learner has already mastered', () => {
    const order = buildPath({
      goalSkills: ['python-basics', 'sql'], items: CATALOGUE, mastery: [{ skill: 'python-basics', score: 0.9 }],
    });
    expect(order).toEqual(['sql1']);
  });

  test('ignores items unrelated to the goal', () => {
    expect(buildPath({ goalSkills: ['sql'], items: CATALOGUE })).not.toContain('web');
  });
});

describe('refreshStatuses', () => {
  const pathOf = (...steps) => ({
    status: 'active',
    steps: steps.map(([id, prereqs, status = 'locked']) => ({
      itemId: { _id: id, prerequisites: prereqs, durationMins: 30 }, status,
    })),
  });

  test('a step unlocks only once its in-path prerequisites are done', () => {
    const path = refreshStatuses(pathOf(['a', []], ['b', ['a']]));
    expect(path.steps.map((s) => s.status)).toEqual(['available', 'locked']);
    path.steps[0].status = 'complete';
    refreshStatuses(path);
    expect(path.steps[1].status).toBe('available');
  });

  test('prerequisites outside the path count as already satisfied', () => {
    const path = refreshStatuses(pathOf(['b', ['done-before']]));
    expect(path.steps[0].status).toBe('available');
  });

  test('a skipped prerequisite also unlocks its dependents', () => {
    const path = refreshStatuses(pathOf(['a', [], 'skipped'], ['b', ['a']]));
    expect(path.steps[1].status).toBe('available');
  });

  test('marks the path completed when every step is done', () => {
    const path = refreshStatuses(pathOf(['a', [], 'complete'], ['b', ['a'], 'skipped']));
    expect(path.status).toBe('completed');
  });

  test('summarise reports progress and ETA', () => {
    const path = pathOf(['a', [], 'complete'], ['b', ['a']], ['c', ['b']]);
    expect(summarise(path, 1)).toEqual({
      totalSteps: 3, completedSteps: 1, progressPct: 33, remainingMins: 60, etaWeeks: 1,
    });
  });
});
