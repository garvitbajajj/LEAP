/** Learning goals a learner can choose at onboarding, and the skills each one needs. */
const GOALS = {
  'data-analyst': {
    label: 'Data Analyst',
    skills: ['python-basics', 'sql', 'statistics', 'data-wrangling', 'data-visualization'],
  },
  'ml-engineer': {
    label: 'Machine Learning Engineer',
    skills: ['python-basics', 'python-intermediate', 'statistics', 'data-wrangling', 'machine-learning', 'deep-learning'],
  },
  'web-developer': {
    label: 'Web Developer',
    skills: ['html-css', 'javascript', 'git', 'react', 'web-apis'],
  },
};

module.exports = { GOALS };
