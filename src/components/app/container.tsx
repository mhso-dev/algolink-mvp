import { cn } from "@/lib/utils";
import type { ComponentProps, ElementType } from "react";

const VARIANT_MAX_W = {
  default: "lg:max-w-[1440px]",
  narrow: "lg:max-w-[1200px]",
  wide: "lg:max-w-[1600px]",
} as const;

export type ContainerVariant = keyof typeof VARIANT_MAX_W;

type ContainerProps<T extends ElementType = "div"> = {
  variant?: ContainerVariant;
  as?: T;
} & Omit<ComponentProps<T>, "as">;

/**
 * SPEC-MOBILE-001 §M3 표준 페이지 컨테이너.
 * - 모바일/태블릿(< lg): w-full + px-4 sm:px-6 (max-width 미적용)
 * - 데스크탑(>= lg): variant별 max-width + px-8 + mx-auto 중앙 정렬
 *
 * 페이지 컴포넌트는 max-w-[*] 직접 사용 대신 본 컴포넌트를 import 한다.
 */
// @MX:ANCHOR: [AUTO] Container — 21개 페이지 wrapper 단일 표준
// @MX:REASON: fan_in 21+, 페이지 가로 레이아웃 일관성 보증. variant/padding 정책 변경 시 전체 회귀.
export function Container<T extends ElementType = "div">({
  variant = "default",
  as,
  className,
  ...rest
}: ContainerProps<T>) {
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        VARIANT_MAX_W[variant],
        className,
      )}
      {...rest}
    />
  );
}
