"use client";

// SPEC-PROPOSAL-001 §M5 REQ-PROPOSAL-INQUIRY-003/006 — 사전 문의 디스패치 모달 trigger.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dispatchInquiriesAction } from "@/app/(app)/(operator)/proposals/[id]/inquiries/dispatch/actions";

interface Instructor {
  id: string;
  name_kr: string | null;
}

interface Props {
  proposalId: string;
  proposalTitle: string;
  instructors: Instructor[];
}

export function InquiryDispatchTrigger({
  proposalId,
  proposalTitle,
  instructors,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (selected.size === 0) {
      setError("한 명 이상의 강사를 선택해주세요.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await dispatchInquiriesAction({
      proposalId,
      instructorIds: Array.from(selected),
      proposedTimeSlotStart: start || null,
      proposedTimeSlotEnd: end || null,
      questionNote: note || null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    setSelected(new Set());
    setStart("");
    setEnd("");
    setNote("");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">사전 강사 문의</CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>강사 사전 문의</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>사전 문의 — {proposalTitle}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>강사 선택 ({selected.size}명)</Label>
                <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1 mt-2">
                  {instructors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">강사가 없습니다.</p>
                  ) : (
                    instructors.map((i) => (
                      <label
                        key={i.id}
                        className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(i.id)}
                          onChange={() => toggle(i.id)}
                        />
                        <span className="text-sm">
                          {i.name_kr ?? "(이름 없음)"}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="start">시작일</Label>
                  <Input
                    id="start"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end">종료일</Label>
                  <Input
                    id="end"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="note">질문 (선택)</Label>
                <Textarea
                  id="note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="해당 날짜 범위에 강의가 가능하신가요?"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button onClick={onSubmit} disabled={pending}>
                {pending ? "발송 중..." : `${selected.size}명에게 보내기`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
