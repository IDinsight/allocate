"use client";

const FACE_SIZE = 18;
const HALF = FACE_SIZE / 2;

// Six faces of a CSS-3D cube. Kept dependency-free on purpose: the heavy
// three.js scene is lazy-loaded, so the header icon must not pull it in.
const FACES: { transform: string; bg: string }[] = [
  { transform: `translateZ(${HALF}px)`, bg: "#c4b5fd" },
  { transform: `rotateY(180deg) translateZ(${HALF}px)`, bg: "#a5b4fc" },
  { transform: `rotateY(90deg) translateZ(${HALF}px)`, bg: "#6ee7b7" },
  { transform: `rotateY(-90deg) translateZ(${HALF}px)`, bg: "#5eead4" },
  { transform: `rotateX(90deg) translateZ(${HALF}px)`, bg: "#fcd34d" },
  { transform: `rotateX(-90deg) translateZ(${HALF}px)`, bg: "#fda4af" },
];

export default function SpinningCubeIcon() {
  return (
    <span
      className="block"
      style={{ width: FACE_SIZE, height: FACE_SIZE, perspective: 90 }}
    >
      <span
        className="cube-icon-spin block relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {FACES.map((f, i) => (
          <span
            key={i}
            className="absolute inset-0 border-2 border-zinc-900 rounded-[2px]"
            style={{ transform: f.transform, background: f.bg }}
          />
        ))}
      </span>
    </span>
  );
}
