// SPEC-PROPOSAL-001 §M5 REQ-PROPOSAL-DETAIL-006 — 응답 보드 4 컬럼.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  INQUIRY_STATUS_LABELS,
} from "@/lib/proposals/labels";
import type { InquiryStatus } from "@/lib/proposals/types";
import type { InquiryBoardEntry } from "@/lib/proposals/queries";
import { format } from "date-fns";

interface Props {
  entries: InquiryBoardEntry[];
}

export function InquiryResponseBoard({ entries }: Props) {
  const groups: Record<InquiryStatus, InquiryBoardEntry[]> = {
    pending: [],
    accepted: [],
    declined: [],
    conditional: [],
  };
  for (const e of entries) {
    groups[e.status].push(e);
  }

  const COLUMN_ORDER: InquiryStatus[] = [
    "pending",
    "accepted",
    "declined",
    "conditional",
  ];

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>응답 보드</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            아직 발송된 사전 문의가 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>응답 보드</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLUMN_ORDER.map((s) => (
            <div key={s} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm">
                  {INQUIRY_STATUS_LABELS[s]}
                </h4>
                <Badge variant="outline">{groups[s].length}</Badge>
              </div>
              <div className="space-y-2">
                {groups[s].map((e) => (
                  <div
                    key={e.id}
                    className="border rounded-md p-2 text-sm space-y-1"
                  >
                    <div className="font-medium">
                      {e.instructor_name ?? "(이름 없음)"}
                    </div>
                    {e.responded_at && (
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(e.responded_at), "yyyy-MM-dd HH:mm")}
                      </div>
                    )}
                    {e.conditional_note && (
                      <p className="text-xs italic">
                        {e.conditional_note.length > 60
                          ? `${e.conditional_note.slice(0, 60)}...`
                          : e.conditional_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
