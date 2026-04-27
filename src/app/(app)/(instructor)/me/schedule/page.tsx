import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-[var(--color-primary)]" />
            일정
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            알고링크 강의·개인 일정을 통합 관리하세요. 강의 불가 일정을 등록하면 추천에서 자동 회피됩니다.
          </p>
        </div>
        <Button>
          <Plus /> 일정 추가
        </Button>
      </header>

      <Tabs defaultValue="month">
        <TabsList>
          <TabsTrigger value="month">월</TabsTrigger>
          <TabsTrigger value="week">주</TabsTrigger>
          <TabsTrigger value="day">일</TabsTrigger>
        </TabsList>
        <TabsContent value="month">
          <Card>
            <CardContent className="py-16 text-center">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 text-[var(--color-text-subtle)]" />
              <h3 className="font-semibold mb-1">월 캘린더</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                구글 캘린더와 유사한 월/주/일 뷰. 시스템 강의는 읽기 전용, 개인 일정은 편집 가능합니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="week">
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">주 뷰 (다음 단계)</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="day">
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">일 뷰 (다음 단계)</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
