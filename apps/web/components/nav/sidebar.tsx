import Link from "next/link";
import type { Role } from "@aaf/core/rbac";
import { NAV_SECTIONS, isNavItemVisible } from "../../lib/nav/config";

export function Sidebar({ role }: { role: Role }) {
  const visibleSections = NAV_SECTIONS.filter((section) => isNavItemVisible(role, section));

  return (
    <nav className="flex h-full w-64 flex-col gap-1 border-r border-slate-200 bg-white p-4">
      <div className="mb-4 px-2 text-lg font-semibold text-slate-900">AI Asset Factory</div>
      {visibleSections.map((section) => (
        <div key={section.href} className="mb-2">
          <Link
            href={section.href as never}
            className="block rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {section.label}
          </Link>
          {section.children && section.children.filter((c) => isNavItemVisible(role, c)).length > 0 && (
            <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
              {section.children
                .filter((child) => isNavItemVisible(role, child))
                .map((child) => (
                  <Link
                    key={child.href}
                    href={child.href as never}
                    className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {child.label}
                  </Link>
                ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
