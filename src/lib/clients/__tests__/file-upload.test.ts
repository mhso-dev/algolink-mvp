// SPEC-CLIENT-001 §2.7 — 파일 업로드 어댑터 단위 테스트 (Supabase mock).
import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadBusinessLicense } from "../file-upload";

const OWNER = "00000000-0000-4000-8000-000000000001";

interface UploadCall {
  path: string;
  options?: { contentType?: string; upsert?: boolean };
}

interface InsertCall {
  table: string;
  payload: unknown;
}

function makeMock(opts: {
  uploadShouldFail?: boolean;
  insertShouldFail?: boolean;
} = {}) {
  const uploadCalls: UploadCall[] = [];
  const insertCalls: InsertCall[] = [];
  const removeCalls: string[][] = [];

  const sb = {
    from: (table: string) => ({
      insert: (payload: unknown) => ({
        select: () => ({
          single: async () => {
            insertCalls.push({ table, payload });
            if (opts.insertShouldFail) {
              return { data: null, error: new Error("insert failed") };
            }
            return {
              data: { id: "files-id-generated" },
              error: null,
            };
          },
        }),
      }),
    }),
    storage: {
      from: (_bucket: string) => ({
        upload: async (path: string, _file: unknown, options: { contentType?: string; upsert?: boolean }) => {
          uploadCalls.push({ path, options });
          if (opts.uploadShouldFail) {
            return { error: new Error("storage failed") };
          }
          return { error: null };
        },
        remove: async (paths: string[]) => {
          removeCalls.push(paths);
          return { error: null };
        },
      }),
    },
  };
  return { sb, uploadCalls, insertCalls, removeCalls };
}

test("uploadBusinessLicense: text/csv mime → Storage 호출 없이 throw", async () => {
  const { sb, uploadCalls } = makeMock();
  await assert.rejects(
    () =>
      uploadBusinessLicense(sb, {
        file: new ArrayBuffer(1024),
        mimeType: "text/csv",
        sizeBytes: 1024,
        fileName: "x.csv",
        ownerId: OWNER,
      }),
    /FILE_MIME_INVALID/,
  );
  assert.equal(uploadCalls.length, 0);
});

test("uploadBusinessLicense: 6MB → Storage 호출 없이 throw", async () => {
  const { sb, uploadCalls } = makeMock();
  await assert.rejects(
    () =>
      uploadBusinessLicense(sb, {
        file: new ArrayBuffer(1024),
        mimeType: "application/pdf",
        sizeBytes: 6 * 1024 * 1024,
        fileName: "big.pdf",
        ownerId: OWNER,
      }),
    /FILE_TOO_LARGE/,
  );
  assert.equal(uploadCalls.length, 0);
});

test("uploadBusinessLicense: 정상 PDF → storagePath 포함 결과 반환", async () => {
  const { sb, uploadCalls, insertCalls } = makeMock();
  const result = await uploadBusinessLicense(sb, {
    file: new ArrayBuffer(2 * 1024 * 1024),
    mimeType: "application/pdf",
    sizeBytes: 2 * 1024 * 1024,
    fileName: "license.pdf",
    clientId: "c1",
    ownerId: OWNER,
  });
  assert.equal(uploadCalls.length, 1);
  assert.match(uploadCalls[0].path, /^c1\/.+\.pdf$/);
  assert.equal(uploadCalls[0].options?.contentType, "application/pdf");
  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].table, "files");
  assert.equal(result.fileId, "files-id-generated");
  assert.match(result.storagePath, /^c1\/.+\.pdf$/);
});

test("uploadBusinessLicense: clientId 없으면 _tmp 경로", async () => {
  const { sb, uploadCalls } = makeMock();
  await uploadBusinessLicense(sb, {
    file: new ArrayBuffer(1024),
    mimeType: "image/png",
    sizeBytes: 1024,
    fileName: "logo.png",
    ownerId: OWNER,
  });
  assert.match(uploadCalls[0].path, /^_tmp\/.+\.png$/);
});

test("uploadBusinessLicense: Storage upload 실패 → throw, files INSERT 미발생", async () => {
  const { sb, insertCalls } = makeMock({ uploadShouldFail: true });
  await assert.rejects(
    () =>
      uploadBusinessLicense(sb, {
        file: new ArrayBuffer(1024),
        mimeType: "application/pdf",
        sizeBytes: 1024,
        fileName: "x.pdf",
        ownerId: OWNER,
      }),
    /FILE_UPLOAD_FAILED/,
  );
  assert.equal(insertCalls.length, 0);
});

test("uploadBusinessLicense: files INSERT 실패 → Storage 객체 보상 삭제 + throw", async () => {
  const { sb, removeCalls } = makeMock({ insertShouldFail: true });
  await assert.rejects(
    () =>
      uploadBusinessLicense(sb, {
        file: new ArrayBuffer(1024),
        mimeType: "application/pdf",
        sizeBytes: 1024,
        fileName: "x.pdf",
        ownerId: OWNER,
      }),
    /FILE_UPLOAD_FAILED/,
  );
  assert.equal(removeCalls.length, 1);
  assert.match(removeCalls[0][0], /^_tmp\/.+\.pdf$/);
});
