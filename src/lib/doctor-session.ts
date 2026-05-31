import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./firebase";

const KEY = "doctor_session_v1";

export interface DoctorSession {
  id: string;
  name: string;
}

export function getStoredDoctor(): DoctorSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DoctorSession) : null;
  } catch {
    return null;
  }
}

export function saveDoctor(session: DoctorSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("doctor-session-changed"));
}

export function clearDoctor() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("doctor-session-changed"));
}

export function useDoctorSession() {
  const [doctor, setDoctor] = useState<DoctorSession | null>(null);
  useEffect(() => {
    setDoctor(getStoredDoctor());
    const h = () => setDoctor(getStoredDoctor());
    window.addEventListener("doctor-session-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("doctor-session-changed", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return doctor;
}

/** Marks the doctor online while mounted; flips to offline on unmount/unload. */
export function usePresence(doctor: DoctorSession | null) {
  useEffect(() => {
    const db = getDb();
    if (!db || !doctor) return;
    const ref = doc(db, "doctors", doctor.id);
    const setStatus = (status: "online" | "offline") =>
      setDoc(
        ref,
        { id: doctor.id, name: doctor.name, status, lastSeen: serverTimestamp() },
        { merge: true },
      );
    setStatus("online");
    const onUnload = () => setStatus("offline");
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      setStatus("offline");
    };
  }, [doctor]);
}

export function useDoctorStatus(doctorId: string | undefined) {
  const [status, setStatus] = useState<"online" | "offline" | "unknown">("unknown");
  useEffect(() => {
    const db = getDb();
    if (!db || !doctorId) return;
    const unsub = onSnapshot(doc(db, "doctors", doctorId), (snap) => {
      const data = snap.data() as { status?: string } | undefined;
      setStatus((data?.status as "online" | "offline") ?? "offline");
    });
    return () => unsub();
  }, [doctorId]);
  return status;
}
