/**
 * Seed catalogue. Each entry: [key, title, type, skills, difficulty, durationMins, prerequisiteKeys, description]
 * Keys are resolved to ObjectIds by seed.js. The prerequisite graph is a DAG.
 */
module.exports = [
  // ---------------- Python
  ['py-intro', 'Python for Absolute Beginners', 'course', ['python-basics'], 1, 45, [],
    'Variables, types, input and output, and your first programs in Python.'],
  ['py-control', 'Control Flow: Conditions and Loops', 'video', ['python-basics'], 1, 25, ['py-intro'],
    'if/elif/else, for and while loops, and how to reason about program flow.'],
  ['py-functions', 'Writing Functions in Python', 'video', ['python-basics'], 2, 30, ['py-control'],
    'Parameters, return values, scope, and breaking problems into reusable functions.'],
  ['py-basics-quiz', 'Python Basics Checkpoint', 'quiz', ['python-basics'], 2, 10, ['py-functions'],
    'Check your understanding of variables, control flow and functions.'],
  ['py-collections', 'Lists, Dictionaries and Sets', 'article', ['python-intermediate'], 2, 20, ['py-functions'],
    'Python built-in collections and when each one is the right choice.'],
  ['py-oop', 'Object-Oriented Python', 'course', ['python-intermediate'], 3, 60, ['py-collections'],
    'Classes, objects, inheritance and composition with practical examples.'],
  ['py-files-errors', 'Files, Exceptions and Modules', 'video', ['python-intermediate'], 3, 35, ['py-collections'],
    'Reading and writing files, handling errors gracefully, and organising code into modules.'],

  // ---------------- SQL
  ['sql-intro', 'Introduction to Relational Databases', 'article', ['sql'], 1, 15, [],
    'Tables, rows, keys and why relational databases organise data the way they do.'],
  ['sql-select', 'SQL SELECT, WHERE and ORDER BY', 'video', ['sql'], 2, 30, ['sql-intro'],
    'Querying data: filtering rows, sorting results and choosing columns.'],
  ['sql-joins', 'Joins and Aggregations in SQL', 'course', ['sql'], 3, 50, ['sql-select'],
    'INNER and OUTER joins, GROUP BY, HAVING and aggregate functions on real datasets.'],
  ['sql-quiz', 'SQL Querying Checkpoint', 'quiz', ['sql'], 3, 10, ['sql-joins'],
    'Test your ability to write joins and aggregations.'],

  // ---------------- Statistics
  ['stats-descriptive', 'Descriptive Statistics', 'video', ['statistics'], 1, 30, [],
    'Mean, median, variance, standard deviation and summarising a dataset.'],
  ['stats-probability', 'Probability Fundamentals', 'course', ['statistics'], 2, 45, ['stats-descriptive'],
    'Events, conditional probability, Bayes theorem and common distributions.'],
  ['stats-inference', 'Hypothesis Testing and Confidence Intervals', 'course', ['statistics'], 3, 55, ['stats-probability'],
    'p-values, t-tests, confidence intervals and avoiding common statistical mistakes.'],

  // ---------------- Data wrangling and visualisation
  ['pandas-intro', 'Data Wrangling with pandas', 'course', ['data-wrangling'], 2, 60, ['py-functions'],
    'DataFrames, indexing, filtering, grouping and merging with pandas.'],
  ['pandas-cleaning', 'Cleaning Messy Real-World Data', 'video', ['data-wrangling'], 3, 40, ['pandas-intro'],
    'Missing values, duplicates, type conversion and outlier handling.'],
  ['viz-matplotlib', 'Charts with Matplotlib and Seaborn', 'video', ['data-visualization'], 2, 35, ['pandas-intro'],
    'Line, bar, scatter and distribution plots, and choosing the right chart.'],
  ['viz-storytelling', 'Storytelling with Data', 'article', ['data-visualization'], 3, 25, ['viz-matplotlib'],
    'Designing charts that communicate one clear message to a non-technical audience.'],
  ['da-capstone', 'Data Analyst Capstone: Sales Dashboard', 'course', ['data-visualization', 'sql', 'data-wrangling'], 4, 90,
    ['sql-joins', 'pandas-cleaning', 'viz-storytelling'],
    'An end-to-end project: query, clean, analyse and present a sales dataset.'],

  // ---------------- Machine learning
  ['ml-intro', 'What Is Machine Learning?', 'article', ['machine-learning'], 2, 20, ['stats-descriptive'],
    'Supervised versus unsupervised learning, features, labels and the ML workflow.'],
  ['ml-regression', 'Linear and Logistic Regression', 'course', ['machine-learning'], 3, 60, ['ml-intro', 'pandas-intro', 'stats-probability'],
    'Fitting, interpreting and evaluating the two workhorse models of machine learning.'],
  ['ml-trees', 'Decision Trees and Random Forests', 'video', ['machine-learning'], 3, 45, ['ml-regression'],
    'Tree-based models, overfitting, ensembles and feature importance.'],
  ['ml-evaluation', 'Model Evaluation and Cross-Validation', 'course', ['machine-learning'], 4, 50, ['ml-regression'],
    'Train/test splits, cross-validation, precision, recall, ROC and choosing metrics.'],
  ['ml-recsys', 'Building Recommender Systems', 'course', ['machine-learning'], 4, 70, ['ml-evaluation'],
    'Collaborative filtering, content-based filtering and hybrid recommenders.'],
  ['ml-quiz', 'Machine Learning Checkpoint', 'quiz', ['machine-learning'], 4, 15, ['ml-evaluation'],
    'Test your understanding of model training and evaluation.'],
  ['dl-intro', 'Neural Networks from Scratch', 'course', ['deep-learning'], 4, 75, ['ml-evaluation', 'py-oop'],
    'Perceptrons, backpropagation and gradient descent implemented step by step.'],
  ['dl-cnn', 'Convolutional Neural Networks', 'video', ['deep-learning'], 5, 60, ['dl-intro'],
    'Convolutions, pooling and image classification with CNNs.'],

  // ---------------- Web development
  ['web-html', 'HTML and CSS Foundations', 'course', ['html-css'], 1, 50, [],
    'Semantic HTML, the box model, flexbox and responsive layouts.'],
  ['web-css-layout', 'Modern CSS Layout with Grid', 'video', ['html-css'], 2, 30, ['web-html'],
    'CSS Grid, responsive design patterns and accessible styling.'],
  ['git-basics', 'Git and GitHub Essentials', 'video', ['git'], 1, 35, [],
    'Commits, branches, merges, pull requests and collaborating on GitHub.'],
  ['js-intro', 'JavaScript Fundamentals', 'course', ['javascript'], 2, 60, ['web-html'],
    'Variables, functions, arrays, objects and the DOM.'],
  ['js-async', 'Asynchronous JavaScript and Promises', 'video', ['javascript'], 3, 40, ['js-intro'],
    'Callbacks, promises, async/await and the event loop.'],
  ['js-quiz', 'JavaScript Checkpoint', 'quiz', ['javascript'], 3, 10, ['js-async'],
    'Test your understanding of core and asynchronous JavaScript.'],
  ['api-rest', 'Consuming REST APIs with fetch', 'article', ['web-apis'], 3, 25, ['js-async'],
    'HTTP methods, status codes, JSON and calling APIs from the browser.'],
  ['react-intro', 'React: Components, Props and State', 'course', ['react'], 3, 70, ['js-async', 'git-basics'],
    'Building interactive interfaces with React function components and hooks.'],
  ['react-project', 'Build a Full React App', 'course', ['react', 'web-apis'], 4, 90, ['react-intro', 'api-rest'],
    'A complete single-page application with routing, API calls and state management.'],
];

/** Quiz question banks for the quiz-type items, keyed by item key. */
module.exports.QUIZZES = {
  'py-basics-quiz': [
    { question: 'What does len([1, 2, 3]) return?', options: ['2', '3', '4', 'An error'], answerIndex: 1 },
    { question: 'Which keyword defines a function in Python?', options: ['func', 'function', 'def', 'lambda'], answerIndex: 2 },
    { question: 'What is the output of 7 // 2?', options: ['3.5', '3', '4', '1'], answerIndex: 1 },
    { question: 'Which loop runs while a condition stays true?', options: ['for', 'while', 'loop', 'repeat'], answerIndex: 1 },
  ],
  'sql-quiz': [
    { question: 'Which clause filters rows after grouping?', options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], answerIndex: 1 },
    { question: 'An INNER JOIN returns...', options: ['All rows from both tables', 'Only matching rows', 'Only left rows', 'No rows'], answerIndex: 1 },
    { question: 'Which function counts rows?', options: ['SUM()', 'COUNT()', 'TOTAL()', 'NUM()'], answerIndex: 1 },
  ],
  'ml-quiz': [
    { question: 'Cross-validation is mainly used to...', options: ['Speed up training', 'Estimate generalisation', 'Clean data', 'Visualise data'], answerIndex: 1 },
    { question: 'Recall measures...', options: ['TP / (TP + FP)', 'TP / (TP + FN)', 'TN / (TN + FP)', 'Accuracy'], answerIndex: 1 },
    { question: 'A random forest is an ensemble of...', options: ['Neural networks', 'Linear models', 'Decision trees', 'Clusters'], answerIndex: 2 },
  ],
  'js-quiz': [
    { question: 'What does await do?', options: ['Blocks the whole program', 'Pauses an async function until a promise settles', 'Creates a thread', 'Throws an error'], answerIndex: 1 },
    { question: 'typeof null is...', options: ['"null"', '"undefined"', '"object"', '"number"'], answerIndex: 2 },
    { question: 'Which method creates a new array from each element?', options: ['forEach', 'map', 'find', 'some'], answerIndex: 1 },
  ],
};
