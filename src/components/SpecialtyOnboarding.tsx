import { useState, useEffect } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { saveDoctor, type DoctorSession } from "@/lib/doctor-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Stethoscope } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const SPECIALTIES = [
  "Oncologist",
  "Dermatologist",
  "General Medicine",
  "Cardiologist",
  "Pediatrician",
  "Neurologist",
  "Radiologist",
  "Psychiatrist",
];

interface DoctorAuthProps {
  onAuthSuccess?: (doctor: DoctorSession) => void;
}

export function DoctorSignIn({ onAuthSuccess }: DoctorAuthProps) {
  const db = getDb();
  
  // 🔄 Mode toggle state: "signin" or "signup"
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  
  // Form input states
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [loading, setLoading] = useState(false);

  // Clear tracking values when changing registration modes to avoid messy payloads
  useEffect(() => {
    setId("");
    setName("");
    setSpecialty("");
  }, [authMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!db) {
      toast.error("Firebase isn't configured.");
      return;
    }

    const normalizedId = id.trim().toLowerCase();
    const cleanName = name.trim();

    if (!normalizedId) {
      toast.error("Please provide a valid Doctor ID.");
      return;
    }

    setLoading(true);

    try {
      const doctorDocRef = doc(db, "doctors", normalizedId);

      if (authMode === "signin") {
        // --- 🔑 LIVE SIGN IN VERIFICATION ---
        const docSnap = await getDoc(doctorDocRef);

        if (!docSnap.exists()) {
          toast.error("Doctor ID not recognized. Click register below to build a profile.");
          setLoading(false);
          return;
        }

        const activeDoctorData = docSnap.data();

        // Push immediate live cloud parameter indicator flag updates 
        await setDoc(
          doctorDocRef, 
          { status: "online", lastSeen: serverTimestamp() }, 
          { merge: true }
        );

        const currentSession: DoctorSession = {
          id: normalizedId,
          name: activeDoctorData.name || normalizedId,
        };

        saveDoctor(currentSession);
        toast.success(`Welcome back, Dr. ${currentSession.name}!`);
        if (onAuthSuccess) onAuthSuccess(currentSession);

      } else {
        // --- 📝 NEW PROFILE CREATION (SIGN UP) ---
        if (!cleanName || !specialty) {
          toast.error("Please choose a specialty field and input your name.");
          setLoading(false);
          return;
        }

        // Avoid accidental profile replacements/overwrites
        const checkSnap = await getDoc(doctorDocRef);
        if (checkSnap.exists()) {
          toast.error("This ID registration matches an existing professional record.");
          setLoading(false);
          return;
        }

        const newProfilePayload = {
          id: normalizedId,
          name: cleanName,
          specialty: specialty,
          status: "online",
          onboardedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        };

        // Write new record block index securely directly down to Firestore DB
        await setDoc(doctorDocRef, newProfilePayload);

        const currentSession: DoctorSession = { id: normalizedId, name: cleanName };
        saveDoctor(currentSession);

        toast.success(`Welcome aboard, Dr. ${cleanName}!`);
        if (onAuthSuccess) onAuthSuccess(currentSession);
      }
    } catch (error) {
      console.error("Authentication exception:", error);
      toast.error("An error occurred during authentication verification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Card className="w-full max-w-md p-8 shadow-sm border bg-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {authMode === "signin" ? "Doctor Portal Sign In" : "Register Doctor Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {authMode === "signin"
              ? "Access your dashboard window to review assigned cases."
              : "Register your specialist profile to initialize clinic features."}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {/* Dynamic field rendering context setup checks */}
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Unique Doctor ID
            </Label>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. ahmed"
              maxLength={64}
              required
            />
          </div>

          {authMode === "signup" && (
            <>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Full Professional Name
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Ahmed Mohamed"
                  required
                />
              </div>

              <div>
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Medical Specialty Field
                </Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select assigned clinical area" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl text-sm font-semibold mt-2">
            {loading ? "Processing transaction..." : authMode === "signin" ? "Go Online" : "Create & Go Online"}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs">
          <span className="text-muted-foreground">
            {authMode === "signin" ? "New to the platform? " : "Already have a profile? "}
          </span>
          <button
            type="button"
            onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
            className="font-semibold text-primary hover:underline ml-0.5"
          >
            {authMode === "signin" ? "Register here" : "Sign in here"}
          </button>
        </div>
      </Card>
    </div>
  );
}