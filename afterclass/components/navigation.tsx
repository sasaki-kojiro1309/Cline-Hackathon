"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [["/", "Daily Check-in"], ["/discoveries", "My Discoveries"], ["/next-steps", "Your Next Steps"]];
export function Navigation() {
  const pathname = usePathname();
  return <header><div className="shell header-inner">
    <Link className="brand" href="/">AfterClass<span aria-hidden="true">.</span></Link>
    <nav aria-label="Main navigation">{links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>
  </div></header>;
}