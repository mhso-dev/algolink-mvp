// SPEC-NOTIFY-001 §M2 — 테스트 공통 Supabase 모킹 헬퍼.

export const UUID_RECIPIENT = "11111111-1111-4111-8111-111111111111";
export const UUID_OTHER = "22222222-2222-4222-8222-222222222222";
export const UUID_NOTIF = "33333333-3333-4333-8333-333333333333";
export const UUID_PROJECT = "44444444-4444-4444-8444-444444444444";
export const UUID_INSTRUCTOR = "55555555-5555-4555-8555-555555555555";
export const UUID_SETTLEMENT = "66666666-6666-4666-8666-666666666666";

export interface NotifInsert {
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
}

export interface NotifRow extends NotifInsert {
  id: string;
  read_at: string | null;
  created_at: string;
}

export interface MockOpts {
  /** 기존 notifications row 시드. */
  rows?: NotifRow[];
  /** insert 응답 강제: error 객체 반환. */
  insertError?: { code?: string; message: string } | null;
  /** 쿼리 응답 강제: error 반환. */
  queryError?: { message: string } | null;
}

/** chainable Supabase fluent 인터페이스 모킹. */
export function buildSupaMock(opts: MockOpts = {}) {
  const rows: NotifRow[] = [...(opts.rows ?? [])];
  const insertCalls: NotifInsert[] = [];
  const updates: { id?: string; userId?: string; payload: Record<string, unknown> }[] = [];

  const builder = (table: string) => {
    if (table !== "notifications") {
      throw new Error(`unexpected table: ${table}`);
    }

    const filters: {
      recipient_id?: string;
      type?: string;
      link_url?: string;
      since?: string;
      types?: string[];
      readNull?: boolean;
      readNotNull?: boolean;
      id?: string;
      onlyUnread?: boolean;
    } = {};

    let orderDesc = false;
    let rangeFrom = 0;
    let rangeTo = Number.MAX_SAFE_INTEGER;
    let limitN: number | undefined;

    function applyFilters(arr: NotifRow[]): NotifRow[] {
      let result = arr;
      if (filters.recipient_id) result = result.filter((r) => r.recipient_id === filters.recipient_id);
      if (filters.type) result = result.filter((r) => r.type === filters.type);
      if (filters.link_url) result = result.filter((r) => r.link_url === filters.link_url);
      if (filters.since) result = result.filter((r) => r.created_at >= filters.since!);
      if (filters.types) result = result.filter((r) => filters.types!.includes(r.type));
      if (filters.readNull) result = result.filter((r) => r.read_at === null);
      if (filters.readNotNull) result = result.filter((r) => r.read_at !== null);
      if (filters.id) result = result.filter((r) => r.id === filters.id);
      return result;
    }

    function ordered(arr: NotifRow[]): NotifRow[] {
      if (!orderDesc) return arr;
      return [...arr].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }

    const chain: Record<string, unknown> = {};

    chain.select = (
      _cols?: string,
      countOpts?: { count?: "exact"; head?: boolean },
    ) => {
      const wantsCount = countOpts?.count === "exact";
      const headOnly = countOpts?.head === true;

      const proxy: Record<string, unknown> = {};
      proxy.eq = (col: string, val: string) => {
        if (col === "recipient_id") filters.recipient_id = val;
        else if (col === "type") filters.type = val;
        else if (col === "link_url") filters.link_url = val;
        else if (col === "id") filters.id = val;
        return proxy;
      };
      proxy.in = (col: string, vals: string[]) => {
        if (col === "type") filters.types = vals;
        return proxy;
      };
      proxy.gte = (col: string, val: string) => {
        if (col === "created_at") filters.since = val;
        return proxy;
      };
      proxy.is = (col: string, val: null) => {
        if (col === "read_at" && val === null) filters.readNull = true;
        return proxy;
      };
      proxy.not = (col: string, _op: string, val: null) => {
        if (col === "read_at" && val === null) filters.readNotNull = true;
        return proxy;
      };
      proxy.order = (_col: string, o: { ascending: boolean }) => {
        orderDesc = !o.ascending;
        return proxy;
      };
      proxy.range = (a: number, b: number) => {
        rangeFrom = a;
        rangeTo = b;
        return resolved();
      };
      proxy.limit = (n: number) => {
        limitN = n;
        return resolved();
      };
      proxy.maybeSingle = async () => {
        if (opts.queryError) return { data: null, error: opts.queryError };
        const r = applyFilters(rows)[0] ?? null;
        return { data: r, error: null };
      };
      proxy.single = async () => {
        if (opts.queryError) return { data: null, error: opts.queryError };
        const r = applyFilters(rows)[0] ?? null;
        return { data: r, error: null };
      };
      // thenable for direct await on builder (count + list).
      proxy.then = (onFulfilled: (v: unknown) => unknown) => {
        return Promise.resolve(resolved()).then(onFulfilled);
      };

      function resolved() {
        if (opts.queryError) {
          return { data: null, count: 0, error: opts.queryError };
        }
        const filtered = applyFilters(rows);
        const sorted = ordered(filtered);
        const sliced = limitN !== undefined
          ? sorted.slice(0, limitN)
          : sorted.slice(rangeFrom, rangeTo + 1);
        return {
          data: headOnly ? null : sliced,
          count: wantsCount ? filtered.length : null,
          error: null,
        };
      }

      return proxy;
    };

    chain.insert = (payload: NotifInsert) => {
      insertCalls.push(payload);
      return {
        select: (_cols: string) => ({
          single: async () => {
            if (opts.insertError) {
              return { data: null, error: opts.insertError };
            }
            const row: NotifRow = {
              id: UUID_NOTIF,
              read_at: null,
              created_at: new Date().toISOString(),
              ...payload,
              body: payload.body ?? null,
              link_url: payload.link_url ?? null,
            };
            rows.push(row);
            return { data: { id: row.id }, error: null };
          },
        }),
      };
    };

    chain.update = (payload: Record<string, unknown>) => {
      const upFilters: { id?: string; userId?: string; readNull?: boolean } = {};
      const upd: Record<string, unknown> = {};
      upd.eq = (col: string, val: string) => {
        if (col === "id") upFilters.id = val;
        else if (col === "recipient_id") upFilters.userId = val;
        return upd;
      };
      upd.is = (col: string, val: null) => {
        if (col === "read_at" && val === null) upFilters.readNull = true;
        return upd;
      };
      upd.select = (_cols: string) => ({
        async then(onFulfilled: (v: unknown) => unknown) {
          const matched = rows.filter((r) => {
            if (upFilters.id && r.id !== upFilters.id) return false;
            if (upFilters.userId && r.recipient_id !== upFilters.userId) return false;
            if (upFilters.readNull && r.read_at !== null) return false;
            return true;
          });
          for (const r of matched) {
            Object.assign(r, payload);
          }
          updates.push({ id: upFilters.id, userId: upFilters.userId, payload });
          return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(onFulfilled);
        },
      });
      // direct await without .select() — used by markAsRead.
      upd.then = (onFulfilled: (v: unknown) => unknown) => {
        const matched = rows.filter((r) => {
          if (upFilters.id && r.id !== upFilters.id) return false;
          if (upFilters.userId && r.recipient_id !== upFilters.userId) return false;
          if (upFilters.readNull && r.read_at !== null) return false;
          return true;
        });
        for (const r of matched) {
          Object.assign(r, payload);
        }
        updates.push({ id: upFilters.id, userId: upFilters.userId, payload });
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      };
      return upd;
    };

    return chain;
  };

  return {
    from: builder,
    /** 테스트 검증용 — emit 시 INSERT 호출된 payload 목록. */
    _insertCalls: insertCalls,
    _updates: updates,
    _rows: rows,
  };
}

export function captureLogs(): { restore: () => void; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((a) => String(a)).join(" "));
  };
  return {
    lines,
    errors,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}
