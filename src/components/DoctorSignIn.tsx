import { useState } from "react";
import { saveDoctor } from "@/lib/doctor-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Stethoscope } from "lucide-react";

export function DoctorSignIn() {
  const [name, setName] = useState("");
  const [id, setId] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Doctor Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to go online and review patient cases.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !id.trim()) return;
            saveDoctor({ id: id.trim(), name: name.trim() });
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Full name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Doe"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Doctor ID
            </label>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="dr_jdoe"
              required
            />
          </div>
          <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold">
            Go online
          </Button>
        </form>
      </Card>
    </div>
  );
}
