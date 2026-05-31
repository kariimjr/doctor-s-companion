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

interface Diagnosis {
  id: string;
  patientId?: string;
  patientName?: string;
  patientEmail?: string;
  imageUrl?: string;
  classification?: string;
  confidence?: number;
  metrics?: Record<string, string | number>;
  status?: "pending" | "Confirmed" | "Modified";
  doctorComments?: string;
  createdAt?: { seconds: number } | null;
}

export function DiagnosesPanel({ doctor }: { doctor: DoctorSession }) {
  const db = getDb();
  const [items, setItems] = useState<Diagnosis[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "diagnoses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Diagnosis, "id">) }));
      setItems(list);
      setActiveId((cur) => cur ?? list.find((x) => x.status !== "Confirmed" && x.status !== "Modified")?.id ?? list[0]?.id ?? null);
    });
    return () => unsub();
  }, [db]);

  const pendingCount = useMemo(
    () => items.filter((i) => !i.status || i.status === "pending").length,
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
                No diagnoses yet. Patient submissions arrive in <code>/diagnoses</code>.
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
                        {d.patientName ?? d.patientId ?? "Unknown patient"}
                      </span>
                      <StatusBadge status={d.status} active={d.id === activeId} />
                    </div>
                    <div className={`mt-0.5 truncate text-xs ${d.id === activeId ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {d.classification ?? "AI result"}
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
            Select a submission to review
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status, active }: { status?: string; active: boolean }) {
  const label = status && status !== "pending" ? status : "Pending";
  const cls = active
    ? "bg-primary-foreground/20 text-primary-foreground"
    : status === "Confirmed"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Modified"
        ? "bg-amber-100 text-amber-800"
        : "bg-secondary text-secondary-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function DiagnosisDetail({ doctor, item }: { doctor: DoctorSession; item: Diagnosis }) {
  const db = getDb();
  const [decision, setDecision] = useState<"Confirmed" | "Modified">(
    item.status === "Modified" ? "Modified" : "Confirmed",
  );
  const [comments, setComments] = useState(item.doctorComments ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDecision(item.status === "Modified" ? "Modified" : "Confirmed");
    setComments(item.doctorComments ?? "");
  }, [item.id]);

  const submit = async () => {
    if (!db) {
      toast.error("Firebase is not configured. Add VITE_FIREBASE_* env vars.");
      return;
    }
    if (!comments.trim()) {
      toast.error("Please add your clinical comments before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "diagnoses", item.id), {
        status: decision,
        doctorComments: comments,
        doctorId: doctor.id,
        doctorName: doctor.name,
        verifiedAt: serverTimestamp(),
      });

      if (item.patientEmail && isEmailJsConfigured()) {
        try {
          await sendDiagnosisEmail({
            to_email: item.patientEmail,
            to_name: item.patientName ?? "Patient",
            status: decision,
            diagnosis_summary: `${item.classification ?? "AI result"}${
              typeof item.confidence === "number" ? ` (confidence ${Math.round(item.confidence * 100)}%)` : ""
            }`,
            doctor_comments: comments,
            doctor_name: doctor.name,
          });
          toast.success(`Verification submitted and email sent to ${item.patientEmail}`);
        } catch (err) {
          console.error(err);
          toast.warning("Verification saved, but the email failed to send.");
        }
      } else if (!item.patientEmail) {
        toast.success("Verification submitted. (No patient email on file.)");
      } else {
        toast.success("Verification submitted. (EmailJS env vars not set — email skipped.)");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit verification.");
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
            <h3 className="text-base font-semibold">AI Submission</h3>
            <p className="text-xs text-muted-foreground">
              From {item.patientName ?? item.patientId ?? "patient"}
              {item.patientEmail ? ` · ${item.patientEmail}` : ""}
            </p>
          </div>
          <StatusBadge status={item.status} active={false} />
        </div>

        <div className="overflow-hidden rounded-xl border bg-secondary/50">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt="Patient submission"
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="rounded-xl bg-secondary p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-secondary-foreground/70">
            AI Classification
          </div>
          <div className="mt-1 text-lg font-semibold">{item.classification ?? "—"}</div>
          {typeof item.confidence === "number" && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary-foreground/70">Confidence</span>
                <span className="font-semibold">{Math.round(item.confidence * 100)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-background/60">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, item.confidence * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {item.metrics && Object.keys(item.metrics).length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Metrics
            </h4>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(item.metrics).map(([k, v]) => (
                <div key={k} className="rounded-lg border bg-card px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Card>

      {/* Verification form */}
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold">Physician Verification</h3>
          <p className="text-xs text-muted-foreground">
            Confirm or modify the AI's result and notify the patient.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Decision
          </label>
          <ToggleGroup
            type="single"
            value={decision}
            onValueChange={(v) => v && setDecision(v as "Confirmed" | "Modified")}
            className="w-full justify-stretch gap-2"
          >
            <ToggleGroupItem
              value="Confirmed"
              className="flex-1 gap-2 rounded-xl border data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <CheckCircle2 className="h-4 w-4" /> Confirm AI Diagnosis
            </ToggleGroupItem>
            <ToggleGroupItem
              value="Modified"
              className="flex-1 gap-2 rounded-xl border data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <AlertTriangle className="h-4 w-4" /> Modify AI Diagnosis
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
            placeholder="Add your clinical observations, treatment guidance, follow-up steps…"
            rows={9}
            className="resize-none rounded-xl bg-secondary/40"
          />
        </div>

        <div className="rounded-xl border border-dashed border-primary/30 bg-secondary p-3 text-xs text-secondary-foreground">
          <div className="flex items-center gap-2 font-medium">
            <Mail className="h-3.5 w-3.5" /> Patient notification
          </div>
          <p className="mt-1 text-secondary-foreground/80">
            {item.patientEmail
              ? `An email summary will be sent to ${item.patientEmail} via EmailJS.`
              : "No patient email on file — only the Firestore record will be updated."}
          </p>
          {!isEmailJsConfigured() && (
            <Badge variant="secondary" className="mt-2">EmailJS env vars not set</Badge>
          )}
        </div>

        <Button onClick={submit} disabled={submitting} className="h-11 rounded-xl text-sm font-semibold">
          {submitting ? "Submitting…" : "Submit Verification & Notify Patient"}
        </Button>
      </Card>
    </div>
  );
}
