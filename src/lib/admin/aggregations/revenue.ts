// SPEC-ADMIN-001 EARS C-9 — 매출 집계 진입점.
// projects.business_amount_krw SUM (deleted_at IS NULL).
export { sumRevenue } from "./queries";
