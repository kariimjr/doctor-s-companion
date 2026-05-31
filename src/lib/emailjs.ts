import emailjs from "@emailjs/browser";

const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string | undefined;

let initialized = false;
function ensureInit() {
  if (initialized || !PUBLIC_KEY) return;
  emailjs.init({ publicKey: PUBLIC_KEY });
  initialized = true;
}

export function isEmailJsConfigured() {
  return Boolean(PUBLIC_KEY && SERVICE_ID && TEMPLATE_ID);
}

export async function sendDiagnosisEmail(params: {
  to_email: string;
  to_name: string;
  status: string;
  diagnosis_summary: string;
  doctor_comments: string;
  doctor_name: string;
}) {
  if (!isEmailJsConfigured()) {
    throw new Error("EmailJS env vars missing (VITE_EMAILJS_PUBLIC_KEY / SERVICE_ID / TEMPLATE_ID)");
  }
  ensureInit();
  return emailjs.send(SERVICE_ID!, TEMPLATE_ID!, params);
}
