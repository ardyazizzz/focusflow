import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Sun, PlusCircle, Inbox, LayoutGrid, Sparkles, Settings } from 'lucide-react'
import { useAppStore, type AppTab } from '@/store/use-app-store'
import { FocusScreen } from '@/components/screens/focus-screen'
import { CaptureScreen } from '@/components/screens/capture-screen'
import { BacklogScreen } from '@/components/screens/backlog-screen'
import { FoundationScreen } from '@/components/screens/foundation-screen'
import CoachScreen from '@/components/screens/coach-screen'
import SettingsScreen from '@/components/screens/settings-screen'

const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'focus', label: 'Focus', icon: <Sun className="h-5 w-5" /> },
  { id: 'capture', label: 'Capture', icon: <PlusCircle className="h-5 w-5" /> },
  { id: 'backlog', label: 'Backlog', icon: <Inbox className="h-5 w-5" /> },
  { id: 'foundation', label: 'Foundation', icon: <LayoutGrid className="h-5 w-5" /> },
  { id: 'coach', label: 'Coach', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

const screenComponents: Record<AppTab, React.ReactNode> = {
  focus: <FocusScreen />,
  capture: <CaptureScreen />,
  backlog: <BacklogScreen />,
  foundation: <FoundationScreen />,
  coach: <CoachScreen />,
  settings: <SettingsScreen />,
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }))

  const activeTab = useAppStore((s) => s.activeTab)
  const setActiveTab = useAppStore((s) => s.setActiveTab)

  return (
    <QueryClientProvider client={queryClient}>
    <div className="min-h-screen flex flex-col bg-white font-sans antialiased">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="flex-none border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            FocusFlow
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {screenComponents[activeTab]}
        </div>
      </main>

      {/* Bottom Tab Navigation */}
      <nav className="flex-none fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-md border-t border-gray-100 z-40">
        <div className="max-w-2xl mx-auto flex items-center justify-around h-16 px-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors duration-150 min-w-0 ${
                  isActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={isActive ? 'scale-105 transition-transform' : ''}>
                  {tab.icon}
                </span>
                <span className="text-[10px] font-medium leading-tight">
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-2 w-1 h-1 rounded-full bg-gray-900" />
                )}
              </button>
            )
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
    </QueryClientProvider>
  )
}
