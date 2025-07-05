"use client"

import React from "react"
import { Home, Settings, LogOut, PackageCheck, BarChart, FlaskConical, Beaker, FileSpreadsheet, ClipboardCheck, ListChecks, Clipboard, Package, ShoppingCart, Factory } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter } from "@/components/ui/sidebar"

export function AppSidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  if (!user) return null;

  const allMenuItems = [
    { id: "dashboard", title: "Dashboard", icon: Home, href: "/" },
    { id: "orders", title: "Orders", icon: ShoppingCart, href: "/orders" },
    { id: "full-kitting", title: "Full Kitting", icon: Package, href: "/full-kitting" },
    { id: "job-cards", title: "Job Cards", icon: Clipboard, href: "/job-cards" },
    { id: "production", title: "Production", icon: Factory, href: "/production" },
    { id: "lab-testing1", title: "Lab Testing 1", icon: FlaskConical, href: "/lab-testing1" },
    { id: "lab-testing2", title: "Lab Testing 2", icon: Beaker, href: "/lab-testing2" },
    { id: "chemical-test", title: "Chemical Test", icon: FileSpreadsheet, href: "/chemical-test" },
    { id: "check", title: "Check", icon: ClipboardCheck, href: "/check" },
    { id: "tally", title: "Tally", icon: ListChecks, href: "/tally" },
    { id: "settings", title: "Settings", icon: Settings, href: "/settings" },
  ];

  // If user is admin, show all pages. Otherwise, filter by permissions.
  const menuItems = user.role?.toLowerCase() === 'admin'
    ? allMenuItems
    : allMenuItems.filter(item => user.permissions.includes(item.id));

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-lg"><PackageCheck className="h-6 w-6 text-white" /></div>
          <h1 className="text-xl font-semibold">Production</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton asChild isActive={pathname === item.href}>
                <Link href={item.href}><item.icon className="mr-3 h-5 w-5" />{item.title}</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col"><span className="text-sm font-medium">{user.username}</span><span className="text-xs text-muted-foreground capitalize">{user.role}</span></div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="Logout"><LogOut className="h-5 w-5" /></Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}