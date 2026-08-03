"use client";

import { useState } from "react";
import { signIn } from "@/lib/authClient";
import { colorLetters, type Run } from "@/lib/colorLetters";
import Loader from "@/components/Loader";

const TITLE: Run[] = [
  ["C  L  I  C  K", "#ff943c"],
  ["      H  E  R  E", "#56a2ff"],
  ["    T  O", "#059669"],
  ["    A  L  L  O  C  A  T  E", "#7e22ce"],
];

export default function LoginCard({ error }: { error?: string }) {
  const [hovering, setHovering] = useState(false);
  // Clicking the title keeps the button up after the pointer leaves.
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const revealed = hovering || pinned;

  return (
    <div
      className="relative z-10 flex items-center justify-center"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {loading ? (
        <Loader size="lg" />
      ) : (
        <>
          {/* Title — visible until the button is revealed */}
          <h1
            onClick={() => setPinned(true)}
            className={`wavy-loader flex gap-0.5 text-2xl font-bold transition-all duration-300 cursor-default select-none ${revealed ? "opacity-0 scale-90" : "opacity-100 scale-100"
              }`}
          >
            {colorLetters(TITLE, 0.02)}
          </h1>

          {/* Google sign-in — appears on hover or click */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${revealed ? "opacity-100 scale-100" : "opacity-0 scale-110 pointer-events-none"
              }`}
          >
            <button
              onClick={() => {
                setLoading(true);
                signIn.social({
                  provider: "google",
                  callbackURL: "/",
                  errorCallbackURL: "/login",
                });
              }}
              className="flex items-center gap-3 rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-400 hover:shadow-md"
            >
              <svg viewBox="0 0 18 18" className="h-5 w-5" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
              </svg>
              <span className="wavy-text">
                {"Sign in with Google".split("").map((ch, i) => (
                  <span key={i} style={{ animationDelay: `${i * 0.04}s` }}>
                    {ch === " " ? " " : ch}
                  </span>
                ))}
              </span>
            </button>
          </div>

          {error && (
            <span className="absolute -bottom-10 left-0 right-0 text-center text-sm text-zinc-500">
              {error === "NOT_ALLOWED"
                ? "that account can't sign in — use your IDinsight email :("
                : "sign-in failed, try again :("}
            </span>
          )}
        </>
      )}
    </div>
  );
}
