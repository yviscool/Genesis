import { describe, expect, test } from 'bun:test';
import { createGenerator, fmt, normalizeFormat, renderFormatDocument } from '../src/index';

describe('Genesis v2 formatter and generator', () => {
  test('renders explicit format nodes', () => {
    const document = fmt.lines(
      fmt.line(3, 2),
      fmt.table([[1, 2], [3, 4], [5, 6]]),
      fmt.grid(['.#.', ['#', '.', '#']]),
      fmt.raw('done'),
    );

    expect(renderFormatDocument(document)).toBe('3 2\n1 2\n3 4\n5 6\n.#.\n#.#\ndone');
  });

  test('rejects legacy nested arrays as v2 format output', () => {
    expect(() => normalizeFormat([[1, 2], [3, 4]])).toThrow(/fmt/);
  });

  test('creates deterministic isolated generator instances', () => {
    const left = createGenerator('seed-a');
    const right = createGenerator('seed-a');
    const other = createGenerator('seed-b');

    expect(left.ints(8, 1, 1000)).toEqual(right.ints(8, 1, 1000));
    expect(left.ints(8, 1, 1000)).not.toEqual(other.ints(8, 1, 1000));
  });

  test('keeps generator helpers replayable by seed', () => {
    const run = () => {
      const g = createGenerator('determinism-audit');
      return {
        ints: g.ints(8, 1, 1000),
        distinct: g.distinctInts(6, 1, 30),
        float: g.float(1, 2, 4),
        string: g.string(12, g.CHARSET.LOWERCASE),
        words: g.words(4, 3, 8),
        partition: g.partition(5, 100),
        permutation: g.permutation(10),
        sample: g.sample(['a', 'b', 'c', 'd', 'e'], 3),
        intervals: g.intervals(5, 1, 100, { sorted: true }),
        tree: g.tree(8),
        graph: g.graph(8, 10, { connected: true }),
        points: g.points(5, -10, 10),
        date: g.date({ minYear: 2020, maxYear: 2025 }),
        digits: g.base.digits(8, 16),
      };
    };

    expect(run()).toEqual(run());
  });
});
