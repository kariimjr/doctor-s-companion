import { useState, useEffect } from "react";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
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
  const auth = getAuth(); // 🔐 Initialize Real Firebase Auth
  
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  
  // Form input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [loading, setLoading] = useState(false);

  // Clear tracking values when changing registration modes
  useEffect(() => {
    setEmail("");
    setPassword("");
    setName("");
    setSpecialty("");
  }, [authMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!db || !auth) {
      toast.error("Firebase is not configured properly.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanEmail || !password) {
      toast.error("Please provide both email and password.");
      return;
    }

    setLoading(true);

    try {
      if (authMode === "signin") {
        // --- 🔑 SECURE SIGN IN ---
        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;

        // Fetch the doctor's profile data from Firestore using their secure Auth UID
        const doctorDocRef = doc(db, "doctors", user.uid);
        const docSnap = await getDoc(doctorDocRef);

        if (!docSnap.exists()) {
          toast.error("Doctor profile not found in database. Contact admin.");
          setLoading(false);
          return;
        }

        const activeDoctorData = docSnap.data();

        // Push immediate live online status
        await setDoc(
          doctorDocRef, 
          { status: "online", lastSeen: serverTimestamp() }, 
          { merge: true }
        );

        const currentSession: DoctorSession = {
          id: user.uid, // 🎯 Now using the secure 28-character Firebase UID
          name: activeDoctorData.name || cleanEmail,
        };

        saveDoctor(currentSession);
        toast.success(`Welcome back, Dr. ${currentSession.name}!`);
        if (onAuthSuccess) onAuthSuccess(currentSession);

      } else {
        // --- 📝 SECURE ACCOUNT CREATION ---
        if (!name.trim() || !specialty) {
          toast.error("Please complete your name and specialty field.");
          setLoading(false);
          return;
        }

        // Create the user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;

        // Create their database profile using their new secure Auth UID
        const doctorDocRef = doc(db, "doctors", user.uid);
        const newProfilePayload = {
          id: user.uid,
          email: cleanEmail,
          name: name.trim(),
          specialty: specialty,
          status: "online",
          onboardedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        };

        await setDoc(doctorDocRef, newProfilePayload);

        const currentSession: DoctorSession = { id: user.uid, name: name.trim() };
        saveDoctor(currentSession);

        toast.success(`Account created! Welcome, Dr. ${name.trim()}!`);
        if (onAuthSuccess) onAuthSuccess(currentSession);
      }
    } catch (error: any) {
      console.error("Authentication exception:", error);
      // Clean up Firebase error messages for the user
      const errorMessage = error.message.replace("Firebase: ", "").replace(/\(auth.*\)\./, "");
      toast.error(errorMessage || "Authentication failed. Please try again.");
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
            {authMode === "signin" ? "Doctor Portal Sign In" : "Register Secure Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {authMode === "signin"
              ? "Sign in with your credentials to access cases."
              : "Register your specialist profile to initialize clinic features."}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
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
                  required={authMode === "signup"}
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

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Email Address
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@hospital.com"
              required
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Password
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl text-sm font-semibold mt-2">
            {loading ? "Authenticating..." : authMode === "signin" ? "Secure Sign In" : "Create Account"}
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