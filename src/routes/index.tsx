import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Stethoscope, LogOut, MessageSquare, ClipboardCheck } from "lucide-react";
import {
  clearDoctor,
  useDoctorSession,
  usePresence,
} from "@/lib/doctor-session";
import { isFirebaseConfigured } from "@/lib/firebase";
import { DoctorSignIn } from "@/components/DoctorSignIn";
import { ChatDashboard } from "@/components/ChatDashboard";
import { DiagnosesPanel } from "@/components/DiagnosesPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Doctor Medical Portal" },
      {
        name: "description",
        content:
          "Secure portal for physicians: real-time patient chat and AI diagnosis review & confirmation.",
      },
      { property: "og:title", content: "Doctor Medical Portal" },
      {
        property: "og:description",
        content:
          "Real-time patient chat and AI diagnosis review for clinicians.",
      },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const doctor = useDoctorSession();
  usePresence(doctor);

  if (!mounted) {
    return <div className="min-h-screen bg-secondary/40" />;
  }
  if (!doctor) {
    return (
      <>
        <DoctorSignIn />
        <Toaster richColors position="top-right" />
      </>
    );
  }
  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Doctor Medical Portal</h1>
              <p className="text-xs text-muted-foreground">
                Welcome, Dr. {doctor.name} · <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> online</span>
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => clearDoctor()} className="gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {!isFirebaseConfigured() && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-secondary p-4 text-sm text-secondary-foreground">
            <strong>Firebase isn't configured.</strong> Add{" "}
            <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_PROJECT_ID</code>,{" "}
            <code>VITE_FIREBASE_APP_ID</code> (and the rest of the Firebase config) as
            environment variables. On Vercel, set them in Project Settings → Environment Variables.
          </div>
        )}

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="mb-4 grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Patient Chat
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <ClipboardCheck className="h-4 w-4" /> Pending AI Approvals
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat">
            <ChatDashboard doctor={doctor} />
          </TabsContent>
          <TabsContent value="ai">
            <DiagnosesPanel doctor={doctor} />
          </TabsContent>
        </Tabs>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
