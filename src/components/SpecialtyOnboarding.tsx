import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { DoctorSession } from "@/lib/doctor-session";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function SpecialtyOnboarding({
  open,
  doctor,
}: {
  open: boolean;
  doctor: DoctorSession;
}) {
  const [specialty, setSpecialty] = useState("");
  const [doctorIdInput, setDoctorIdInput] = useState(doctor.id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDoctorIdInput(doctor.id);
  }, [open, doctor.id]);

  const submit = async () => {
    const db = getDb();
    if (!db) {
      toast.error("Firebase isn't configured.");
      return;
    }
    const trimmedId = doctorIdInput.trim();
    if (!specialty || !trimmedId) {
      toast.error("Please pick a specialty and confirm your Doctor ID.");
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, "doctors", trimmedId),
        {
          id: trimmedId,
          name: doctor.name,
          specialty,
          status: "online",
          onboardedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        },
        { merge: true },
      );
      toast.success(`Welcome, Dr. ${doctor.name} (${specialty})`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>
            We need a few details before you can start reviewing cases.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="onb-id" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Unique Doctor ID
            </Label>
            <Input
              id="onb-id"
              value={doctorIdInput}
              onChange={(e) => setDoctorIdInput(e.target.value)}
              placeholder="e.g. dr_jdoe_2024"
              maxLength={64}
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Specialty
            </Label>
            <Select value={specialty} onValueChange={setSpecialty}>
              <SelectTrigger>
                <SelectValue placeholder="Select your specialty" />
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
        </div>

        <Button
          onClick={submit}
          disabled={saving || !specialty || !doctorIdInput.trim()}
          className="h-11 w-full rounded-xl text-sm font-semibold"
        >
          {saving ? "Saving…" : "Save & continue"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
