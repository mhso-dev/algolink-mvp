"use client";

// SPEC-NOTIFY-001 §M5 REQ-NOTIFY-LIST-006 — 모두 읽음 버튼.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "@/app/(app)/notifications/actions";
import { toast } from "sonner";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const onClick = () => {
    startTransition(async () => {
      const r = await markAllReadAction();
      if (r.ok) toast.success(`${r.count}건 일괄 읽음 처리됨`);
    });
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled || pending}
    >
      모두 읽음
    </Button>
  );
}
