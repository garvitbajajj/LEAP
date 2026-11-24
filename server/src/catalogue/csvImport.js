/**
 * Bulk CSV parser, validator and prerequisite cycle checker for the catalogue.
 * Pure functions so dry-run previews and unit tests run without a database.
 */
const mongoose = require('mongoose');
const { findCycle } = require('./graph');

const VALID_TYPES = new Set(['course', 'video', 'article', 'quiz']);
const VALID_STATUSES = new Set(['draft', 'published', 'retired']);
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * RFC 4180 CSV parser supporting quoted fields, embedded commas/newlines,
 * escaped double quotes (""), UTF-8 BOM, and CRLF/LF line endings.
 */
function parseCsv(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const matrix = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) matrix.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) matrix.push(row);

  if (inQuotes) {
    return { headers: [], records: [], parseError: 'Unterminated quoted field in CSV' };
  }
  if (matrix.length === 0) {
    return { headers: [], records: [], parseError: 'CSV is empty' };
  }

  const headers = matrix[0].map((h) => h.trim());
  const records = matrix.slice(1).map((cols, idx) => {
    const obj = {};
    headers.forEach((h, colIdx) => {
      obj[h] = (cols[colIdx] ?? '').trim();
    });
    return { rowNumber: idx + 2, raw: obj };
  });

  return { headers, records, parseError: null };
}

function splitList(val) {
  if (!val) return [];
  return String(val)
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSkill(s) {
  return s.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Validates parsed CSV records against schema rules and the existing catalogue graph.
 * Prerequisite cells may reference existing item ObjectIds OR item titles (existing or
 * defined within the same CSV batch).
 */
function validateImport(csvText, existingItems = []) {
  const { headers, records, parseError } = parseCsv(csvText);
  if (parseError) {
    return {
      total: 0,
      validCount: 0,
      errorCount: 1,
      cycle: null,
      headers,
      rows: [{ rowNumber: 1, title: '', status: 'error', errors: [parseError], item: null }],
    };
  }

  const requiredHeaders = ['title', 'type', 'skills', 'difficulty'];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return {
      total: records.length,
      validCount: 0,
      errorCount: 1,
      cycle: null,
      headers,
      rows: [{
        rowNumber: 1,
        title: '',
        status: 'error',
        errors: [`Missing required CSV columns: ${missingHeaders.join(', ')}`],
        item: null,
      }],
    };
  }

  // Index existing items by id and lowercase title.
  const existingById = new Map();
  const existingByTitle = new Map();
  for (const it of existingItems) {
    const id = String(it._id || it.id);
    existingById.set(id, id);
    if (it.title) existingByTitle.set(it.title.trim().toLowerCase(), id);
  }

  // First pass: field validation + assign provisional ObjectIds so batch-internal
  // prerequisite references by title can be resolved cleanly.
  const batchByTitle = new Map();
  const staged = records.map(({ rowNumber, raw }) => {
    const errors = [];
    const title = (raw.title || '').trim();
    const description = (raw.description || '').trim();
    const type = (raw.type || '').trim().toLowerCase();
    const skills = splitList(raw.skills).map(normalizeSkill).filter(Boolean);
    const difficulty = Number(raw.difficulty);
    const durationMins = raw.durationMins ? Number(raw.durationMins) : 15;
    const language = (raw.language || 'en').trim() || 'en';
    const status = (raw.status || 'draft').trim().toLowerCase();
    const url = (raw.url || '').trim() || undefined;
    const rawPrereqs = splitList(raw.prerequisites);

    if (!title) errors.push('title is required');
    if (!VALID_TYPES.has(type)) errors.push(`type must be one of ${[...VALID_TYPES].join(', ')}`);
    if (skills.length === 0) errors.push('at least one skill is required (separate multiple with | or ;)');
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      errors.push('difficulty must be an integer between 1 and 5');
    }
    if (!Number.isFinite(durationMins) || durationMins < 1) {
      errors.push('durationMins must be a positive number');
    }
    if (!VALID_STATUSES.has(status)) {
      errors.push(`status must be one of ${[...VALID_STATUSES].join(', ')}`);
    }

    const titleKey = title.toLowerCase();
    if (title && batchByTitle.has(titleKey)) {
      errors.push(`duplicate title in CSV (first seen on row ${batchByTitle.get(titleKey).rowNumber})`);
    }
    if (title && existingByTitle.has(titleKey)) {
      errors.push('an item with this title already exists in the catalogue');
    }

    const _id = new mongoose.Types.ObjectId();
    const entry = {
      rowNumber,
      title,
      rawPrereqs,
      errors,
      item: {
        _id,
        title,
        description,
        type,
        skills,
        prerequisites: [],
        difficulty,
        durationMins,
        language,
        status,
        ...(url ? { url } : {}),
      },
    };
    if (title && !batchByTitle.has(titleKey)) {
      batchByTitle.set(titleKey, { id: String(_id), rowNumber });
    }
    return entry;
  });

  // Second pass: resolve prerequisite references (existing ID, existing title, or batch title).
  for (const entry of staged) {
    const resolved = [];
    for (const ref of entry.rawPrereqs) {
      let targetId = null;
      if (OBJECT_ID_RE.test(ref) && existingById.has(ref)) {
        targetId = existingById.get(ref);
      } else {
        const key = ref.toLowerCase();
        targetId = existingByTitle.get(key) || batchByTitle.get(key)?.id || null;
      }
      if (!targetId) {
        entry.errors.push(`unknown prerequisite: "${ref}"`);
      } else if (targetId === String(entry.item._id)) {
        entry.errors.push(`item cannot list itself as a prerequisite ("${ref}")`);
      } else if (!resolved.includes(targetId)) {
        resolved.push(targetId);
      }
    }
    entry.item.prerequisites = resolved;
  }

  // Third pass: check prerequisite DAG for cycles across existing + valid staged rows.
  const graphNodes = existingItems.map((it) => ({
    id: String(it._id || it.id),
    prerequisites: (it.prerequisites || []).map(String),
  }));
  for (const entry of staged) {
    if (entry.errors.length === 0) {
      graphNodes.push({ id: String(entry.item._id), prerequisites: entry.item.prerequisites });
    }
  }
  const cycle = findCycle(graphNodes);
  if (cycle) {
    const cycleSet = new Set(cycle.map(String));
    for (const entry of staged) {
      if (cycleSet.has(String(entry.item._id))) {
        entry.errors.push('prerequisites create a cycle in the prerequisite graph');
      }
    }
  }

  const rows = staged.map((e) => ({
    rowNumber: e.rowNumber,
    title: e.title,
    status: e.errors.length === 0 ? 'valid' : 'error',
    errors: e.errors,
    item: e.errors.length === 0 ? e.item : null,
  }));

  const validCount = rows.filter((r) => r.status === 'valid').length;
  const errorCount = rows.length - validCount;

  return {
    total: rows.length,
    validCount,
    errorCount,
    cycle,
    headers,
    rows,
  };
}

module.exports = { parseCsv, validateImport };
