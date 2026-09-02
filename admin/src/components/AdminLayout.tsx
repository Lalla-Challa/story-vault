import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  BarChart2,
  BookOpen,
  Bug,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AdminGuard } from "./AdminGuard";

type AdminNavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  kind: "overview" | "section";
};

function normalizeBasePath(basePath: string | undefined) {
  if (!basePath) return "";
  const trimmed = basePath.trim();
  if (trimmed === "" || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function buildAdminPath(basePath: string, subPath?: string) {
  const base = normalizeBasePath(basePath);
  if (!subPath || subPath === "") return base || "/";
  return base ? `${base}/${subPath}` : `/${subPath}`;
}

function buildAdminNavItems(basePath: string, userRole: string): AdminNavItem[] {
  const items: AdminNavItem[] = [
    { icon: LayoutDashboard, label: "Overview", path: buildAdminPath(basePath), kind: "overview" },
  ];

  const isAdmin = ["admin", "super_admin"].includes(userRole);
  const isSupport = userRole === "support";

  if (isAdmin || isSupport) {
    items.push({ icon: Users, label: "Users", path: buildAdminPath(basePath, "users"), kind: "section" });
    items.push({ icon: BookOpen, label: "Projects", path: buildAdminPath(basePath, "projects"), kind: "section" });
    items.push({ icon: BookOpen, label: "Scenes", path: buildAdminPath(basePath, "scenes"), kind: "section" });
    items.push({ icon: Users, label: "Beta Requests", path: buildAdminPath(basePath, "beta-requests"), kind: "section" });
    items.push({ icon: Bug, label: "Feedback", path: buildAdminPath(basePath, "feedback"), kind: "section" });
    items.push({ icon: ScrollText, label: "Communication", path: buildAdminPath(basePath, "communication"), kind: "section" });
  }

  items.push({ icon: BarChart2, label: "Analytics", path: buildAdminPath(basePath, "analytics"), kind: "section" });
  items.push({ icon: Activity, label: "Activity Feed", path: buildAdminPath(basePath, "feed"), kind: "section" });
  
  if (isAdmin) {
    items.push({ icon: Activity, label: "Email Templates", path: buildAdminPath(basePath, "templates"), kind: "section" });
    items.push({ icon: Shield, label: "Audit Logs", path: buildAdminPath(basePath, "audit"), kind: "section" });
    items.push({ icon: Shield, label: "System Status", path: buildAdminPath(basePath, "system"), kind: "section" });
    items.push({ icon: Shield, label: "Monitoring", path: buildAdminPath(basePath, "monitoring"), kind: "section" });
  }

  return items;
}

const ADMIN_SIDEBAR_WIDTH_KEY = "admin-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function AdminLayout({
  children,
  basePath = "/admin",
}: {
  children: React.ReactNode;
  basePath?: string;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(ADMIN_SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  useEffect(() => {
    localStorage.setItem(ADMIN_SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  return (
    <AdminGuard>
      <SidebarProvider
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <AdminLayoutContent setSidebarWidth={setSidebarWidth} basePath={basePath}>
          {children}
        </AdminLayoutContent>
      </SidebarProvider>
    </AdminGuard>
  );
}

type AdminLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  basePath: string;
};

function AdminLayoutContent({
  children,
  setSidebarWidth,
  basePath,
}: AdminLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const adminNavItems = buildAdminNavItems(basePath, user?.role || 'user');

  const activeNavItem = adminNavItems.find((item) =>
    item.kind === "overview" ? location === item.path : location.startsWith(item.path)
  );

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate text-sm">
                    Admin Panel
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {adminNavItems.map((item) => {
                const isActive =
                  item.kind === "overview"
                    ? location === item.path
                    : location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${
            isCollapsed ? "hidden" : ""
          }`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <span className="tracking-tight text-foreground">
                  {activeNavItem?.label ?? "Admin"}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
