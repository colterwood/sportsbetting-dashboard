"use client";

import { useFormStatus } from "react-dom";

// Shows immediate feedback when the form is submitted (incl. via Enter), so it's
// obvious the password went through while the (currently slow) redirect resolves.
export default function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Enter"}
    </button>
  );
}
