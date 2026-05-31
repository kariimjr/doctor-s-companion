import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useDoctorStatus, type DoctorSession } from "@/lib/doctor-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Stethoscope, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface Patient {
  id: string;
  name: string;
  lastMessage?: string;
  updatedAt?: { seconds: number } | null;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp?: { seconds: number } | null;
}

function chatIdFor(doctorId: string, patientId: string) {
  return [`d_${doctorId}`, `p_${patientId}`].sort().join("__");
}

export function ChatDashboard({ doctor }: { doctor: DoctorSession }) {
  const db = getDb();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Subscribe to patients collection
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
            ACTIVE PATIENTS
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {patients.length} in your queue
          </p>
        </div>
        <ScrollArea className="flex-1">
          <ul className="p-2">
            {patients.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                No patients yet. Add documents to <code>/patients</code> in Firestore.
              </li>
            ) : (
              patients.map((p) => (
                <PatientItem
                  key={p.id}
                  patient={p}
                  doctor={doctor}
                  active={p.id === activeId}
                  onSelect={() => setActiveId(p.id)}
                />
              ))
            )}
          </ul>
        </ScrollArea>
      </aside>

      <section className="flex min-h-0 flex-col bg-background">
        {active ? (
          <ChatView doctor={doctor} patient={active} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a patient to start chatting
          </div>
        )}
      </section>
    </div>
  );
}

function PatientItem({
  patient,
  doctor,
  active,
  onSelect,
}: {
  patient: Patient;
  doctor: DoctorSession;
  active: boolean;
  onSelect: () => void;
}) {
  const doctorStatus = useDoctorStatus(doctor.id);
  return (
    <li>
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
          active ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
        )}
      >
        <div className="relative">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              active ? "bg-primary-foreground/15" : "bg-secondary",
            )}
          >
            <UserRound className="h-5 w-5" />
          </div>
          {active && doctorStatus === "online" && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-primary bg-emerald-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{patient.name}</div>
          <div
            className={cn(
              "truncate text-xs",
              active ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {patient.lastMessage ?? "No messages yet"}
          </div>
        </div>
      </button>
    </li>
  );
}

function ChatView({ doctor, patient }: { doctor: DoctorSession; patient: Patient }) {
  const db = getDb();
  const chatId = chatIdFor(doctor.id, patient.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("timestamp", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) })),
      );
    });
    return () => unsub();
  }, [db, chatId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const value = text.trim();
    if (!value || !db) return;
    setText("");
    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: doctor.id,
      text: value,
      timestamp: serverTimestamp(),
    });
    await setDoc(
      doc(db, "patients", patient.id),
      { lastMessage: value, updatedAt: serverTimestamp() },
      { merge: true },
    );
  };

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="text-base font-semibold">{patient.name}</h3>
          <p className="text-xs text-muted-foreground">Patient · {patient.id}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          <Stethoscope className="h-3.5 w-3.5" /> Dr. {doctor.name}
        </span>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Say hello to {patient.name}.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.senderId === doctor.id;
              return (
                <li
                  key={m.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                      mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-secondary text-secondary-foreground",
                    )}
                  >
                    {m.text}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t bg-card px-4 py-3"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message ${patient.name}…`}
          className="h-11 rounded-full bg-secondary/60"
        />
        <Button type="submit" size="icon" className="h-11 w-11 rounded-full" disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}
