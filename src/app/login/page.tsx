"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import LoginBackground from "@/components/LoginBackground";

export default function LoginPage() {
  const [hovering, setHovering] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<"auth" | "server" | null>(null);
  const [loading, setLoading] = useState(false);
  const [bounce, setBounce] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (hovering && inputRef.current) {
      inputRef.current.focus();
    }
  }, [hovering]);

  const tryLogin = async (value: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        setError(res.status === 401 ? "auth" : "server");
        setLoading(false);
      }
    } catch {
      setError("server");
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError(null);
    setBounce(false);
    requestAnimationFrame(() => setBounce(true));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && password) {
      tryLogin(password);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white overflow-hidden">
      <LoginBackground />
      <div
        className="relative z-10 flex items-center justify-center"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => {
          if (!password) setHovering(false);
        }}
      >
        {loading ? (
          <div className="wavy-loader flex gap-1.5 text-2xl font-black">
            {["L", "O", "A", "D", "I", "N", "G"].map((ch, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.1}s` }}>{ch}</span>
            ))}
          </div>
        ) : (
          <>
            {/* Title — visible when not hovering */}
            <h1
              className={`wavy-loader flex gap-0.5 text-2xl font-bold text-zinc-900 transition-all duration-300 cursor-default select-none ${hovering ? "opacity-0 scale-90" : "opacity-100 scale-100"
                }`}
            >
              {"C  L  I  C  K      H  E  R  E    T  O    A  L  L  O  C  A  T  E".split("").map((ch, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.02}s` }}>{ch}</span>
              ))}
            </h1>

            {/* Password input — appears on hover */}
            <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className={`absolute inset-0 w-full text-center text-2xl font-bold tracking-widest bg-transparent outline-none transition-all duration-300 ${
            hovering ? "opacity-100 scale-100" : "opacity-0 scale-110 pointer-events-none"
          } ${error === "auth" ? "text-rose-800 animate-bounce [animation-duration:0.3s]" : "text-zinc-900"}`}
          placeholder=""
        />
            {error === "server" && (
              <span className="absolute -bottom-8 left-0 right-0 text-center text-sm text-zinc-500">
                unexpected error :(
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
