import React, { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/context/AuthContext'

export const AdminLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5EE] text-[#817A75]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold">Resolving dairy administrator tenant...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-[#FFF5EE] flex">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        <Header onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
