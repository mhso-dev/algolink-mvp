"use client";

// SPEC-CLIENT-001 §2.5 — 고객사 soft-delete 버튼 (확인 다이얼로그 포함).

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteClientAction } from "../[id]/edit/actions";

export function DeleteClientButton({ clientId }: { clientId: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    startTransition(async () => {
      try {
        await deleteClientAction(clientId);
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (!msg.startsWith("NEXT_REDIRECT")) {
          // soft-delete는 멱등 — 사용자에게는 close만
          console.error("[deleteClient] failed", err);
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4" /> 삭제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>고객사 삭제 확인</DialogTitle>
          <DialogDescription>
            이 고객사를 삭제하면 리스트에서 더 이상 표시되지 않습니다. 연관된
            프로젝트는 그대로 유지됩니다. 계속하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              취소
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
