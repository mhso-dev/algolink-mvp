"use client";

// SPEC-RECEIPT-001 §M6 — 영수증 PDF 다운로드 링크 (signed URL).
// REQ-RECEIPT-INSTRUCTOR-006, REQ-RECEIPT-OPERATOR-006, REQ-RECEIPT-RLS-005.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { getReceiptSignedUrl } from "@/app/(app)/_actions/receipt-signed-url";

interface Props {
  storagePath: string;
  receiptNumber: string;
}

export function ReceiptPreviewLink({ storagePath, receiptNumber }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await getReceiptSignedUrl(storagePath);
      if (!result.ok || !result.url) {
        setError(result.message ?? "다운로드 링크 생성에 실패했습니다.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        onClick={handleDownload}
        disabled={pending}
      >
        <FileText className="h-4 w-4" />
        영수증 다운로드 ({receiptNumber})
        {pending ? null : <Download className="h-4 w-4" />}
      </Button>
      {error ? (
        <p
          role="alert"
          className="text-sm text-[var(--color-danger)] font-medium"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
