import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateOnlyToKstEndIso,
  dateOnlyToKstNextDayStartIso,
  dateOnlyToKstStartIso,
  normalizeDateOnlyRangeForProject,
  toKstDateOnly,
} from "../date-only";

test("date-only: KST start/end ISO boundaries preserve date-only intent", () => {
  assert.equal(dateOnlyToKstStartIso("2026-05-01"), "2026-04-30T15:00:00.000Z");
  assert.equal(dateOnlyToKstEndIso("2026-05-01"), "2026-05-01T14:59:59.999Z");
  assert.equal(dateOnlyToKstNextDayStartIso("2026-05-01"), "2026-05-01T15:00:00.000Z");
});

test("date-only: timestamp reads normalize back to KST YYYY-MM-DD", () => {
  assert.equal(toKstDateOnly("2026-04-30T15:00:00.000Z"), "2026-05-01");
  assert.equal(toKstDateOnly("2026-05-01T14:59:59.999Z"), "2026-05-01");
});

test("date-only: project range uses inclusive same-day KST end", () => {
  assert.deepEqual(normalizeDateOnlyRangeForProject("2026-05-01", "2026-05-01"), {
    education_start_at: "2026-04-30T15:00:00.000Z",
    education_end_at: "2026-05-01T14:59:59.999Z",
  });
});
