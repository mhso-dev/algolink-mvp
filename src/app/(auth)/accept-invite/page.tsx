// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-003 / REQ-AUTH-INVITE-005.
// 초대 이메일의 랜딩 페이지. Supabase 초대 메일은 ?token_hash=...&type=invite를 직접 이 경로로 전달한다.
// verifyOtp 성공 시 /accept-invite/set-password로 redirect, 실패 시 한국어 에러 메시지 노출.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { mapAuthError } from "@/auth/errors";

export const metadata = {
  title: "초대 수락",
};

type SearchParams = Promise<{
  token_hash?: string;
  type?: string;
  error?: string;
}>;

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  // /api/auth/callback 등에서 redirect로 전달된 에러 메시지가 있으면 그대로 노출.
  if (params.error) {
    return <ErrorView message={decodeURIComponent(params.error)} />;
  }

  if (!params.token_hash || params.type !== "invite") {
    return (
      <ErrorView message="초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요." />
    );
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.verifyOtp({
    token_hash: params.token_hash,
    type: "invite",
  });

  if (error) {
    return <ErrorView message={mapAuthError(error)} />;
  }

  redirect("/accept-invite/set-password");
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-4 text-center" role="alert">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">
        초대 수락에 실패했습니다
      </h1>
      <p className="text-sm text-[var(--color-text-subtle)]">{message}</p>
      <Link
        href="/login"
        className="text-sm text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
      >
        로그인 페이지로 이동
      </Link>
    </div>
  );
}
