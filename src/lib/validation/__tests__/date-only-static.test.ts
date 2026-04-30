// Date-only regression guards for non-lecture forms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEARCH_ROOTS = ["src/app", "src/components"];

const ALLOWED_DATETIME_LOCAL = new Set<string>([
  // Lecture/session creation keeps time-of-day semantics.
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test("non-lecture UI does not render datetime-local/time inputs", () => {
  const offenders: string[] = [];
  for (const root of SEARCH_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const rel = relative(ROOT, file);
      const source = readFileSync(file, "utf8");
      if (ALLOWED_DATETIME_LOCAL.has(rel)) continue;
      if (
        source.includes('type="datetime-local"') ||
        source.includes("type='datetime-local'") ||
        source.includes('type="time"') ||
        source.includes("type='time'")
      ) {
        offenders.push(rel);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Non-lecture date fields must use date/date-range controls only. Offenders: ${offenders.join(", ")}`,
  );
});
