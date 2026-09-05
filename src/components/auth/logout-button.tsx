import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm" aria-label="로그아웃" title="로그아웃">
        <LogOut className="h-4 w-4" />
        <span className="hidden md:inline">로그아웃</span>
      </Button>
    </form>
  );
}
