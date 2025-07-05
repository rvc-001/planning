// components/layout/sidebar.tsx
"use client"

import { useAuth, FullPageLoader } from "@/lib/auth"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Factory,
  ClipboardList,
  FileCheck,
  FlaskConical,
  Beaker,
  CheckSquare,
  Boxes,
  Truck,
  Settings,
  LogOut,
  LayoutDashboard,
  Menu, // Import Menu icon for minimize/maximize
  X, // Import X icon for closing
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils" // Import cn for conditional class styling

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Truck },
  { href: "/full-kitting", label: "Full Kitting", icon: Boxes },
  { href: "/job-cards", label: "Job Cards", icon: ClipboardList },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/lab-testing1", label: "Lab Test 1", icon: FlaskConical },
  { href: "/lab-testing2", label: "Lab Test 2", icon: Beaker },
  { href: "/chemical-test", label: "Chemical Test", icon: CheckSquare },
  { href: "/check", label: "Check", icon: FileCheck },
  { href: "/tally", label: "Tally", icon: Boxes },
]

function Sidebar({ isMinimized, toggleMinimize }: { isMinimized: boolean; toggleMinimize: () => void }) {
  const pathname = usePathname()
  const { logout, user } = useAuth()

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-white transition-all duration-300 ease-in-out", // White background
        isMinimized ? "w-16" : "w-64", // Control width
        "h-screen fixed top-0 left-0 z-20", // Cover vertical space
      )}
    >
      <div className={cn("flex items-center justify-between p-4", { "justify-center": isMinimized })}>
        {!isMinimized && (
          <h1 className="text-2xl font-bold text-purple-700"> {/* Purple text */}
            Production Planning
          </h1>
        )}
        <Button
          variant="ghost"
          size={isMinimized ? "icon" : "sm"}
          onClick={toggleMinimize}
          className="hover:bg-purple-100 text-purple-600" // Purple hover/text
        >
          {isMinimized ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </Button>
      </div>
      <nav className="flex-1 flex flex-col space-y-2 px-2 overflow-y-auto custom-scrollbar"> {/* Added flex-col to expand vertically */}
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "text-gray-700 hover:bg-purple-100", // Darker text, light purple hover
              {
                "bg-purple-600 text-white hover:bg-purple-700": pathname === item.href, // Active light purple
                "justify-center": isMinimized, // Center icon when minimized
              },
            )}
            title={isMinimized ? item.label : ""} // Tooltip for minimized icons
          >
            <item.icon className={cn("h-5 w-5", { "text-white": pathname === item.href })} /> {/* White icon for active */}
            {!isMinimized && item.label}
          </Link>
        ))}
        {/* Settings Link - Pushed towards the bottom of the nav section */}
        <div className="mt-auto pt-2">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "text-gray-700 hover:bg-purple-100", // Darker text, light purple hover
              {
                "bg-purple-600 text-white hover:bg-purple-700": pathname === "/settings", // Active light purple
                "justify-center": isMinimized,
              },
            )}
            title={isMinimized ? "Settings" : ""}
          >
            <Settings className={cn("h-5 w-5", { "text-white": pathname === "/settings" })} /> {/* White icon for active */}
            {!isMinimized && "Settings"}
          </Link>
        </div>
      </nav>

      {/* Logout and User Info Section - This will now be just above the very bottom footer */}
      <div className="p-4 border-t border-purple-200">
        <Button variant="ghost" className={cn("w-full justify-start gap-3 hover:bg-purple-100 text-purple-600", { "justify-center": isMinimized })} onClick={logout}>
          <LogOut className="h-5 w-5" />
          {!isMinimized && "Logout"}
        </Button>
        {user && !isMinimized && <p className="mt-2 text-xs text-center text-gray-600">Logged in as {user.username}</p>}
      </div>

      {/* New Footer Section for the very bottom of the sidebar - like login page footer */}
      {!isMinimized && (
        <div className="w-full p-4 text-center text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600"> {/* Added w-full and text-center */}
          Powered by{" "}
          <Link href="https://www.botivate.in/" target="_blank" rel="noopener noreferrer" className="text-white hover:underline">
            Botivate
          </Link>
        </div>
      )}
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarMinimized(!isSidebarMinimized);
  };

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    const isAuthPage = pathname === "/login"

    if (!user && !isAuthPage) {
      router.push("/login")
    }

    if (user && isAuthPage) {
      router.push("/")
    }
  }, [user, isAuthLoading, pathname, router])

  if (isAuthLoading || (!user && pathname !== "/login")) {
    return <FullPageLoader />
  }

  if (pathname === "/login") {
    return <>{children}</>
  }

  return (
    <div className="flex">
      <Sidebar isMinimized={isSidebarMinimized} toggleMinimize={toggleSidebar} />
      <main
        className={cn(
          "flex-1 bg-gray-100/50 p-4 sm:p-6 lg:p-8 transition-all duration-300 ease-in-out",
          isSidebarMinimized ? "ml-16" : "ml-64",
          "min-h-screen",
        )}
      >
        {children}
      </main>
    </div>
  )
}