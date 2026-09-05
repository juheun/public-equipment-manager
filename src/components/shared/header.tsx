import Link from "next/link";
import { GnbNav } from "@/components/layout/gnb-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { TextSizeToggle } from "@/components/shared/text-size-toggle";
import { TeamSelector } from "@/components/shared/team-selector";

interface HeaderProps {
  userEmail?: string | null;
}

export function Header({ userEmail }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <Link href="/" className="flex shrink-0 flex-col">
          <span className="text-sm leading-tight font-bold tracking-tight text-slate-900 sm:text-base dark:text-slate-50">
            장비 재고 관리 시스템
          </span>
        </Link>
        <div className="mx-4 hidden h-7 w-[1px] bg-slate-200 sm:mx-5 md:block dark:bg-slate-700" />
        <GnbNav />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <TeamSelector />
          {userEmail && <span className="hidden text-sm text-muted-foreground md:inline">{userEmail}</span>}
          <div className="flex items-center gap-0.5">
            <TextSizeToggle />
            <ThemeToggle />
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
