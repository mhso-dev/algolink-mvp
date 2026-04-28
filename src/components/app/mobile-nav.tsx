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

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
      <SheetContent side="left" className="w-72 p-0 pb-safe">
        <Sidebar sections={sections} forceVisible />
      </SheetContent>
    </Sheet>
  );
}
