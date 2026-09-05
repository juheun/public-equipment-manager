import { Header } from "@/components/shared/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { UserEmailProvider } from "@/components/auth/user-email-provider";
import { PinsProvider } from "@/components/shared/pins-provider";
import { TeamFilterScope } from "@/components/shared/team-filter-scope";
import { DashboardFilterScope } from "@/components/dashboard/dashboard-filter-scope";
import { getUserPins } from "@/app/actions/pins";
import { createClient } from "@/lib/supabase/server";
import type { TeamRow, UserProfileRow } from "@/lib/supabase/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    userPins,
  ] = await Promise.all([supabase.auth.getUser(), getUserPins()]);

  // 팀 선택기(TeamSelector)/필터(TeamFilterScope)에 필요한 데이터. profilePromise는
  // 로그인 세션이 없을 때(이론상 미들웨어가 이미 /login으로 보냈어야 하는 상태)
  // user_id 없이 쿼리를 쏘지 않도록 조건부로만 만든다.
  const profilePromise = user
    ? supabase.from("user_profiles").select("*").eq("user_id", user.id).returns<UserProfileRow[]>()
    : null;
  const [profileResult, teamsResult] = await Promise.all([
    profilePromise ?? Promise.resolve(null),
    supabase.from("teams").select("*").order("name").returns<TeamRow[]>(),
  ]);

  const profile = profileResult?.data?.[0] ?? null;
  const teams = teamsResult.data ?? [];
  const ownTeam = profile?.team_id ? (teams.find((t) => t.id === profile.team_id) ?? null) : null;

  return (
    <UserEmailProvider email={user?.email ?? "unknown"}>
      <TeamFilterScope
        role={profile?.role ?? null}
        ownTeamId={profile?.team_id ?? null}
        ownTeamName={ownTeam?.name ?? null}
        teams={teams}
      >
        <div className="flex min-h-full flex-col">
          <Header userEmail={user?.email} />
          {/* 모바일은 하단 탭 바(fixed)가 콘텐츠를 가리므로 그 높이만큼 하단 여백을 준다. */}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-16 md:pb-6">
            <PinsProvider initialSites={userPins.sites} initialEquipments={userPins.equipments}>
              {/* 대시보드 페이지(page.tsx)가 아니라 여기(레이아웃)에서 감싸야 한다 — 레이아웃은
                  라우트 이동 중에도 리마운트되지 않지만, 페이지는 대시보드를 벗어나는 순간
                  통째로 사라졌다가 돌아올 때 새로 마운트된다. 필터 모드를 page.tsx 안에 두면
                  다른 화면에 갔다 돌아올 때마다 "전체 보기"로 리셋되는 버그가 생긴다. */}
              <DashboardFilterScope>{children}</DashboardFilterScope>
            </PinsProvider>
          </main>
          <MobileBottomNav />
        </div>
      </TeamFilterScope>
    </UserEmailProvider>
  );
}
