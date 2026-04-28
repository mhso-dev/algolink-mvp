// SPEC-NOTIFY-001 §M3 — 트리거 테스트용 다중 테이블 Supabase mock.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface TableState {
  rows: Row[];
}

export interface TriggerSupaMock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  /** 테이블별 INSERT된 row 캡처. */
  inserts: Record<string, Row[]>;
  tables: Record<string, TableState>;
}

interface FilterState {
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  is: Record<string, null>;
  not_is_null: Set<string>; // col 이름 → not is null
  lt: Record<string, string>;
  gte: Record<string, string>;
}

function newFilters(): FilterState {
  return { eq: {}, in: {}, is: {}, not_is_null: new Set(), lt: {}, gte: {} };
}

function applyFilters(rows: Row[], f: FilterState): Row[] {
  return rows.filter((r) => {
    for (const [k, v] of Object.entries(f.eq)) if (r[k] !== v) return false;
    for (const [k, vs] of Object.entries(f.in)) if (!vs.includes(r[k])) return false;
    for (const k of Object.keys(f.is)) if (r[k] !== null) return false;
    for (const k of f.not_is_null) if (r[k] === null) return false;
    for (const [k, v] of Object.entries(f.lt)) if (!(r[k] && String(r[k]) < v)) return false;
    for (const [k, v] of Object.entries(f.gte)) if (!(r[k] && String(r[k]) >= v)) return false;
    return true;
  });
}

export function buildTriggerSupa(initial: Record<string, Row[]> = {}): TriggerSupaMock {
  const tables: Record<string, TableState> = {};
  const inserts: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(initial)) tables[t] = { rows: [...rows] };

  const ensureTable = (t: string) => {
    if (!tables[t]) tables[t] = { rows: [] };
    if (!inserts[t]) inserts[t] = [];
  };

  const from = (table: string) => {
    ensureTable(table);
    const filters = newFilters();

    const proxy: Record<string, unknown> = {};

    proxy.select = (
      _cols?: string,
      countOpts?: { count?: "exact"; head?: boolean },
    ) => {
      const wantsCount = countOpts?.count === "exact";
      const headOnly = countOpts?.head === true;
      const sub: Record<string, unknown> = {};
      sub.eq = (col: string, val: unknown) => {
        filters.eq[col] = val;
        return sub;
      };
      sub.in = (col: string, vals: unknown[]) => {
        filters.in[col] = vals;
        return sub;
      };
      sub.is = (col: string, val: null) => {
        if (val === null) filters.is[col] = null;
        return sub;
      };
      sub.not = (col: string, _op: string, val: null) => {
        if (val === null) filters.not_is_null.add(col);
        return sub;
      };
      sub.lt = (col: string, val: string) => {
        filters.lt[col] = val;
        return sub;
      };
      sub.gte = (col: string, val: string) => {
        filters.gte[col] = val;
        return sub;
      };
      const resolve = () => {
        const filtered = applyFilters(tables[table].rows, filters);
        return {
          data: headOnly ? null : filtered,
          count: wantsCount ? filtered.length : null,
          error: null,
        };
      };
      sub.maybeSingle = async () => {
        const r = applyFilters(tables[table].rows, filters)[0] ?? null;
        return { data: r, error: null };
      };
      sub.single = async () => {
        const r = applyFilters(tables[table].rows, filters)[0] ?? null;
        return { data: r, error: null };
      };
      sub.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled);
      return sub;
    };

    proxy.insert = (payload: Row) => {
      inserts[table].push(payload);
      const row = { id: `gen-${inserts[table].length}`, created_at: new Date().toISOString(), read_at: null, ...payload };
      tables[table].rows.push(row);
      return {
        select: (_c: string) => ({
          single: async () => ({ data: { id: row.id }, error: null }),
        }),
      };
    };

    return proxy;
  };

  return { from, inserts, tables };
}
