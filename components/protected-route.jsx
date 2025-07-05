"use client"

import React, { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth"
import { LoginForm } from "@/components/login-form"
import { usePathname } from "next/navigation"

export function ProtectedRoute({ children }) {
  const { user, isAuthenticated } = useAuth()
  const pathname = usePathname()
  const [hasAccess, setHasAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated && user) {
      const currentPage = pathname.slice(1) || "dashboard"
      const userHasAccess = user.permissions.includes(currentPage)
      setHasAccess(userHasAccess)
    }
    setIsLoading(false)
  }, [isAuthenticated, user, pathname])

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don&apos;t have permission to access this page.</p>
          <p className="text-sm text-gray-500">Contact your administrator for access.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}