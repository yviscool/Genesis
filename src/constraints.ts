/**
 * Declarative input constraints.
 *
 * Every dataset in practice re-implements the same range checks by hand:
 *
 * ```ts
 * if (!Number.isInteger(n) || n < 1 || n > N_MAX) return `n out of range: ${n}`;
 * ```
 *
 * `constraints` expresses that once, per field, and leaves `validate` for the
 * cross-field invariants that actually need code (graph connectivity, order,
 * duplicate detection, ...).
 */

export interface FieldConstraint {
  /** Reject non-integers (also rejects NaN / Infinity). */
  int?: boolean;
  min?: number;
  max?: number;
  /** Upper bound read from another field, e.g. `ref: 'n'`. */
  ref?: string;
  /** Exact value, or exact array/string length. `'m'` refers to `input.m`. */
  eq?: number | string;
  /** Exact length of an array or string. `'m'` refers to `input.m`. */
  len?: number | string;
  /** Minimum length of an array or string. `'m'` refers to `input.m`. */
  minLen?: number | string;
  /** Maximum length of an array or string. `'m'` refers to `input.m`. */
  maxLen?: number | string;
  oneOf?: readonly (string | number)[];
}

export type DatasetConstraints = Record<string, FieldConstraint>;

type Segment =
  | { readonly kind: 'key'; readonly name: string }
  | { readonly kind: 'index'; readonly index: number | '*' };

interface Resolved {
  readonly value: unknown;
  readonly path: string;
}

const KEY_PATTERN = /^([A-Za-z_$][\w$]*)((?:\[\d+\]|\[\*\])*)$/;

export function parseConstraintPath(pattern: string): Segment[] {
  const segments: Segment[] = [];
  for (const part of pattern.split('.')) {
    const match = KEY_PATTERN.exec(part);
    if (!match) {
      throw new Error(`Unsupported constraint path '${pattern}': '${part}' is not a valid field segment.`);
    }
    segments.push({ kind: 'key', name: match[1] as string });
    for (const indexMatch of (match[2] as string).matchAll(/\[(\d+|\*)\]/g)) {
      const raw = indexMatch[1] as string;
      segments.push({ kind: 'index', index: raw === '*' ? '*' : Number(raw) });
    }
  }
  return segments;
}

/** Walk `input` following `segments`, expanding `[*]` into one entry per element. */
function resolve(root: unknown, segments: readonly Segment[]): Resolved[] {
  let current: Resolved[] = [{ value: root, path: '' }];

  for (const segment of segments) {
    const next: Resolved[] = [];
    for (const item of current) {
      if (segment.kind === 'key') {
        if (!item.value || typeof item.value !== 'object') continue;
        const child = (item.value as Record<string, unknown>)[segment.name];
        if (child === undefined) continue;
        next.push({ value: child, path: item.path ? `${item.path}.${segment.name}` : segment.name });
        continue;
      }

      const path = `${item.path}[${segment.index === '*' ? '' : segment.index}]`;
      if (segment.index === '*') {
        if (!Array.isArray(item.value)) continue;
        for (let index = 0; index < item.value.length; index += 1) {
          next.push({ value: item.value[index], path: `${item.path}[${index}]` });
        }
      } else {
        if (!Array.isArray(item.value)) continue;
        if (segment.index >= item.value.length) continue;
        next.push({ value: item.value[segment.index], path });
      }
    }
    current = next;
    if (current.length === 0) return [];
  }

  return current;
}

function resolveScalar(root: unknown, pattern: string): number | string | undefined {
  const hits = resolve(root, parseConstraintPath(pattern));
  if (hits.length !== 1) return undefined;
  const value = hits[0]?.value;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `array(length=${value.length})`;
  return String(value);
}

/**
 * Check `input` against `constraints`.
 *
 * Returns a human readable message on the first violation, or `null` when the
 * input satisfies every constraint.
 */
export function checkConstraints(input: unknown, constraints: DatasetConstraints): string | null {
  for (const [pattern, spec] of Object.entries(constraints)) {
    const hits = resolve(input, parseConstraintPath(pattern));
    if (hits.length === 0) {
      // `xs[*]` over an empty collection is vacuously satisfied, the same way
      // `xs.every(predicate)` is. Only a genuinely missing path is an error.
      if (pattern.includes('[*]') && isEmptyWildcardTarget(input, pattern)) continue;
      return `constraint '${pattern}' did not resolve to any value`;
    }

    for (const { value, path } of hits) {
      const label = path || pattern;

      if (spec.int && (typeof value !== 'number' || !Number.isInteger(value))) {
        return `${label} must be an integer, got ${describe(value)}`;
      }

      if (spec.oneOf && !spec.oneOf.includes(value as string | number)) {
        return `${label} must be one of [${spec.oneOf.join(', ')}], got ${describe(value)}`;
      }

      const hasLengthRule = spec.len !== undefined || spec.minLen !== undefined || spec.maxLen !== undefined;
      if (hasLengthRule) {
        const actual = Array.isArray(value) || typeof value === 'string' ? value.length : undefined;
        if (actual === undefined) {
          return `${label} must be an array or string to have a length, got ${describe(value)}`;
        }

        for (const [rule, bound] of [
          ['len', spec.len],
          ['minLen', spec.minLen],
          ['maxLen', spec.maxLen],
        ] as const) {
          if (bound === undefined) continue;
          const wanted = typeof bound === 'number' ? bound : resolveScalar(input, bound);
          if (typeof wanted !== 'number') {
            return `constraint '${pattern}' references unknown field '${String(bound)}'`;
          }
          if (rule === 'len' && actual !== wanted) return `${label} length must be ${wanted}, got ${actual}`;
          if (rule === 'minLen' && actual < wanted) return `${label} length ${actual} is below minimum ${wanted}`;
          if (rule === 'maxLen' && actual > wanted) return `${label} length ${actual} exceeds maximum ${wanted}`;
        }
        continue;
      }

      if (typeof value !== 'number') {
        if (spec.min !== undefined || spec.max !== undefined || spec.ref !== undefined) {
          return `${label} must be a number, got ${describe(value)}`;
        }
        continue;
      }

      let upper = spec.max;
      let upperLabel = spec.max === undefined ? undefined : String(spec.max);
      if (spec.ref !== undefined) {
        const referenced = resolveScalar(input, spec.ref);
        if (typeof referenced !== 'number') {
          return `constraint '${pattern}' references unknown field '${spec.ref}'`;
        }
        if (upper === undefined || referenced < upper) {
          upper = referenced;
          upperLabel = `${spec.ref}=${referenced}`;
        }
      }

      if (spec.min !== undefined && value < spec.min) {
        return `${label} = ${value} is below minimum ${spec.min}`;
      }
      if (upper !== undefined && value > upper) {
        return `${label} = ${value} exceeds maximum ${upperLabel}`;
      }

      if (typeof spec.eq === 'number' && value !== spec.eq) {
        return `${label} must equal ${spec.eq}, got ${value}`;
      }
      if (typeof spec.eq === 'string') {
        const wanted = resolveScalar(input, spec.eq);
        if (typeof wanted !== 'number') {
          return `constraint '${pattern}' references unknown field '${spec.eq}'`;
        }
        if (value !== wanted) {
          return `${label} must equal ${spec.eq}=${wanted}, got ${value}`;
        }
      }
    }
  }

  return null;
}

/**
 * True when `pattern` contains `[*]` and the collection it expands over exists
 * but is empty. Used to keep `xs[*]` vacuously true for empty arrays.
 */
function isEmptyWildcardTarget(input: unknown, pattern: string): boolean {
  const wildcardIndex = pattern.indexOf('[*]');
  const parentPattern = pattern.slice(0, wildcardIndex);
  if (!parentPattern) return false;

  const parentHits = resolve(input, parseConstraintPath(parentPattern));
  if (parentHits.length !== 1) return false;

  const value = parentHits[0]?.value;
  return Array.isArray(value) && value.length === 0;
}
