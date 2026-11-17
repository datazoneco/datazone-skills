import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/sales", label: "Sales" },
  { to: "/orders", label: "Orders" },
];

/** Header navigation, passed to AppLayout as `actions`. Every `to` must have a <Route> in App.tsx. */
export function AppNav() {
  return (
    <nav className="flex gap-1">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
