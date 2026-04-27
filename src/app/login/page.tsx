import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Sparkles, ShieldCheck, Zap } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { extractRole } from "@/lib/role";
import { getDefaultLandingPath } from "@/lib/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(getDefaultLandingPath(extractRole(user)));
  }

  return (
    <main className="min-h-dvh grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* 좌측 — 브랜딩 패널 */}
      <aside className="hidden lg:flex flex-col justify-between bg-[var(--color-secondary)] text-white p-10 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[var(--color-primary)] opacity-10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[var(--color-primary)] opacity-10 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight">Algolink</span>
        </div>

        <div className="relative flex flex-col gap-6 max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            AI가 도와주는
            <br />
            교육 컨설팅 워크플로우
          </h1>
          <p className="text-sm text-white/70 leading-relaxed">
            의뢰부터 정산까지 한 화면에서. 강사 섭외 시간을 30분에서 5분으로,
            행정 부담을 10% 수준으로 줄여드립니다.
          </p>

          <ul className="flex flex-col gap-3 mt-2">
            <Feature
              icon={Zap}
              title="AI 강사 추천"
              description="기술스택·일정·만족도 기반 Top-3 자동 매칭"
            />
            <Feature
              icon={ShieldCheck}
              title="개인정보 안전"
              description="주민번호·계좌는 암호화 저장, 마스킹 다운로드 옵션"
            />
            <Feature
              icon={Sparkles}
              title="이력서 AI 파싱"
              description="PDF 업로드만으로 양식 자동 채움, 핵심 필드 정확도 90%+"
            />
          </ul>
        </div>

        <p className="relative text-xs text-white/40">
          © 2026 Algolink · MVP v0.1.0
        </p>
      </aside>

      {/* 우측 — 로그인 폼 */}
      <section className="flex items-center justify-center p-6 sm:p-10 bg-[var(--color-background)]">
        <div className="w-full max-w-sm flex flex-col gap-8">
          {/* 모바일에서만 보이는 로고 */}
          <div className="lg:hidden flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]">
              <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">Algolink</span>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight">로그인</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
              이메일과 비밀번호를 입력해 주세요.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex flex-col gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          <div className="rounded-md bg-[var(--color-state-info-muted)] border border-[var(--color-state-info)]/30 p-3">
            <p className="text-xs font-medium text-[var(--color-state-info)]">개발용 계정</p>
            <p className="text-xs text-[var(--color-text-muted)] font-tabular mt-0.5">
              admin@algolink.local / DevAdmin!2026
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-white/60 mt-0.5">{description}</p>
      </div>
    </li>
  );
}
