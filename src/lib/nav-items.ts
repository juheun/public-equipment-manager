import { LayoutDashboard, Settings, Wrench, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// 데스크톱 GNB와 모바일 하단 탭 바가 공유하는 메뉴 구성. 아이콘은 모바일 탭 바에서만
// 쓰이지만, href/label이 두 곳에서 어긋나지 않도록 한 곳에서 관리한다.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/equipments", label: "발전기 관리", icon: Wrench },
  { href: "/settings", label: "설정", icon: Settings },
];
