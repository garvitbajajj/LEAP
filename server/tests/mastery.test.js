const {
  DEFAULTS, bktUpdate, applyQuiz, applyCompletion, updateMastery,
} = require('../src/path/mastery');

describe('Bayesian Knowledge Tracing', () => {
  test('a correct answer matches the hand-computed posterior', () => {
    // posterior = 0.5*0.9 / (0.5*0.9 + 0.5*0.2) = 0.8182 ; + (1-0.8182)*0.15 = 0.8455
    expect(bktUpdate(0.5, true)).toBeCloseTo(0.8455, 3);
  });

  test('an incorrect answer matches the hand-computed posterior', () => {
    // posterior = 0.5*0.1 / (0.5*0.1 + 0.5*0.8) = 0.1111 ; + (1-0.1111)*0.15 = 0.2444
    expect(bktUpdate(0.5, false)).toBeCloseTo(0.2444, 3);
  });

  test('a passed quiz raises mastery and a failed one lowers it', () => {
    expect(applyQuiz(0.5, 1)).toBeGreaterThan(0.5);
    expect(applyQuiz(0.5, 0)).toBeLessThan(0.5);
  });

  test('repeat attempts are damped so mastery cannot be farmed', () => {
    const first = applyQuiz(0.3, 1, 0) - 0.3;
    const third = applyQuiz(0.3, 1, 2) - 0.3;
    expect(third).toBeCloseTo(first / 4, 6);
  });

  test('completion moves mastery less than a passed quiz', () => {
    expect(applyCompletion(0.3) - 0.3).toBeLessThan(applyQuiz(0.3, 1) - 0.3);
  });

  test('mastery stays within (0, 1)', () => {
    let p = 0.5;
    for (let i = 0; i < 50; i += 1) p = applyQuiz(p, 1);
    expect(p).toBeLessThan(1);
    for (let i = 0; i < 50; i += 1) p = applyQuiz(p, 0);
    expect(p).toBeGreaterThan(0);
  });
});

describe('updateMastery', () => {
  test('creates a mastery entry for a new skill at pInit', () => {
    const mastery = [];
    updateMastery(mastery, ['sql'], { type: 'view' });
    expect(mastery).toEqual([{ skill: 'sql', score: DEFAULTS.pInit, confidence: 0.1 }]);
  });

  test('updates every skill the item covers and reports the changes', () => {
    const mastery = [{ skill: 'sql', score: 0.4, confidence: 0.2 }];
    const changed = updateMastery(mastery, ['sql', 'statistics'], { type: 'quiz_attempt', score: 0.9 });
    expect(changed).toEqual(['sql', 'statistics']);
    expect(mastery.find((m) => m.skill === 'sql').score).toBeGreaterThan(0.4);
  });
});
