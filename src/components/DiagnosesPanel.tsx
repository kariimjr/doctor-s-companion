import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { isEmailJsConfigured, sendDiagnosisEmail } from "@/lib/emailjs";
import type { DoctorSession } from "@/lib/doctor-session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Mail } from "lucide-react";

// 🎯 MATCHES FLUTTER FIRESTORE SCHEMA KEYS CONVERGENCES
interface Diagnosis {
  id: string;
  userId?: string;         // Flutter app uses userId instead of patientId
  patientName?: string;
  patientEmail?: string;
  category?: string;       // 'Brain', 'Breast', 'Lung'
  label?: string;          // Model result label text output string
  confidence?: number;     // double confidence percentage tracking decimal
  imageUrl?: string;       // 🟢 ADDED: Captures the compressed Base64 data string payload
  status?: "none" | "pending_confirmation" | "confirmed_by_doctor" | "Modified";
  doctorConfirmation?: {
    confirmedAt?: any;
    doctorName?: string;
    notes?: string;
  } | null;
  date?: { seconds: number } | null; // Flutter saves it as 'date' timestamp
}

export function DiagnosesPanel({ doctor }: { doctor: DoctorSession }) {
  const db = getDb();
  const [items, setItems] = useState<Diagnosis[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;

    // 🎯 TARGETS FLUTTER PATHS: Reads 'scan_history' sorted by the latest uploaded files
    const q = query(
      collection(db, "scan_history"), 
      orderBy("date", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ 
        id: d.id, 
        ...(d.data() as Omit<Diagnosis, "id">) 
      }));
      
      setItems(list);
      
      // Auto-focus on the first unverified ticket item available in queue lists
      setActiveId((cur) => 
        cur ?? 
        list.find((x) => x.status === "pending_confirmation")?.id ?? 
        list[0]?.id ?? 
        null
      );
    });
    
    return () => unsub();
  }, [db]);

  // Filters active metrics count to reflect pending diagnostic items awaiting review configurations
  const pendingCount = useMemo(
    () => items.filter((i) => i.status === "pending_confirmation").length,
    [items],
  );
  
  const active = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[360px_1fr]">
      <aside className="flex min-h-0 flex-col border-r bg-secondary/40">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
            PENDING AI APPROVALS
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {pendingCount} awaiting your review
          </p>
        </div>
        <ScrollArea className="flex-1">
          <ul className="space-y-1 p-2">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                No scans submitted yet. Patient diagnostic actions arrive live in <code>/scan_history</code>.
              </li>
            ) : (
              items.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setActiveId(d.id)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                      d.id === activeId ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {d.patientName ?? `Patient ID: ${d.userId?.substring(0, 6)}...`}
                      </span>
                      <StatusBadge status={d.status} active={d.id === activeId} />
                    </div>
                    <div className={`mt-0.5 truncate text-xs ${d.id === activeId ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      <span className="font-semibold text-[11px] bg-background/20 px-1.5 py-0.2 rounded mr-1">
                        {d.category ?? "General"}
                      </span>
                      {d.label ?? "Unclassified Scan"}
                      {typeof d.confidence === "number" ? ` · ${Math.round(d.confidence * 100)}%` : ""}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </aside>

      <section className="min-h-0 overflow-y-auto">
        {active ? <DiagnosisDetail doctor={doctor} item={active} /> : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an image scanning file path to view parameters
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status, active }: { status?: string; active: boolean }) {
  let label = "New";
  if (status === "pending_confirmation") label = "Pending Review";
  if (status === "confirmed_by_doctor") label = "Confirmed";
  if (status === "Modified") label = "Modified";

  const cls = active
    ? "bg-primary-foreground/20 text-primary-foreground"
    : status === "confirmed_by_doctor"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Modified"
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-50 text-blue-700 border border-blue-200";
        
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function DiagnosisDetail({ doctor, item }: { doctor: DoctorSession; item: Diagnosis }) {
  const db = getDb();
  const [decision, setDecision] = useState<"confirmed_by_doctor" | "Modified">(
    item.status === "Modified" ? "Modified" : "confirmed_by_doctor",
  );
  const [comments, setComments] = useState(item.doctorConfirmation?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  // 🟢 Force component to decouple heavy Base64 updates from core state lifecycle
  const [displayImage, setDisplayImage] = useState<string | null>(null);

  useEffect(() => {
    setDecision(item.status === "Modified" ? "Modified" : "confirmed_by_doctor");
    setComments(item.doctorConfirmation?.notes ?? "");
    
    // 🎯 Synchronize the display target state instantly when a card is selected
    if (item.imageUrl) {
      setDisplayImage(item.imageUrl);
    } else {
      setDisplayImage(null);
    }
  }, [item.id, item.imageUrl]);

  const submit = async () => {
    if (!db) {
      toast.error("Firebase is not initialized.");
      return;
    }
    if (!comments.trim()) {
      toast.error("Please provide validation logs or diagnostic clinical recommendations.");
      return;
    }
    setSubmitting(true);
    try {
      // 🎯 UPDATES FLUTTER DOCUMENT RECORD STRUCTS:
      await updateDoc(doc(db, "scan_history", item.id), {
        status: decision,
        doctorConfirmation: {
          confirmedAt: serverTimestamp(),
          doctorName: doctor.name,
          notes: comments,
        }
      });

      if (item.patientEmail && isEmailJsConfigured()) {
        try {
          await sendDiagnosisEmail({
            to_email: item.patientEmail,
            to_name: item.patientName ?? "Valued Patient",
            status: decision === "confirmed_by_doctor" ? "Confirmed" : "Modified",
            diagnosis_summary: `${item.category} Scan - Result: ${item.label ?? "AI Result"}`,
            doctor_comments: comments,
            doctor_name: doctor.name,
          });
          toast.success(`Verification completely finalized and updated on client phone application records.`);
        } catch (err) {
          console.error(err);
          toast.warning("Verification synchronized online, but notifications dropped.");
        }
      } else {
        toast.success("Validation ticket successfully processed! Check your phone application screen layout.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to append structural dashboard updates.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-2">
      {/* AI submission */}
      <Card className="flex flex-col gap-4 overflow-hidden p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{item.category ?? "Medical"} Imaging Record</h3>
            <p className="text-xs text-muted-foreground">
              Uploaded by ID: {item.userId?.substring(0, 10)}...
              {item.patientEmail ? ` · ${item.patientEmail}` : ""}
            </p>
          </div>
          <StatusBadge status={item.status} active={false} />
        </div>

        {/* 🎯 FIXED IMAGE LOADING BOX: Renders Base64 strings safely from Firestore database mapping */}
        <div className="overflow-hidden rounded-xl border bg-secondary/50 flex aspect-video items-center justify-center p-2 min-h-[220px]">
          {displayImage ? (
            <img 
              src={displayImage} 
              alt="Medical Scan Diagnostic Payload" 
              className="w-full h-full object-contain max-h-[250px] rounded-lg bg-black/5"
              loading="lazy"
              onError={(e) => {
                console.error("Base64 target rendering fallback execution.");
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="text-center text-muted-foreground text-xs p-4 flex flex-col items-center gap-2">
              <ImageIcon className="h-8 w-8 text-blue-400" />
              <span className="font-medium">MRI / X-Ray Reference Block</span>
              <span className="text-[10px] text-gray-400">No medical diagnostic image string parsed yet</span>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-secondary p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-secondary-foreground/70">
            TFLite Neural Output Findings
          </div>
          <div className="mt-1 text-lg font-semibold text-sky-900">{item.label ?? "No predictive keys"}</div>
          {typeof item.confidence === "number" && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary-foreground/70">Engine Confidence</span>
                <span className="font-semibold">{Math.round(item.confidence * 100)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-background/60">
                <div
                  className="h-full bg-sky-600"
                  style={{ width: `${Math.min(100, Math.max(0, item.confidence * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Verification form */}
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold">Physician Verification</h3>
          <p className="text-xs text-muted-foreground">
            Approve the AI neural conclusions or adjust diagnostic notes for clinic reviews.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Action Validation
          </label>
          <ToggleGroup
            type="single"
            value={decision}
            onValueChange={(v) => v && setDecision(v as "confirmed_by_doctor" | "Modified")}
            className="w-full justify-stretch gap-2"
          >
            <ToggleGroupItem
              value="confirmed_by_doctor"
              className="flex-1 gap-2 rounded-xl border data-[state=on]:border-emerald-600 data-[state=on]:bg-emerald-600 data-[state=on]:text-white"
            >
              <CheckCircle2 className="h-4 w-4" /> Confirm Diagnoise
            </ToggleGroupItem>
            <ToggleGroupItem
              value="Modified"
              className="flex-1 gap-2 rounded-xl border data-[state=on]:border-amber-600 data-[state=on]:bg-amber-600 data-[state=on]:text-white"
            >
              <AlertTriangle className="h-4 w-4" /> Modify Diagnoise
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Physician Clinical Comments & Advice
          </label>
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Input verified notes, treatment prescription, next laboratory diagnostics check..."
            rows={9}
            className="resize-none rounded-xl bg-secondary/40"
          />
        </div>

        <Button onClick={submit} disabled={submitting} className="h-11 rounded-xl text-sm font-semibold bg-sky-950 hover:bg-sky-900 text-white">
          {submitting ? "Processing Transaction..." : "Sign & Finalize Medical Verification Ticket"}
        </Button>
      </Card>
    </div>
  );
}
