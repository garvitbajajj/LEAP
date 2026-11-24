process.env.NODE_ENV = 'test';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const config = require('../src/config');
const { parseCsv, validateImport } = require('../src/catalogue/csvImport');

const EXISTING = [
  { _id: '64b000000000000000000101', title: 'Python Intro', prerequisites: [] },
  { _id: '64b000000000000000000102', title: 'SQL Basics', prerequisites: [] },
];

describe('parseCsv', () => {
  test('parses quoted fields with commas, escaped quotes, BOM and CRLF', () => {
    const csv = '\uFEFFtitle,description,type,skills,difficulty\r\n"SQL, Part 1","Use ""SELECT"" well",article,sql|data-wrangling,2\r\n';
    const { headers, records, parseError } = parseCsv(csv);
    expect(parseError).toBeNull();
    expect(headers).toEqual(['title', 'description', 'type', 'skills', 'difficulty']);
    expect(records).toHaveLength(1);
    expect(records[0].raw.title).toBe('SQL, Part 1');
    expect(records[0].raw.description).toBe('Use "SELECT" well');
  });

  test('rejects unterminated quotes and empty CSV', () => {
    expect(parseCsv('').parseError).toMatch(/empty/i);
    expect(parseCsv('title\n"unclosed').parseError).toMatch(/unterminated/i);
  });
});

describe('validateImport (dry-run validation & DAG checks)', () => {
  test('validates clean rows and resolves prerequisites by existing title, ID, and batch title', () => {
    const csv = [
      'title,description,type,skills,difficulty,durationMins,status,prerequisites',
      'DuckDB Intro,Fast SQL,article,sql|data-wrangling,2,20,draft,SQL Basics',
      'DuckDB Advanced,Window funcs,video,sql,4,30,published,DuckDB Intro|64b000000000000000000101',
    ].join('\n');

    const report = validateImport(csv, EXISTING);
    expect(report.errorCount).toBe(0);
    expect(report.validCount).toBe(2);
    expect(report.cycle).toBeNull();
    expect(report.rows[0].item.prerequisites).toEqual(['64b000000000000000000102']);
    expect(report.rows[1].item.prerequisites).toEqual([
      String(report.rows[0].item._id),
      '64b000000000000000000101',
    ]);
  });

  test('reports row-level validation errors without aborting remaining rows', () => {
    const csv = [
      'title,type,skills,difficulty,prerequisites',
      'Good Item,video,python-basics,2,',
      ',invalid-type,,9,NonExistent',
      'Python Intro,article,python-basics,1,',
    ].join('\n');

    const report = validateImport(csv, EXISTING);
    expect(report.total).toBe(3);
    expect(report.validCount).toBe(1);
    expect(report.errorCount).toBe(2);
    expect(report.rows[1].errors.length).toBeGreaterThanOrEqual(4);
    expect(report.rows[2].errors[0]).toMatch(/already exists/i);
  });

  test('detects prerequisite cycles inside the uploaded CSV batch', () => {
    const csv = [
      'title,type,skills,difficulty,prerequisites',
      'Course A,course,sql,2,Course B',
      'Course B,course,sql,2,Course A',
    ].join('\n');

    const report = validateImport(csv, EXISTING);
    expect(report.cycle).not.toBeNull();
    expect(report.errorCount).toBe(2);
    expect(report.rows[0].errors.some((e) => /cycle/i.test(e))).toBe(true);
  });

  test('fails cleanly when required headers are missing', () => {
    const report = validateImport('title,description\nOnly Title,Desc', EXISTING);
    expect(report.errorCount).toBe(1);
    expect(report.rows[0].errors[0]).toMatch(/Missing required CSV columns/);
  });
});

describe('POST /api/v1/catalogue/import HTTP guards', () => {
  const app = createApp();
  const learnerToken = jwt.sign({ sub: '64b000000000000000000001', role: 'learner' }, config.jwtSecret);
  const instructorToken = jwt.sign({ sub: '64b000000000000000000002', role: 'instructor' }, config.jwtSecret);

  test('blocks learners with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/v1/catalogue/import')
      .set('Authorization', `Bearer ${learnerToken}`)
      .send({ csv: 'title,type,skills,difficulty\nA,video,sql,1', dryRun: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('rejects empty CSV payload with 400 before touching the database', async () => {
    const res = await request(app)
      .post('/api/v1/catalogue/import')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ csv: '   ', dryRun: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
