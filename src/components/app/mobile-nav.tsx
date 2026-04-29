"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import type { NavSection } from "@/lib/nav";

interface MobileNavProps {
  sections: NavSection[];
}

/**
 * SPEC-MOBILE-001 §M2: 모바일·태블릿(< lg) viewport에서 햄버거 버튼으로
 * Sheet left drawer를 열어 기존 Sidebar를 재사용한다. lg 이상에서는
 * `lg:hidden`으로 트리거 자체가 미렌더되어 데스크탑 Sidebar와 충돌하지 않는다.
 *
 * - 라우팅 변경 시 자동 close (`usePathname` 변경 감지)
 * - SheetTrigger: 44x44px 터치 타겟 보장 (`min-h-touch min-w-touch`)
 * - SheetContent: w-72(288px), `pb-safe`로 하단 safe-area 보장
 */
export function MobileNav({ sections }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  // React 19 공식 권장 패턴 (Adjusting state when a prop changes):
  // pathname 스냅샷을 state로 보관하고, 변화 시 두 setState를 동시 호출.
  // useEffect+setState가 cascading render를 만드는 반면 render 중 비교는 1-render에 수렴.
  // ref 변경(react-hooks/refs)도 회피.
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden min-h-touch min-w-touch"
          aria-label="주 내비게이션 열기"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      {/* SPEC-MOBILE-001 §M2 follow-up: drawer 폭/높이/safe-area + dark bg 정합 */}
      <SheetContent
        side="left"
        className="flex w-[85vw] max-w-[320px] flex-col bg-[var(--color-secondary)] p-0 pt-safe pb-safe text-[var(--color-secondary-foreground)]"
      >
        <Sidebar sections={sections} forceVisible />
      </SheetContent>
    </Sheet>
  );
}
