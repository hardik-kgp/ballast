import { useState } from "react";
import { Sidebar, type ViewId } from "@/components/Sidebar";
import { AlertsView } from "@/views/AlertsView";
import { ChatView } from "@/views/ChatView";
import { DashboardView } from "@/views/DashboardView";
import { MaintenanceView } from "@/views/MaintenanceView";

export default function App() {
  const [view, setView] = useState<ViewId>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-dvh">
      <Sidebar
        view={view}
        onViewChange={setView}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />
      <main className="min-w-0 flex-1 overflow-hidden">
        {view === "chat" ? (
          <ChatView />
        ) : (
          <div className="h-full overflow-y-auto">
            {view === "dashboard" ? (
              <DashboardView />
            ) : view === "maintenance" ? (
              <MaintenanceView />
            ) : (
              <AlertsView />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
