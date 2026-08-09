"use client";

import SpinningCubeIcon from "./SpinningCubeIcon";

/**
 * Where the cube logo sits. This is the one place to change it.
 *
 * The values are CSS offsets in pixels from the named viewport edges, so:
 *   { bottom: 24, right: 24 }  bottom-right corner (current)
 *   { top: 24, right: 24 }     top-right
 *   { bottom: 24, left: 24 }   bottom-left
 *
 * Use exactly one of top/bottom and one of left/right. Nudge the numbers to
 * move it further from or closer to the corner. It clears the notepad, which
 * occupies 80–530px in from the right edge along the bottom.
 */
const TRIGGER_POSITION: React.CSSProperties = {
  bottom: 24,
  right: 24,
};

export default function CubeTrigger({
  hidden,
  onOpen,
}: {
  hidden: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      aria-label="Cube mode"
      title="the cube"
      className="cube-trigger fixed z-20 p-1 transition-opacity duration-300 hover:cursor-pointer"
      style={{
        ...TRIGGER_POSITION,
        // Hands off to the big cube, which grows from this exact spot.
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : undefined,
      }}
    >
      <SpinningCubeIcon />
    </button>
  );
}
