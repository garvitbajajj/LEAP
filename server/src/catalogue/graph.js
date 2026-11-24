/**
 * Prerequisite graph algorithms. Pure functions over plain objects so they can be
 * unit-tested without a database and reused by the learning-path sequencer.
 *
 * A node is { id, prerequisites: [id], difficulty?, durationMins? }.
 * An edge prereq -> item means "prereq must be learned before item".
 */

const key = (id) => String(id);

/**
 * Returns the first cycle found as an array of ids ending where it started,
 * e.g. ['a', 'b', 'c', 'a'], or null when the graph is a DAG.
 */
function findCycle(nodes) {
  const byId = new Map(nodes.map((n) => [key(n.id), n]));
  const WHITE = 0; const GREY = 1; const BLACK = 2;
  const colour = new Map();
  const stack = [];

  function visit(id) {
    colour.set(id, GREY);
    stack.push(id);
    for (const pre of (byId.get(id)?.prerequisites || []).map(key)) {
      if (!byId.has(pre)) continue; // dangling references are a validation concern, not a cycle
      if (colour.get(pre) === GREY) return [...stack.slice(stack.indexOf(pre)), pre];
      if ((colour.get(pre) || WHITE) === WHITE) {
        const found = visit(pre);
        if (found) return found;
      }
    }
    stack.pop();
    colour.set(id, BLACK);
    return null;
  }

  for (const id of byId.keys()) {
    if ((colour.get(id) || WHITE) === WHITE) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Kahn's algorithm. Prerequisites always come before the items that need them;
 * among items that are ready at the same time, easier then shorter goes first.
 * Throws if the graph contains a cycle.
 */
function topologicalOrder(nodes) {
  const byId = new Map(nodes.map((n) => [key(n.id), n]));
  const indegree = new Map([...byId.keys()].map((id) => [id, 0]));
  const dependents = new Map([...byId.keys()].map((id) => [id, []]));

  for (const n of nodes) {
    for (const pre of (n.prerequisites || []).map(key)) {
      if (!byId.has(pre)) continue;
      indegree.set(key(n.id), indegree.get(key(n.id)) + 1);
      dependents.get(pre).push(key(n.id));
    }
  }

  const rank = (id) => {
    const n = byId.get(id);
    return [n.difficulty ?? 0, n.durationMins ?? 0, id];
  };
  const cmp = (a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  };

  // ponytail: sorted-array ready queue is O(n^2 log n); swap for a heap past ~10k items.
  const ready = [...byId.keys()].filter((id) => indegree.get(id) === 0).sort(cmp);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const dep of dependents.get(id)) {
      indegree.set(dep, indegree.get(dep) - 1);
      if (indegree.get(dep) === 0) {
        ready.push(dep);
        ready.sort(cmp);
      }
    }
  }

  if (order.length !== byId.size) {
    throw Object.assign(new Error('Prerequisite graph contains a cycle'), { cycle: findCycle(nodes) });
  }
  return order;
}

/** Every transitive prerequisite of itemId (not including itemId itself). */
function prerequisiteClosure(itemId, nodes) {
  const byId = new Map(nodes.map((n) => [key(n.id), n]));
  const seen = new Set();
  const walk = (id) => {
    for (const pre of (byId.get(id)?.prerequisites || []).map(key)) {
      if (!seen.has(pre)) {
        seen.add(pre);
        walk(pre);
      }
    }
  };
  walk(key(itemId));
  return seen;
}

module.exports = { findCycle, topologicalOrder, prerequisiteClosure };
