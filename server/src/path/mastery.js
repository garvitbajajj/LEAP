/**
 * Mastery estimation with Bayesian Knowledge Tracing (Corbett & Anderson, 1994).
 *
 *   pKnown  probability the learner has mastered the skill
 *   pLearn  probability of learning the skill at each practice opportunity
 *   pGuess  probability of answering correctly without mastery
 *   pSlip   probability of answering incorrectly despite mastery
 */
const DEFAULTS = { pInit: 0.1, pLearn: 0.15, pGuess: 0.2, pSlip: 0.1 };

const clamp = (x) => Math.min(0.99, Math.max(0.01, x));

/** One BKT observation: Bayesian posterior given the answer, then the learning transition. */
function bktUpdate(pKnown, correct, p = DEFAULTS) {
  const k = clamp(pKnown);
  const posterior = correct
    ? (k * (1 - p.pSlip)) / (k * (1 - p.pSlip) + (1 - k) * p.pGuess)
    : (k * p.pSlip) / (k * p.pSlip + (1 - k) * (1 - p.pGuess));
  return clamp(posterior + (1 - posterior) * p.pLearn);
}

/**
 * A quiz score in [0, 1] is treated as a mix of correct and incorrect observations.
 * Repeat attempts inside the damping window count for progressively less, so mastery
 * cannot be farmed by retaking the same quiz.
 */
function applyQuiz(pKnown, score, priorAttemptsInWindow = 0, p = DEFAULTS) {
  const s = Math.min(1, Math.max(0, score));
  const target = s * bktUpdate(pKnown, true, p) + (1 - s) * bktUpdate(pKnown, false, p);
  const damping = 0.5 ** priorAttemptsInWindow;
  return clamp(pKnown + (target - pKnown) * damping);
}

/** Finishing content is weaker evidence than passing a quiz, so it moves mastery less. */
function applyCompletion(pKnown, p = DEFAULTS) {
  return clamp(pKnown + (1 - pKnown) * p.pLearn * 0.5);
}

/**
 * Applies an event to a profile's mastery array in place, for every skill the item
 * covers. Returns the skills whose mastery changed.
 */
function updateMastery(mastery, skills, event, priorAttemptsInWindow = 0) {
  const changed = [];
  for (const skill of skills) {
    let m = mastery.find((x) => x.skill === skill);
    if (!m) {
      m = { skill, score: DEFAULTS.pInit, confidence: 0.1 };
      mastery.push(m);
    }
    const before = m.score;
    if (event.type === 'quiz_attempt' && typeof event.score === 'number') {
      m.score = applyQuiz(m.score, event.score, priorAttemptsInWindow);
      m.confidence = Math.min(1, m.confidence + 0.15);
    } else if (event.type === 'complete') {
      m.score = applyCompletion(m.score);
      m.confidence = Math.min(1, m.confidence + 0.05);
    }
    m.score = +m.score.toFixed(4);
    m.confidence = +m.confidence.toFixed(3);
    if (m.score !== before) changed.push(skill);
  }
  return changed;
}

module.exports = { DEFAULTS, bktUpdate, applyQuiz, applyCompletion, updateMastery };
