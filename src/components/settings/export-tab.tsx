import { Download, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const CSV_EXPORTS = [
  {
    href: "/api/export/equipments",
    label: "장비 마스터 목록 CSV",
    description: "관리번호, 장비명, 카테고리, 상태, 위치, 누적 아워미터",
  },
  {
    href: "/api/export/rentals",
    label: "대여 / 출고 이력 CSV",
    description: "전표번호, 투입현장, 발주업체, 대여기간, 상태, 투입장비",
  },
  {
    href: "/api/export/maintenance",
    label: "정비 / 점검 이력 CSV",
    description: "장비명, 점검일자, 정비내용, 정비시점 아워미터",
  },
];

export function ExportTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">데이터 백업 / CSV 내보내기</CardTitle>
          <CardDescription>시스템 장애 대비 및 오프라인 보관용으로 현재 데이터를 다운로드합니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CSV_EXPORTS.map((item) => (
            <div key={item.href} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" nativeButton={false} render={<a href={item.href} />}>
                <Download className="h-3.5 w-3.5" /> 다운로드
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">전체 데이터 일괄 백업</CardTitle>
          <CardDescription>모든 테이블 데이터를 하나의 JSON 파일로 내려받습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<a href="/api/export/full-backup" />}>
            <FileArchive className="h-4 w-4" /> 전체 데이터 일괄 백업 (JSON)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
