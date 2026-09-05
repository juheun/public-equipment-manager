"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav-items";

export function GnbNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden h-full items-center gap-4 text-sm text-muted-foreground md:flex">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-full items-center border-b-2 border-transparent transition-colors hover:text-foreground",
              isActive && "border-primary font-bold text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
