'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            SaaS Landing Page
          </h1>
        </div>
        <nav className="flex-1 p-3 space-y-1">
            <Link href="/features" className={pathname === "/features" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"} + " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}>Features</Link>
            <Link href="/pricing" className={pathname === "/pricing" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"} + " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}>Pricing</Link>
            <Link href="/testimonials" className={pathname === "/testimonials" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"} + " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}>Testimonials</Link>
            <Link href="/faq" className={pathname === "/faq" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"} + " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}>FAQ</Link>
            <Link href="/login" className={pathname === "/login" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"} + " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}>Log In</Link>
            <Link href="/signup" className={pathname === "/signup" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"} + " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}>Sign Up</Link>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold">U</div>
            <div>
              <p className="text-sm font-medium text-gray-900">User</p>
              <p className="text-xs text-gray-500">user@example.com</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
