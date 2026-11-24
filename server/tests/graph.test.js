const { findCycle, topologicalOrder, prerequisiteClosure } = require('../src/catalogue/graph');

const n = (id, prerequisites = [], difficulty = 1, durationMins = 10) => ({ id, prerequisites, difficulty, durationMins });

describe('findCycle', () => {
  test('returns null for a valid DAG', () => {
    expect(findCycle([n('a'), n('b', ['a']), n('c', ['a', 'b'])])).toBeNull();
  });

  test('detects a 2-node cycle and names the path', () => {
    const cycle = findCycle([n('a', ['b']), n('b', ['a'])]);
    expect(cycle).not.toBeNull();
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(new Set(cycle)).toEqual(new Set(['a', 'b']));
  });

  test('detects a 5-node cycle', () => {
    const nodes = [n('a', ['e']), n('b', ['a']), n('c', ['b']), n('d', ['c']), n('e', ['d'])];
    expect(findCycle(nodes)).toHaveLength(6);
  });

  test('detects a self-loop', () => {
    expect(findCycle([n('a', ['a'])])).toEqual(['a', 'a']);
  });

  test('ignores dangling prerequisite references', () => {
    expect(findCycle([n('a', ['missing'])])).toBeNull();
  });
});

describe('topologicalOrder', () => {
  test('prerequisites always precede dependents', () => {
    const order = topologicalOrder([n('c', ['b']), n('b', ['a']), n('a')]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('breaks ties by difficulty, then duration', () => {
    const order = topologicalOrder([n('hard', [], 3), n('easy-long', [], 1, 60), n('easy-short', [], 1, 5)]);
    expect(order).toEqual(['easy-short', 'easy-long', 'hard']);
  });

  test('throws on a cycle', () => {
    expect(() => topologicalOrder([n('a', ['b']), n('b', ['a'])])).toThrow(/cycle/);
  });

  test('holds over 100 random DAGs', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let g = 0; g < 100; g += 1) {
      const size = 2 + Math.floor(rand() * 15);
      // Edges only point from lower to higher index, so the graph is always acyclic.
      const nodes = Array.from({ length: size }, (_, i) => n(`n${i}`,
        Array.from({ length: i }, (__, j) => `n${j}`).filter(() => rand() < 0.3)));
      const order = topologicalOrder(nodes);
      const pos = new Map(order.map((id, i) => [id, i]));
      expect(order).toHaveLength(size);
      for (const node of nodes) {
        for (const p of node.prerequisites) expect(pos.get(p)).toBeLessThan(pos.get(node.id));
      }
    }
  });
});

describe('prerequisiteClosure', () => {
  test('collects transitive prerequisites only', () => {
    const nodes = [n('a'), n('b', ['a']), n('c', ['b']), n('x')];
    expect(prerequisiteClosure('c', nodes)).toEqual(new Set(['a', 'b']));
  });
});
