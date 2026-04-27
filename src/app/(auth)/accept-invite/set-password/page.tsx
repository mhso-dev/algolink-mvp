// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-004.
// 초대 수락 후 비밀번호 설정 페이지. verifyOtp로 만들어진 임시 세션이 필수.

import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata = {
  title: "비밀번호 설정",
};

export default async function AcceptInviteSetPasswordPage() {
  // 임시 세션 검증 — verifyOtp 직후 발급된 access token이 있어야 한다.
  // getCurrentUser는 role claim을 요구하므로 여기선 사용하지 않는다.
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return (
      <div className="flex flex-col gap-4 text-center" role="alert">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">
          초대 세션이 유효하지 않습니다
        </h1>
        <p className="text-sm text-[var(--color-text-subtle)]">
          초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을
          요청하세요.
        </p>
        <Link
          href="/login"
          className="text-sm text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
        >
          로그인 페이지로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">
          비밀번호를 설정해주세요
        </h1>
        <p className="text-sm text-[var(--color-text-subtle)]">
          {data.user.email} 계정의 새 비밀번호를 입력해주세요.
        </p>
      </div>
      <SetPasswordForm />
    </div>
  );
}
