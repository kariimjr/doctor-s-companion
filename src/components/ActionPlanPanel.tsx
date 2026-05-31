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
import { CalendarClock, PillBottle, UserRound, ClipboardList, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Patient {
  id: string;
  name?: string;
  fullName?: string;
  email?: string;
}

interface Treatment {
  id: string;
  medication?: string;
  scanInterval?: string;
  doctorName?: string;
  specialty?: string;
  createdAt?: { seconds: number } | null;
}

interface PatientActiveMedicine {
  id: string;
  name: string;
  time?: string;
  type?: string;
  dosage?: string;
  currentDoses?: number;
  targetDoses?: number;
}

const SCAN_INTERVALS = [
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "1mo", label: "1 month" },
  { value: "3mo", label: "3 months" },
  { value: "6mo", label: "6 months" },
];

// 🎯 Added medicine types to map perfectly to your Flutter presentation models
const MEDICINE_TYPES = [
  { value: "Pill", label: "💊 Pill / Tablet" },
  { value: "Syrup", label: "🧪 Syrup Liquid" },
  { value: "Injection", label: "💉 Injection" },
  { value: "Cream", label: "🧴 Topical Cream" },
  { value: "Inhaler", label: "🫁 Inhaler" },
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
              patients.map((p) => {
                const patientDisplayName = p.fullName || p.name || p.email?.split("@")[0] || "Unknown Patient";
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setActiveId(p.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        p.id === activeId ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                      )}
                    >
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", p.id === activeId ? "bg-primary-foreground/15" : "bg-secondary")}> 
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold tracking-tight">{patientDisplayName}</div>
                        <div className={cn("truncate text-[10px] font-mono opacity-60", p.id === activeId ? "text-primary-foreground" : "text-muted-foreground")}>
                          ID: {p.id.substring(0, 8)}...
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })
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
  const [medType, setMedType] = useState<string>("Pill"); // 🟢 New Type State
  const [medTime, setMedTime] = useState<string>("08:00 AM"); // 🟢 New Time State
  const [targetDoses, setTargetDoses] = useState<number>(3); // 🟢 New Doses Target State
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Treatment[]>([]);
  const [activeMeds, setActiveMeds] = useState<PatientActiveMedicine[]>([]);

  useEffect(() => {
    setMedication("");
    setInterval("");
    setMedType("Pill");
    setMedTime("08:00 AM");
    setTargetDoses(3);
  }, [patient.id]);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "patients", patient.id, "treatments"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Treatment, "id">) })));
    });
    return () => unsub();
  }, [db, patient.id]);

  useEffect(() => {
    if (!db) return;
    const medsRef = collection(db, "patients", patient.id, "medicines");
    const unsub = onSnapshot(medsRef, (snap) => {
      setActiveMeds(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PatientActiveMedicine) })));
    });
    return () => unsub();
  }, [db, patient.id]);

  const submit = async () => {
    if (!db) {
      toast.error("Firebase connection context error.");
      return;
    }
    if (!medication.trim() || !interval || !medTime) {
      toast.error("Please fill in all medical form parameters completely.");
      return;
    }
    setSubmitting(true);
    try {
      const intervalLabel = SCAN_INTERVALS.find((s) => s.value === interval)?.label ?? interval;
      const patientNameString = patient.fullName || patient.name || "Patient";

      // A: Log history payload
      await addDoc(collection(db, "patients", patient.id, "treatments"), {
        medication: medication.trim(),
        scanInterval: interval,
        scanIntervalLabel: intervalLabel,
        doctorName: doctor.name,
        specialty: profile?.specialty ?? null,
        createdAt: serverTimestamp(),
      });

      // B: Injects straight into Flutter's specific model schema fields cleanly!
      await addDoc(collection(db, "patients", patient.id, "medicines"), {
        name: medication.trim(),
        time: medTime,                    // 🟢 Synchronized dynamic time input string
        type: medType.toLowerCase(),      // 🟢 Matches lowercase naming rules (e.g. 'pill')
        targetDoses: Number(targetDoses), // 🟢 Parsed explicitly as integer numerical values
        currentDoses: 0,
        dosage: `Take as instructed by Dr. ${doctor.name}`,
        lastUpdated: serverTimestamp(),
      });

      toast.success(`Action plan saved and synced to ${patientNameString}'s Flutter app.`);
      setMedication("");
      setInterval("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to write parameters across database cluster nodes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Issue Complete Action Plan</h3>
          <p className="text-xs text-muted-foreground">
            Fills layout elements inside the patient's Flutter dashboard instantly.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="meds" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Medicine Name
            </Label>
            <Input
              id="meds"
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="e.g. Amoxicillin 500mg"
              maxLength={200}
            />
          </div>

          {/* 🟢 NEW FIELD GRID: Type, Time, and Target Doses selectors layout configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Medicine Type</Label>
              <Select value={medType} onValueChange={setMedType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {MEDICINE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Daily Target Doses</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={targetDoses}
                onChange={(e) => setTargetDoses(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Intake Schedule Time</Label>
              <Input
                type="text"
                placeholder="e.g. 08:00 AM"
                value={medTime}
                onChange={(e) => setMedTime(e.target.value)}
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Recommended Scan Interval</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  {SCAN_INTERVALS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={submitting || !medication.trim() || !interval || !medTime}
            className="h-11 w-full rounded-xl text-sm font-semibold mt-2"
          >
            {submitting ? "Processing Database Write..." : "Submit and Sync to Patient App"}
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        {/* Live Active Tracker layout reflects detailed metadata parameters */}
        <Card className="p-5 border-blue-100 bg-gradient-to-b from-white to-blue-50/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-blue-950 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                Active Patient Medications
              </h3>
              <p className="text-xs text-muted-foreground">Daily checklist telemetry parsed from mobile device</p>
            </div>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {activeMeds.length} Active
            </span>
          </div>

          {activeMeds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-200 bg-white p-6 text-center text-sm text-muted-foreground">
              Patient has no running medications assigned inside their calendar.
            </div>
          ) : (
            <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1">
              {activeMeds.map((med) => (
                <div key={med.id} className="rounded-xl border bg-white p-3 flex justify-between items-center shadow-xs">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5 truncate">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                      {med.name}
                    </div>
                    {/* 🟢 Displays custom time and type metadata parameters on preview cards */}
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 capitalize font-medium">{med.type || "pill"}</span>
                      <span className="flex items-center gap-0.5 text-slate-500">
                        <Clock className="h-3 w-3" /> {med.time || "08:00 AM"}
                      </span>
                    </div>
                  </div>
                  {med.targetDoses !== undefined && (
                    <div className="text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg font-mono">
                      {med.currentDoses}/{med.targetDoses} Doses
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Historical entries log column container */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Treatment Plan History</h3>
              <p className="text-xs text-muted-foreground">Historical milestones provided by medical team</p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
              {history.length} Total
            </span>
          </div>
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
              No historical entries assigned.
            </div>
          ) : (
            <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1">
              {history.slice(0, 6).map((t) => (
                <div key={t.id} className="rounded-xl border bg-secondary/30 p-3">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}