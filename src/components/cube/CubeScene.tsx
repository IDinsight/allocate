"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { CubeData } from "./useCubeData";

export type Axis = "project" | "teammate" | "time";

/** Each axis gets a colour so its guide line and labels stay identifiable under rotation. */
export const AXIS_COLORS: Record<Axis, string> = {
  project: "#7c3aed",
  teammate: "#059669",
  time: "#d97706",
};

// Every axis is drawn to the same span, so the lattice always reads as a cube
// no matter how lopsided the project/teammate/week counts are.
const SPAN = 10;
const CAM_DIST = 40;

const VOXEL_COLOR = new THREE.Color("#a78bfa"); // light purple, uniform for now
const WHITE = new THREE.Color("#ffffff");

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
      c.copy(WHITE).lerp(VOXEL_COLOR, v.fraction / 100);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = voxels.length;
  }, [voxels, dims, scale]);

  if (voxels.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, voxels.length]}
      // Keeps the lattice in the raycaster's interaction list, so a click that
      // lands on a cell is not treated as clicking away.
      onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}
    >
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
 * Which edge of the cube each axis's furniture sits on. Labels are DOM overlays
 * and so always paint over the canvas; rather than fight that with depth
 * tricks, we keep them on the edges currently facing the camera, where there is
 * nothing in front of them to be wrong about.
 */
type Layout = { sx: number; sz: number; hidden: Axis | null };

/** An axis pointing near-straight at the camera collapses to a point — hide it. */
const FACE_ON = 0.985;

function useEdgeLayout(): Layout {
  const [layout, setLayout] = useState<Layout>({ sx: 1, sz: 1, hidden: null });
  const ref = useRef(layout);

  useFrame(({ camera }) => {
    const p = camera.position;
    const n = p.clone().normalize();
    const hidden: Axis | null =
      Math.abs(n.x) > FACE_ON ? "project"
        : Math.abs(n.y) > FACE_ON ? "teammate"
          : Math.abs(n.z) > FACE_ON ? "time"
            : null;
    const next = { sx: p.x >= 0 ? 1 : -1, sz: p.z >= 0 ? 1 : -1, hidden };
    const cur = ref.current;
    if (next.sx !== cur.sx || next.sz !== cur.sz || next.hidden !== cur.hidden) {
      ref.current = next;
      setLayout(next);
    }
  });

  return layout;
}

/** Coloured guide line per axis, plus a white tag per row/column that rides along with it. */
function AxisFurniture({ data, onSnap }: { data: CubeData; onSnap: (a: Axis) => void }) {
  const { projectNames, teammateNames, weekLabels, dims } = data;
  const edge = SPAN / 2 + 0.4;
  const { sx, sz, hidden } = useEdgeLayout();

  const lines = useMemo(() => {
    // Each guide line hugs a camera-facing edge, so it never runs through the cube.
    const spec: Record<Axis, [THREE.Vector3, THREE.Vector3]> = {
      project: [
        new THREE.Vector3(-edge, -edge, sz * edge),
        new THREE.Vector3(edge, -edge, sz * edge),
      ],
      teammate: [
        new THREE.Vector3(sx * edge, -edge, sz * edge),
        new THREE.Vector3(sx * edge, edge, sz * edge),
      ],
      time: [
        new THREE.Vector3(sx * edge, -edge, -edge),
        new THREE.Vector3(sx * edge, -edge, edge),
      ],
    };
    return (Object.keys(spec) as Axis[]).map((axis) => ({
      axis,
      line: new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(spec[axis]),
        new THREE.LineBasicMaterial({ color: AXIS_COLORS[axis] })
      ),
    }));
  }, [edge, sx, sz]);

  useEffect(
    () => () =>
      lines.forEach(({ line }) => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }),
    [lines]
  );

  // Long axes get thinned out — 30 overlapping tags is noise, not a label.
  const stride = (n: number) => Math.max(1, Math.ceil(n / 10));
  const out = edge * 1.06; // nudge tags clear of the lattice

  const tags: { key: string; axis: Axis; text: string; pos: [number, number, number] }[] = [];
  projectNames.forEach((name, i) => {
    if (i % stride(dims.x) !== 0) return;
    tags.push({ key: `p${i}`, axis: "project", text: name, pos: [axisPosition(i, dims.x), -out, sz * out] });
  });
  teammateNames.forEach((name, i) => {
    if (i % stride(dims.y) !== 0) return;
    tags.push({ key: `t${i}`, axis: "teammate", text: name, pos: [sx * out, axisPosition(i, dims.y), sz * out] });
  });
  weekLabels.forEach((label, i) => {
    if (i % stride(dims.z) !== 0) return;
    tags.push({ key: `w${i}`, axis: "time", text: label, pos: [sx * out, -out, axisPosition(i, dims.z)] });
  });

  // The axis name sits at the far end of its own guide line and doubles as the
  // "look down this axis" control, so the buttons travel with the cube.
  // Each sits just past the end of its own guide line, on the line itself.
  const cap = edge * 1.45;
  const caps: { axis: Axis; label: string; pos: [number, number, number] }[] = [
    { axis: "project", label: "PROJECT", pos: [cap, -edge, sz * edge] },
    { axis: "teammate", label: "TEAM", pos: [sx * edge, cap, sz * edge] },
    { axis: "time", label: "TIME", pos: [sx * edge, -edge, cap] },
  ];

  return (
    <>
      {lines.filter(({ axis }) => axis !== hidden).map(({ axis, line }) => (
        <primitive key={axis} object={line} />
      ))}
      {caps.filter((c) => c.axis !== hidden).map((c) => (
        <Html key={c.axis} position={c.pos} center zIndexRange={[20, 10]}>
          <button
            onClick={() => onSnap(c.axis)}
            title={`Look down the ${c.label.toLowerCase()} axis`}
            className="btn-chunky whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-[10px] font-bold"
            style={{ color: AXIS_COLORS[c.axis] }}
          >
            {c.label}
          </button>
        </Html>
      ))}
      {tags.filter((t) => t.axis !== hidden).map((t) => (
        <Html key={t.key} position={t.pos} center zIndexRange={[10, 0]}>
          <span
            className="pointer-events-none select-none whitespace-nowrap rounded-sm bg-white px-1 py-px text-[9px] font-bold leading-tight"
            style={{ color: AXIS_COLORS[t.axis], border: `1px solid ${AXIS_COLORS[t.axis]}` }}
          >
            {t.text}
          </span>
        </Html>
      ))}
    </>
  );
}

const AXIS_VIEW: Record<Axis, [number, number, number]> = {
  // Looking *down* an axis puts the camera on it, so that axis collapses and
  // the other two form the face you see. Orthographic projection is what makes
  // the cells actually line up instead of splaying out.
  project: [CAM_DIST, 0, 0],
  teammate: [0, CAM_DIST, 0],
  time: [0, 0, CAM_DIST],
};

function CameraRig({ snap, onSettled }: { snap: Axis | null; onSettled: () => void }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());

  useEffect(() => {
    if (snap) target.current.set(...AXIS_VIEW[snap]);
  }, [snap]);

  useFrame(() => {
    if (!snap) return;
    camera.position.lerp(target.current, 0.15);
    // Looking straight down an axis leaves "up" ambiguous; pin it so the two
    // face-on views don't arrive at a random roll.
    camera.up.set(0, snap === "teammate" ? 0 : 1, snap === "teammate" ? -1 : 0);
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(target.current) < 0.05) {
      camera.position.copy(target.current);
      onSettled();
    }
  });
  return null;
}

export default function CubeScene({
  data,
  snap,
  onSnap,
  onSnapDone,
  spinning,
  onInteract,
  onBackgroundClick,
}: {
  data: CubeData;
  snap: Axis | null;
  onSnap: (a: Axis) => void;
  onSnapDone: () => void;
  spinning: boolean;
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
        camera={{ position: [26, 20, 26], zoom: 46, near: -200, far: 400 }}
        gl={{ antialias: true, alpha: true }}
        // Fully transparent so the cube hovers over the live page rather than
        // sitting in a frame. Multiply blending needs the page showing through.
        onCreated={({ gl }) => gl.setClearAlpha(0)}
        // Fires only when a click hit no cell — i.e. the user clicked away.
        onPointerMissed={() => { if (!dragged.current) onBackgroundClick(); }}
      >
        <Voxels data={data} />
        <AxisFurniture data={data} onSnap={onSnap} />
        <CameraRig snap={snap} onSettled={onSnapDone} />
        <OrbitControls
          onStart={onInteract}
          enablePan={false}
          autoRotate={spinning && !snap}
          autoRotateSpeed={0.7}
          minZoom={12}
          maxZoom={140}
        />
      </Canvas>
    </div>
  );
}
