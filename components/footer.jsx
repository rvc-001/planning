"use client"

export function Footer() {
  return (
    <footer className="border-t bg-white/80 backdrop-blur-sm mt-auto">
      <div className="container-responsive py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Powered by</span>
            <span className="text-sm font-semibold text-blue-600">Botivate</span>
          </div>
          <div className="text-xs text-gray-500 text-center">
            © 2024 Production Planning System. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}