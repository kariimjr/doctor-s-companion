import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { DoctorSession, DoctorProfile } from "@/lib/doctor-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarClock, PillBottle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface Patient {
  id: string;
  name: string;
}

interface Treatment {
  id: string;
  medication?: string;
  scanInterval?: string;
  doctorName?: string;
  specialty?: string;
  createdAt?: { seconds: number } | null;
}

const SCAN_INTERVALS = [
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "1mo", label: "1 month" },
  { value: "3mo", label: "3 months" },
  { value: "6mo", label: "6 months" },
];

export function ActionPlanPanel({
  doctor,
  profile,
}: {
  doctor: DoctorSession;
  profile: DoctorProfile | null;
}) {
  const db = getDb();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "patients"), (snap) => {
      const list: Patient[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Patient, "id">),
      }));
      setPatients(list);
      setActiveId((cur) => cur ?? list[0]?.id ?? null);
    });
    return () => unsub();
  }, [db]);

  const active = patients.find((p) => p.id === activeId) ?? null;

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[320px_1fr]">
      <aside className="flex min-h-0 flex-col border-r bg-secondary/40">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
            SELECT PATIENT
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {patients.length} on your list
          </p>
        </div>
        <ScrollArea className="flex-1">
          <ul className="space-y-1 p-2">
            {patients.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                No patients yet.
              </li>
            ) : (
              patients.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setActiveId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      p.id === activeId
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full",
                        p.id === activeId ? "bg-primary-foreground/15" : "bg-secondary",
                      )}
                    >
                      <UserRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div
                        className={cn(
                          "truncate text-xs",
                          p.id === activeId
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {p.id}
                      </div>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </aside>

      <section className="min-h-0 overflow-y-auto p-6">
        {active ? (
          <ActionPlanForms doctor={doctor} profile={profile} patient={active} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a patient to issue an action plan
          </div>
        )}
      </section>
    </div>
  );
}

function ActionPlanForms({
  doctor,
  profile,
  patient,
}: {
  doctor: DoctorSession;
  profile: DoctorProfile | null;
  patient: Patient;
}) {
  const db = getDb();
  const [medication, setMedication] = useState("");
  const [interval, setInterval] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Treatment[]>([]);

  useEffect(() => {
    setMedication("");
    setInterval("");
  }, [patient.id]);

  // Live history of treatments for this patient
  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, "patients", patient.id, "treatments"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Treatment, "id">) })),
      );
    });
    return () => unsub();
  }, [db, patient.id]);

  const submit = async () => {
    if (!db) {
      toast.error("Firebase isn't configured.");
      return;
    }
    if (!medication.trim() || !interval) {
      toast.error("Add a medication and pick a scan interval.");
      return;
    }
    setSubmitting(true);
    try {
      const intervalLabel =
        SCAN_INTERVALS.find((s) => s.value === interval)?.label ?? interval;
      await addDoc(collection(db, "patients", patient.id, "treatments"), {
        medication: medication.trim(),
        scanInterval: interval,
        scanIntervalLabel: intervalLabel,
        doctorId: doctor.id,
        doctorName: doctor.name,
        specialty: profile?.specialty ?? null,
        createdAt: serverTimestamp(),
      });
      toast.success(`Action plan saved for ${patient.name}.`);
      setMedication("");
      setInterval("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save action plan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Issue Action Plan</h3>
          <p className="text-xs text-muted-foreground">
            For <span className="font-medium text-foreground">{patient.name}</span> ·
            syncs to the patient's calendar in the Flutter app.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="meds" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Prescriptions / Medication
            </Label>
            <Input
              id="meds"
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="e.g. Amoxicillin 500mg, 3x daily for 7 days"
              maxLength={500}
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Recommended Scan Interval
            </Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger>
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                {SCAN_INTERVALS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={submit}
            disabled={submitting || !medication.trim() || !interval}
            className="h-11 w-full rounded-xl text-sm font-semibold"
          >
            {submitting ? "Saving…" : "Submit Action Plan"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Recent plans</h3>
            <p className="text-xs text-muted-foreground">Latest treatments for this patient</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {history.length}
          </span>
        </div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
            No action plans yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {history.slice(0, 6).map((t) => (
              <li key={t.id} className="rounded-xl border bg-secondary/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PillBottle className="h-4 w-4 text-primary" />
                  {t.medication}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {SCAN_INTERVALS.find((s) => s.value === t.scanInterval)?.label ?? t.scanInterval ?? "—"}
                  </span>
                  {t.doctorName && <span>· Dr. {t.doctorName}</span>}
                  {t.specialty && <span>· {t.specialty}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
