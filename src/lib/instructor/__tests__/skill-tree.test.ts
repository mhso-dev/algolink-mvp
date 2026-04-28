// SPEC-ME-001 §2.4 REQ-ME-SKILL-001/004/005 — 트리 빌더 / 검색 / leaf 추출.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillTree,
  filterSkillTree,
  indexSelections,
  collectSmallSkillIds,
  type SkillCategoryRow,
} from "../skill-tree";

const ROWS: SkillCategoryRow[] = [
  { id: "L1", tier: "large", name: "백엔드", parentId: null, sortOrder: 2 },
  { id: "L2", tier: "large", name: "프론트엔드", parentId: null, sortOrder: 1 },
  { id: "M1", tier: "medium", name: "Node.js", parentId: "L1", sortOrder: 2 },
  { id: "M2", tier: "medium", name: "Java/Spring", parentId: "L1", sortOrder: 1 },
  { id: "M3", tier: "medium", name: "React", parentId: "L2", sortOrder: 1 },
  { id: "S1", tier: "small", name: "Spring Boot", parentId: "M2", sortOrder: 1 },
  { id: "S2", tier: "small", name: "Spring Data JPA", parentId: "M2", sortOrder: 2 },
  { id: "S3", tier: "small", name: "Express", parentId: "M1", sortOrder: 1 },
  { id: "S4", tier: "small", name: "React Hooks", parentId: "M3", sortOrder: 1 },
];

test("buildSkillTree: large→medium→small 그룹핑 + sortOrder 정렬", () => {
  const tree = buildSkillTree(ROWS);
  assert.equal(tree.length, 2);
  assert.equal(tree[0]!.name, "프론트엔드"); // sortOrder 1 먼저
  assert.equal(tree[1]!.name, "백엔드");
  assert.equal(tree[1]!.mediums.length, 2);
  assert.equal(tree[1]!.mediums[0]!.name, "Java/Spring"); // sortOrder 1
  assert.equal(tree[1]!.mediums[1]!.name, "Node.js");
  assert.deepEqual(
    tree[1]!.mediums[0]!.smalls.map((s) => s.name),
    ["Spring Boot", "Spring Data JPA"],
  );
});

test("buildSkillTree: parent 매칭 실패 행은 무시 (orphan)", () => {
  const orphan: SkillCategoryRow = {
    id: "ZZ",
    tier: "small",
    name: "Orphan",
    parentId: "MISSING",
    sortOrder: 1,
  };
  const tree = buildSkillTree([...ROWS, orphan]);
  const allSmalls = tree.flatMap((l) => l.mediums.flatMap((m) => m.smalls));
  assert.ok(!allSmalls.some((s) => s.name === "Orphan"));
});

test("buildSkillTree: 빈 입력 → 빈 배열", () => {
  assert.deepEqual(buildSkillTree([]), []);
});

test("filterSkillTree: small name 부분 일치 (대소문자 무시)", () => {
  const tree = buildSkillTree(ROWS);
  const filtered = filterSkillTree(tree, "spring");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]!.name, "백엔드");
  assert.equal(filtered[0]!.mediums.length, 1);
  assert.equal(filtered[0]!.mediums[0]!.name, "Java/Spring");
  assert.equal(filtered[0]!.mediums[0]!.smalls.length, 2);
});

test("filterSkillTree: 매치 없으면 빈 배열", () => {
  const tree = buildSkillTree(ROWS);
  assert.deepEqual(filterSkillTree(tree, "Kotlin"), []);
});

test("filterSkillTree: 빈 검색어 → 원본 그대로", () => {
  const tree = buildSkillTree(ROWS);
  assert.deepEqual(filterSkillTree(tree, "   "), tree);
});

test("indexSelections: skillId → proficiency map 생성", () => {
  const m = indexSelections([
    { skillId: "S1", proficiency: "expert" },
    { skillId: "S2", proficiency: "advanced" },
  ]);
  assert.equal(m.get("S1"), "expert");
  assert.equal(m.get("S2"), "advanced");
  assert.equal(m.size, 2);
});

test("collectSmallSkillIds: small leaf만 추출", () => {
  const tree = buildSkillTree(ROWS);
  const ids = collectSmallSkillIds(tree);
  assert.equal(ids.size, 4);
  assert.ok(ids.has("S1"));
  assert.ok(ids.has("S4"));
  assert.ok(!ids.has("M1"));
  assert.ok(!ids.has("L1"));
});
