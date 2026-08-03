"use client";

import { colorLetters, type Run } from "@/lib/colorLetters";

const LOADING: Run[] = [
  ["LO", "#7e22ce"],
  ["ADI", "#1a1a1a"],
  ["NG", "#059669"],
];

// Bouncing LOADING wordmark. Callers position it; this is just the word.
export default function Loader({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <div
      className={`wavy-loader flex gap-1.5 font-black ${size === "lg" ? "text-2xl" : "text-md"}`}
    >
      {colorLetters(LOADING, 0.1)}
    </div>
  );
}
