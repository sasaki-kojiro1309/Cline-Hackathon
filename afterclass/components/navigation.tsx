"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [["/", "Daily Check-in"], ["/discoveries", "My Discoveries"], ["/next-steps", "Your Next Steps"]];
export function Navigation() {
  const pathname = usePathname();
  return <><div className="announcement"><p>SMALL REFLECTIONS. NEW POSSIBILITIES. <span aria-hidden="true">•</span> YOUR NEXT CHAPTER STARTS AFTER CLASS. <span aria-hidden="true">•</span> AT YOUR OWN PACE.</p></div><header><div className="shell header-inner">
    <Link className="brand" href="/" aria-label="AfterClass home"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span>AfterClass<span aria-hidden="true">.</span></Link>
    <nav aria-label="Main navigation">{links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>
  </div></header></>;
}