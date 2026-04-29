"use client";

// SPEC-PROPOSAL-001 §M3 REQ-PROPOSAL-LIST-002 — 검색·필터 컨트롤.
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROPOSAL_STATUS_LABELS,
} from "@/lib/proposals/labels";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/proposals/types";
import type { ProposalListQuery } from "@/lib/proposals/list-query";

interface Props {
  query: ProposalListQuery;
  clients: Array<{ id: string; company_name: string }>;
}

export function ProposalFiltersBar({ query, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [qDraft, setQDraft] = React.useState(query.q ?? "");

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value.length > 0) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSubmitQ = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam("q", qDraft.trim() || null);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form onSubmit={onSubmitQ} className="flex gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="제목 검색"
            className="pl-9 w-64"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">검색</Button>
      </form>

      <Select
        value={query.statuses[0] ?? "all"}
        onValueChange={(v) =>
          updateParam("status", v === "all" ? null : v)
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="전체 상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 상태</SelectItem>
          {PROPOSAL_STATUSES.map((s: ProposalStatus) => (
            <SelectItem key={s} value={s}>
              {PROPOSAL_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={query.clientId ?? "all"}
        onValueChange={(v) =>
          updateParam("client_id", v === "all" ? null : v)
        }
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="전체 고객사" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 고객사</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.company_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(query.q || query.statuses.length > 0 || query.clientId) && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(pathname)}
        >
          초기화
        </Button>
      )}
    </div>
  );
}
