"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { CubeData } from "./useCubeData";
import { AXIS_COLORS, type Axis } from "./axisColors";

// ---------------------------------------------------------------- geometry

// Every axis is drawn to the same span, so the lattice always reads as a cube
// no matter how lopsided the project/teammate/week counts are.
const SPAN = 10;
/** Half-width of the border box. Flush with the lattice: cells fill exactly
 *  SPAN, so the border traces the cube's real boundary with no offset. */
const EDGE = SPAN / 2;
/** The four parallel edges of any axis, as ±1 sign pairs for the other two. */
const EDGE_CORNERS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const AXES: Axis[] = ["project", "teammate", "time"];

// ------------------------------------------------------------------- looks

/** Border thickness in pixels. Raw GL lines are stuck at 1px on most platforms,
 *  so the border is drawn as mesh geometry (drei's Line) to honour this. */
const BORDER_WIDTH = 3;
/** Degrees the project/teammate name tags slant down from horizontal. */
const NAME_SLANT = 30;
/** How far outside the border the tick labels sit. */
const LABEL_PAD = 0.3;
const VOXEL_COLOR = new THREE.Color("#a78bfa"); // light purple, uniform for now
const WHITE = new THREE.Color("#ffffff");

// ------------------------------------------------------------------ camera

/** Resting camera zoom, and the near-nothing it grows from and shrinks back to. */
const BASE_ZOOM = 46;
const COLLAPSED_ZOOM = BASE_ZOOM * 0;
/** How far the camera sits from the middle when squared up to a face. */
const FACE_VIEW_DIST = 40;
/** The screen-right direction that makes time read past-to-future. */
const TIME_RIGHT = new THREE.Vector3(0, 0, -1);
/** Radians per second the view rolls when the rotate button is pressed. */
const ROLL_SPEED = Math.PI * 1.6;

// ------------------------------------------------------- label layout: when

/** Seconds the camera must sit still before the labels re-lay themselves out. */
const SETTLE_SECONDS = 0;
/** While the camera keeps moving, re-lay out only after this much rotation. */
const RESTEP_RADIANS = (18 * Math.PI) / 180;
/** ...or after the zoom changes by this fraction. */
const RESTEP_ZOOM = 0.2;
/**
 * The cube must project to at least this many pixels corner to corner before
 * the labels are placed. The camera starts at almost no zoom for the grow-out
 * animation, where the projection is degenerate — every tick lands on the same
 * point, so edges cannot be scored and the tick spacing rounds to nonsense.
 */
const MIN_LAYOUT_SPAN_PX = 40;

// ------------------------------------------------------- label layout: what

/** An axis pointing near-straight at the camera collapses to a point — hide it. */
const FACE_ON = 0.985;
/** How far back past FACE_ON a hidden axis must come before it reappears. */
const FACE_ON_RELEASE = 0.004;
/**
 * Screen room one tick needs, in pixels. An axis seen near edge-on squeezes all
 * of its ticks into a few pixels, so the thinning has to come from the projected
 * spacing rather than a fixed count.
 */
const LABEL_PITCH_PX = 18;

// Each per-axis choice needs a deadband, or it flickers wherever two options
// are momentarily tied. These are the widths of those bands.

/** Fractional margin by which one screen run must beat the other to flip an
 *  axis between horizontal and vertical treatment. */
const ORIENTATION_HYSTERESIS = 0.15;
/** How much slack must open up before a thinned-out axis shows more labels. */
const STRIDE_RELEASE = 0.25;
/**
 * How much better a rival edge must look before the ticks jump to it. Without
 * it the swap happens the instant two edges draw level, so a nudge either way
 * makes the ticks flip sides.
 *
 * Units are normalised device coords, where the viewport spans -1..1 — so this
 * is "the rival must be this much further left/down, as a fraction of half the
 * screen":
 *
 *   0.00  flips the moment they draw level (twitchy)
 *   0.05  ~2.5% of the viewport
 *   0.40  very sticky; ticks can sit well past the near corner
 *
 * Tune to taste. Above ~0.8 an edge may never give up its ticks at all.
 */
const EDGE_FLIP_THRESHOLD = 0;

/** Placeholder until the first real layout lands; see Layout.ready. */
const INITIAL_PLACEMENT: Placement = { a: -1, b: -1, horizontal: true, stride: 1 };

/** Width of one cell on an axis holding `count` entries. Every axis fills the
 *  same SPAN, so the lattice is always a true cube. */
function axisStep(count: number): number {
  return SPAN / Math.max(1, count);
}

/** Centre of cell `index`. Cells are inset by half a step so the outer ones end
 *  flush with the SPAN rather than hanging half a cell past it. */
function axisPosition(index: number, count: number): number {
  return (index + 0.5) * axisStep(count) - SPAN / 2;
}

/**
 * An opaque white box filling the lattice, drawn back-faces-only so it sits
 * behind every cell and its silhouette is exactly the cube's outline. Multiply
 * blending darkens what is behind it, so without this the cells have nothing to
 * register against and the page shows straight through.
 */
function Backdrop() {
  return (
    <mesh renderOrder={-1}>
      <boxGeometry args={[SPAN, SPAN, SPAN]} />
      <meshBasicMaterial color="#ffffff" side={THREE.BackSide} />
    </mesh>
  );
}

function Voxels({ data }: { data: CubeData }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { voxels, dims } = data;

  // Each axis is spaced independently, so a cube-shaped voxel would leave gaps
  // along whichever axis has the fewest entries. Scale per axis instead: cells
  // meet exactly, and a full stack reads as genuinely solid.
  // A hairline short of the full step: flush enough to read as solid, but the
  // seams keep individual cells legible instead of fusing into one mass.
  const scale = useMemo(
    () =>
      new THREE.Vector3(
        axisStep(dims.x),
        axisStep(dims.y),
        axisStep(dims.z)
      ).multiplyScalar(0.97),
    [dims]
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const c = new THREE.Color();
    voxels.forEach((v, i) => {
      pos.set(
        axisPosition(v.x, dims.x),
        axisPosition(v.y, dims.y),
        axisPosition(v.z, dims.z)
      );
      m.compose(pos, quat, scale);
      mesh.setMatrixAt(i, m);
      // Multiply blending accumulates along the view ray by darkening the white
      // page behind it, so a teammate-week totalling 100 lands on exactly the
      // full purple — the allocations add up to a solid cell.
      // Clamped: nothing stops a single allocation exceeding 100, and lerp
      // extrapolates past its endpoint rather than saturating, which would
      // drive channels negative and render the cell as garbage.
      c.copy(WHITE).lerp(VOXEL_COLOR, Math.min(1, v.fraction / 100));
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = voxels.length;
  }, [voxels, dims, scale]);

  if (voxels.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        transparent
        premultipliedAlpha
        depthWrite={false}
        blending={THREE.MultiplyBlending}
      />
    </instancedMesh>
  );
}

/**
 * A point on the cube's frame. `a` and `b` are the ±1 signs of the two axes
 * this one does not run along; `v` is the distance along it.
 */
function framePoint(axis: Axis, a: number, b: number, v: number, pad = 0): [number, number, number] {
  const p = EDGE + pad;
  return axis === "project" ? [v, a * p, b * p]
    : axis === "teammate" ? [a * p, v, b * p]
      : [a * p, b * p, v];
}

type Placement = {
  /** Signs of the two other axes, picking which of the four parallel edges carries the ticks. */
  a: number;
  b: number;
  /** True when this axis currently runs more across the screen than up it. */
  horizontal: boolean;
  /** Show every Nth tick, from how much room they have on screen. */
  stride: number;
};

type Layout = {
  placement: Record<Axis, Placement>;
  hidden: Axis | null;
  /** False until a layout has been computed against a usable projection. */
  ready: boolean;
};

/**
 * Chooses, per axis, which edge carries the tick labels: an axis reading
 * horizontally on screen puts them along its lowest edge, one reading
 * vertically along its leftmost. Which is which depends entirely on the camera,
 * so it cannot be fixed per axis.
 *
 * The layout is deliberately NOT recomputed every frame. All of its inputs —
 * edge scores, projected tick spacing, axis direction — vary continuously as
 * the cube turns, so a per-frame answer means labels appearing, vanishing and
 * hopping edges 60 times a second. Hysteresis alone cannot fix that; it only
 * narrows the band in which it happens.
 *
 * Instead the layout is committed at rest, or in discrete steps during a long
 * movement. Between commits the labels hold still and simply ride along with
 * the cube, which is what makes them readable while it moves.
 */
function useAxisLayout(dims: CubeData["dims"]): Layout {
  const [layout, setLayout] = useState<Layout>({
    placement: { project: INITIAL_PLACEMENT, teammate: INITIAL_PLACEMENT, time: INITIAL_PLACEMENT },
    hidden: null,
    ready: false,
  });
  const ref = useRef(layout);
  const scratch = useRef(new THREE.Vector3()).current;
  // View at the last commit, and when the camera last actually moved.
  const commitDir = useRef(new THREE.Vector3(1, 1, 1).normalize());
  const commitZoom = useRef(0);
  const lastDir = useRef(new THREE.Vector3());
  const lastZoom = useRef(0);
  const movedAt = useRef(-Infinity);
  const primed = useRef(false);

  useFrame(({ camera, size, clock }) => {
    const cur = ref.current;
    const now = clock.getElapsedTime();
    const dir = camera.position.clone().normalize();
    const zoom = "zoom" in camera ? camera.zoom : 1;

    if (dir.angleTo(lastDir.current) > 1e-4 || zoom !== lastZoom.current) {
      movedAt.current = now;
      lastDir.current.copy(dir);
      lastZoom.current = zoom;
    }

    const settled = now - movedAt.current >= SETTLE_SECONDS;
    const turned = dir.angleTo(commitDir.current) >= RESTEP_RADIANS;
    const zoomed = Math.abs(zoom / (commitZoom.current || zoom) - 1) >= RESTEP_ZOOM;
    // Hold the current layout until the view has come to rest, or has moved far
    // enough that holding it would leave labels on the wrong side.
    if (primed.current && !settled && !turned && !zoomed) return;
    primed.current = true;
    commitDir.current.copy(dir);
    commitZoom.current = zoom;
    // Two thresholds, so an axis sitting right on the limit does not blink in
    // and out: it takes more to hide an axis than to bring it back.
    const facing = (v: number) =>
      Math.abs(v) > (cur.hidden ? FACE_ON - FACE_ON_RELEASE : FACE_ON);
    const hidden: Axis | null =
      facing(dir.x) ? "project"
        : facing(dir.y) ? "teammate"
          : facing(dir.z) ? "time"
            : null;

    // Screen position in pixels, origin at the viewport centre, y up.
    const screen = (p: [number, number, number]) => {
      scratch.set(...p).project(camera);
      return { x: (scratch.x * size.width) / 2, y: (scratch.y * size.height) / 2 };
    };

    // Nothing can be decided from a degenerate projection, and a half-computed
    // answer is what makes the labels flash onto the wrong edges on open.
    const near = screen([-EDGE, -EDGE, -EDGE]);
    const far = screen([EDGE, EDGE, EDGE]);
    const spanPx = Math.hypot(far.x - near.x, far.y - near.y);
    if (!Number.isFinite(spanPx) || spanPx < MIN_LAYOUT_SPAN_PX) return;

    const count: Record<Axis, number> = { project: dims.x, teammate: dims.y, time: dims.z };
    const placement = {} as Record<Axis, Placement>;

    for (const axis of AXES) {
      const prev = cur.placement[axis];

      // Direction is the same for all four parallel edges, so any one will do.
      const from = screen(framePoint(axis, 1, 1, -EDGE));
      const to = screen(framePoint(axis, 1, 1, EDGE));
      const runX = Math.abs(to.x - from.x);
      const runY = Math.abs(to.y - from.y);
      // An axis at roughly 45° has runX ≈ runY, so a bare comparison flips every
      // frame. Require a clear win to change, otherwise keep what we had.
      const horizontal = runX > runY * (1 + ORIENTATION_HYSTERESIS) ? true
        : runY > runX * (1 + ORIENTATION_HYSTERESIS) ? false
          : prev.horizontal;

      // Horizontal axes want the bottom-most edge, vertical ones the leftmost.
      const score = (a: number, b: number) => {
        const mid = screen(framePoint(axis, a, b, 0));
        return horizontal ? mid.y : mid.x;
      };

      // Rivals are measured against the incumbent plus a margin. The incumbent
      // is skipped in the loop — scoring it would overwrite the margin with its
      // own bare score and cancel the hysteresis entirely.
      let { a, b } = prev;
      const bias = (EDGE_FLIP_THRESHOLD * (horizontal ? size.height : size.width)) / 2;
      let best = score(a, b) + bias;
      for (const [ca, cb] of EDGE_CORNERS) {
        if (ca === prev.a && cb === prev.b) continue;
        const s = score(ca, cb);
        if (s < best) {
          best = s;
          a = ca;
          b = cb;
        }
      }

      // Pixel gap between neighbouring ticks, which collapses near edge-on.
      const n0 = count[axis];
      let stride = prev.stride;
      if (n0 > 1) {
        const p0 = screen(framePoint(axis, a, b, axisPosition(0, n0)));
        const p1 = screen(framePoint(axis, a, b, axisPosition(1, n0)));
        const gap = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        // Capped at the tick count: beyond that it is all the same one label,
        // and an unbounded value takes an age to walk back down.
        const ideal = Math.min(n0, Math.max(1, Math.ceil(LABEL_PITCH_PX / Math.max(gap, 0.001))));
        // Thin out immediately when labels would touch. Go back the other way
        // only once there is comfortably room, so a gap parked on a stride
        // boundary cannot flip back and forth — but when it does go, it goes
        // straight to the right value rather than creeping down one per frame.
        if (ideal > stride) stride = ideal;
        else if (ideal < stride && gap * ideal > LABEL_PITCH_PX * (1 + STRIDE_RELEASE)) {
          stride = ideal;
        }
      } else {
        stride = 1;
      }

      placement[axis] = { a, b, horizontal, stride };
    }

    const changed = !cur.ready || hidden !== cur.hidden || AXES.some((axis) => {
      const p = placement[axis], q = cur.placement[axis];
      return p.a !== q.a || p.b !== q.b || p.horizontal !== q.horizontal || p.stride !== q.stride;
    });
    if (changed) {
      const next = { placement, hidden, ready: true };
      ref.current = next;
      setLayout(next);
    }
  });

  return layout;
}

/**
 * Grows the cube out of the header logo on open and shrinks it back on close.
 *
 * Done with the camera rather than a CSS scale on the canvas: the canvas takes
 * its resolution from its bounding box, so scaling it in CSS would have it
 * measure the collapsed box and never recover. Zooming leaves the box alone.
 */
function IntroZoom({ closing }: { closing: boolean }) {
  const settled = useRef(false);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.OrthographicCamera;
    // Once the intro has landed, leave the zoom alone — it belongs to the user's
    // scroll wheel from then on.
    if (!closing && settled.current) return;
    const target = closing ? COLLAPSED_ZOOM : BASE_ZOOM;
    // Collapses much harder than it grows, to match the quicker close.
    cam.zoom = THREE.MathUtils.damp(cam.zoom, target, closing ? 22 : 7, delta);
    if (!closing && Math.abs(cam.zoom - target) < 0.5) {
      cam.zoom = target;
      settled.current = true;
    }
    cam.updateProjectionMatrix();
  });

  return null;
}

/** An invisible box the size of the lattice, so a tap can be attributed to a
 *  face. Front-facing, so it is hit before anything inside it. */
function FacePicker({ onPick }: { onPick: (normal: [number, number, number]) => void }) {
  return (
    <mesh
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const n = e.face?.normal;
        // The box is never rotated, so its local normals are already world ones.
        if (n) onPick([n.x, n.y, n.z]);
      }}
    >
      <boxGeometry args={[SPAN, SPAN, SPAN]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
    </mesh>
  );
}

/**
 * Squares the camera up to a tapped face, and rolls the view on request.
 *
 * Writing camera.position and camera.up directly is safe: OrbitControls derives
 * its spherical coordinates from the camera's current state on every update, so
 * it picks these moves up rather than fighting them.
 */
function CameraRig({
  facing,
  rollTicks,
  onArrived,
}: {
  facing: [number, number, number] | null;
  rollTicks: number;
  onArrived: () => void;
}) {
  const target = useRef(new THREE.Vector3());
  const targetUp = useRef(new THREE.Vector3(0, 1, 0));
  const pendingRoll = useRef(0);
  const lastTicks = useRef(rollTicks);

  useEffect(() => {
    if (!facing) return;
    target.current.set(...facing).multiplyScalar(FACE_VIEW_DIST);
    // Free rotation leaves `up` wherever the drag (and any roll) left it, so a
    // face view inherits that tilt and there is no way to straighten it. Every
    // face therefore gets an explicit upright.
    //
    // Whenever the time axis is on screen it should run along the bottom, past
    // on the left — which means screen-right must point down -z, since the weeks
    // are laid out newest-first (see useCubeData). Right, forward and up are
    // mutually perpendicular, so that pins `up` exactly: up = normal × right.
    // On the two faces looking straight down the time axis there is no time to
    // orient, so those keep world up.
    const n = new THREE.Vector3(...facing);
    const facesTime = Math.abs(n.z) > Math.abs(n.x) && Math.abs(n.z) > Math.abs(n.y);
    targetUp.current.copy(
      facesTime
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3().crossVectors(n, TIME_RIGHT).normalize()
    );
  }, [facing]);

  useFrame(({ camera }, delta) => {
    if (rollTicks !== lastTicks.current) {
      pendingRoll.current += (rollTicks - lastTicks.current) * (Math.PI / 2);
      lastTicks.current = rollTicks;
    }

    if (pendingRoll.current > 1e-4) {
      const step = Math.min(pendingRoll.current, delta * ROLL_SPEED);
      // Turning `up` anticlockwise about the view axis turns the picture
      // clockwise — the camera and its image rotate opposite ways.
      camera.up.applyAxisAngle(camera.position.clone().normalize(), step);
      pendingRoll.current -= step;
      camera.lookAt(0, 0, 0);
    }

    if (!facing) return;
    const t = 1 - Math.exp(-8 * delta);
    camera.position.lerp(target.current, t);
    // An exactly upside-down `up` lerps through the zero vector, which
    // normalizes to NaN — tip it off the axis first so it has a way round.
    if (camera.up.dot(targetUp.current) < -0.999) {
      const side = new THREE.Vector3()
        .crossVectors(targetUp.current, target.current)
        .normalize()
        .multiplyScalar(0.02);
      camera.up.add(side).normalize();
    }
    // Straighten alongside the move, so the view arrives square rather than
    // keeping whatever tilt the last drag left behind.
    camera.up.lerp(targetUp.current, t).normalize();
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(target.current) < 0.05) {
      camera.position.copy(target.current);
      camera.up.copy(targetUp.current);
      camera.lookAt(0, 0, 0);
      onArrived();
    }
  });

  return null;
}

/** The coloured border on all twelve edges, plus a tick label per row/column. */
function AxisFurniture({ data }: { data: CubeData }) {
  const { projectNames, teammateNames, weekLabels, dims } = data;
  const { placement, hidden, ready } = useAxisLayout(dims);

  // Fixed geometry — only the ticks move with the camera.
  const border = useMemo(
    () =>
      AXES.map((axis) => ({
        axis,
        points: EDGE_CORNERS.flatMap(([a, b]) => [
          framePoint(axis, a, b, -EDGE),
          framePoint(axis, a, b, EDGE),
        ]),
      })),
    []
  );

  const names: Record<Axis, string[]> = {
    project: projectNames,
    teammate: teammateNames,
    time: weekLabels,
  };
  const count: Record<Axis, number> = { project: dims.x, teammate: dims.y, time: dims.z };

  const tags: {
    key: string; axis: Axis; text: string;
    pos: [number, number, number]; horizontal: boolean;
  }[] = [];
  for (const axis of AXES) {
    if (axis === hidden) continue;
    const { a, b, horizontal, stride } = placement[axis];
    names[axis].forEach((text, i) => {
      if (i % stride !== 0) return;
      tags.push({
        key: `${axis}${i}`,
        axis,
        text,
        pos: framePoint(axis, a, b, axisPosition(i, count[axis]), LABEL_PAD),
        horizontal,
      });
    });
  }

  return (
    <>
      {border.map(({ axis, points }) => (
        <Line
          key={axis}
          points={points}
          segments
          color={AXIS_COLORS[axis]}
          lineWidth={BORDER_WIDTH}
        />
      ))}
      {/* Flat zIndexRange on purpose: drei otherwise interpolates z-index by
          camera distance, so two overlapping labels trade places every time
          their depth order crosses, which reads as a flicker. */}
      {ready && tags.map((t) => (
        <Html key={t.key} position={t.pos} zIndexRange={[10, 10]}>
          {/* Horizontal axes run along the bottom, so labels start at the tick
              and slant down away from the cube. Vertical axes run down the left,
              so labels end at the tick and sit level with it. */}
          <div
            className="pointer-events-none absolute select-none whitespace-nowrap text-[11px] font-bold leading-none"
            style={{
              color: AXIS_COLORS[t.axis],
              transformOrigin: t.horizontal ? "0% 50%" : "100% 50%",
              transform: t.horizontal
                ? `translate(0, -50%) rotate(${NAME_SLANT}deg)`
                : "translate(-100%, -50%)",
            }}
          >
            <span className="rounded-sm bg-white/90 px-1 py-px">{t.text}</span>
          </div>
        </Html>
      ))}
    </>
  );
}

export default function CubeScene({
  data,
  spinning,
  closing,
  facing,
  rollTicks,
  onFacePick,
  onFaceArrived,
  onInteract,
  onBackgroundClick,
}: {
  data: CubeData;
  spinning: boolean;
  closing: boolean;
  facing: [number, number, number] | null;
  rollTicks: number;
  onFacePick: (normal: [number, number, number]) => void;
  onFaceArrived: () => void;
  onInteract: () => void;
  onBackgroundClick: () => void;
}) {
  // A rotate drag ends in a click on empty space; only a click that stayed put
  // counts as "clicked away".
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  return (
    <div
      className="relative h-full w-full"
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const d = downAt.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) dragged.current = true;
      }}
    >
      <Canvas
        orthographic
        camera={{ position: [26, 20, 26], zoom: COLLAPSED_ZOOM, near: -200, far: 400 }}
        gl={{ antialias: true, alpha: true }}
        // Fully transparent so the cube hovers over the live page rather than
        // sitting in a frame. Multiply blending needs the page showing through.
        onCreated={({ gl }) => gl.setClearAlpha(0)}
        // Fires only when a click hit no cell — i.e. the user clicked away.
        onPointerMissed={() => { if (!dragged.current) onBackgroundClick(); }}
      >
        <Backdrop />
        <Voxels data={data} />
        <AxisFurniture data={data} />
        {/* Guarded by the same drag test as closing: a rotate ends in a click,
            which would otherwise snap to whichever face it finished over. */}
        <FacePicker onPick={(n) => { if (!dragged.current) onFacePick(n); }} />
        <IntroZoom closing={closing} />
        <CameraRig facing={facing} rollTicks={rollTicks} onArrived={onFaceArrived} />
        <OrbitControls
          onStart={onInteract}
          enablePan={false}
          autoRotate={spinning && !facing}
          autoRotateSpeed={0.7}
          // Must not exceed COLLAPSED_ZOOM: OrbitControls clamps camera.zoom
          // into this range on every update, which would otherwise snap the
          // grow/shrink animation straight past its starting point.
          minZoom={COLLAPSED_ZOOM}
          maxZoom={140}
        />
      </Canvas>
    </div>
  );
}
