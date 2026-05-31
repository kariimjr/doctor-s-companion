import { useState, useEffect, useRef } from "react";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { saveDoctor, type DoctorSession } from "@/lib/doctor-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Stethoscope, Camera } from "lucide-react";
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

// Fallback high-quality specialist placeholder image matching your layout asset rules
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=400&auto=format&fit=crop";

interface DoctorAuthProps {
  onAuthSuccess?: (doctor: DoctorSession) => void;
}

export function DoctorSignIn({ onAuthSuccess }: DoctorAuthProps) {
  const db = getDb();
  const auth = getAuth();
  
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  
  // Form input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [avatarString, setAvatarString] = useState<string>(""); 
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset local state layers on workflow mode switch
  useEffect(() => {
    setEmail("");
    setPassword("");
    setName("");
    setSpecialty("");
    setAvatarString("");
  }, [authMode]);

  // 📸 Convert selected local portrait asset file to high-density Base64 text payload
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit client-side payload dimensions to protect free-tier firestore document size limits (Max 1MB string payload safely)
    if (file.size > 1024 * 1024) {
      toast.error("Profile portrait asset size must be under 1MB.");
      return;
    }

    const fileReader = new FileReader();
    fileReader.onloadend = () => {
      if (typeof fileReader.result === "string") {
        setAvatarString(fileReader.result);
        toast.success("Profile portrait attached successfully.");
      }
    };
    fileReader.readAsDataURL(file);
  };

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

        const doctorDocRef = doc(db, "doctors", user.uid);
        const docSnap = await getDoc(doctorDocRef);

        if (!docSnap.exists()) {
          toast.error("Doctor profile not found in database. Contact admin.");
          setLoading(false);
          return;
        }

        const activeDoctorData = docSnap.data();

        // Push immediate live online status parameters down 
        await setDoc(
          doctorDocRef, 
          { status: "online", lastSeen: serverTimestamp() }, 
          { merge: true }
        );

        const currentSession: DoctorSession = {
          id: user.uid, 
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

        // Create credential profile inside global Firebase auth context mapping
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;

        // Use custom uploaded image string block layout data if present, else trigger default medical network fallback asset URL string
        const finalAvatarPayload = avatarString || DEFAULT_AVATAR;

        // Save structured parameters into custom /doctors collections document references mapped via UID
        const doctorDocRef = doc(db, "doctors", user.uid);
        const newProfilePayload = {
          id: user.uid,
          email: cleanEmail,
          name: name.trim(),
          specialty: specialty,
          avatar: finalAvatarPayload, // 🎯 Extracted string parameter ready to stream directly to your Flutter App view layout
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
      const errorMessage = error.message.replace("Firebase: ", "").replace(/\(auth.*\)\./, "");
      toast.error(errorMessage || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
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
              {/* 📸 INTERACTIVE AVATAR SELECTION COMPONENT PORT */}
              <div className="flex flex-col items-center justify-center space-y-2 pb-2">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border border-input bg-secondary hover:bg-secondary/80 transition-all overflow-hidden group shadow-inner"
                >
                  {avatarString ? (
                    <img 
                      src={avatarString} 
                      alt="Avatar preview" 
                      className="h-full w-full object-cover object-top" 
                    />
                  ) : (
                    <div className="text-muted-foreground flex flex-col items-center justify-center p-2 text-center">
                      <Camera className="h-6 w-6 stroke-[1.5] mb-1" />
                      <span className="text-[10px] font-medium tracking-tight">Add Photo</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[11px] font-semibold text-white">Upload</span>
                  </div>
                </div>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <p className="text-[11px] text-muted-foreground">Optional professional headshot portrait</p>
              </div>

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