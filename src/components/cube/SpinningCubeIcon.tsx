"use client";

import { AXIS_COLORS } from "./axisColors";

const SIZE = 20;
const HALF = SIZE / 2;
const STROKE = `1.5px solid`;

/**
 * A wireframe cube in CSS 3D — no dependency, so the heavy three.js scene stays
 * lazily loaded behind the click.
 *
 * Only the twelve outer edges show. Each face is transparent and contributes
 * four bordered edges; a face's own top/bottom and left/right run along
 * different world axes, so each pair takes that axis's colour and the finished
 * cube is coloured exactly like the real one.
 */
const FACES: { transform: string; alongTopBottom: string; alongSides: string }[] = [
  // Front / back: horizontal edges run along the project axis, vertical along teammate.
  { transform: `translateZ(${HALF}px)`, alongTopBottom: "project", alongSides: "teammate" },
  { transform: `rotateY(180deg) translateZ(${HALF}px)`, alongTopBottom: "project", alongSides: "teammate" },
  // Left / right: horizontal edges run along time, vertical along teammate.
  { transform: `rotateY(90deg) translateZ(${HALF}px)`, alongTopBottom: "time", alongSides: "teammate" },
  { transform: `rotateY(-90deg) translateZ(${HALF}px)`, alongTopBottom: "time", alongSides: "teammate" },
  // Top / bottom: horizontal edges run along project, vertical along time.
  { transform: `rotateX(90deg) translateZ(${HALF}px)`, alongTopBottom: "project", alongSides: "time" },
  { transform: `rotateX(-90deg) translateZ(${HALF}px)`, alongTopBottom: "project", alongSides: "time" },
];

export default function SpinningCubeIcon() {
  return (
    // No `perspective`: a flat projection is what makes the three visible faces
    // foreshorten equally, i.e. a true isometric view rather than a tapered one.
    <span className="block" style={{ width: SIZE, height: SIZE }}>
      <span
        className="cube-icon block relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {FACES.map((f, i) => {
          const h = AXIS_COLORS[f.alongTopBottom as keyof typeof AXIS_COLORS];
          const v = AXIS_COLORS[f.alongSides as keyof typeof AXIS_COLORS];
          return (
            <span
              key={i}
              className="absolute inset-0"
              style={{
                transform: f.transform,
                borderTop: `${STROKE} ${h}`,
                borderBottom: `${STROKE} ${h}`,
                borderLeft: `${STROKE} ${v}`,
                borderRight: `${STROKE} ${v}`,
              }}
            />
          );
        })}
      </span>
    </span>
  );
}
