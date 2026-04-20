/**
 * MeshViewer3D.tsx
 * Renders a cardiac GLB mesh with orbit controls, per-structure toggles,
 * and ghost/solid display modes.
 *
 * deps: @react-three/fiber @react-three/drei three
 *       npm install @react-three/fiber @react-three/drei three
 */

import React, { Suspense, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  BakeShadows,
} from "@react-three/drei";
import * as THREE from "three";

// ── types ─────────────────────────────────────────────────────────────────────
interface StructureMeta {
  name: string;
  color: string;
}

const STRUCTURES: StructureMeta[] = [
  { name: "Left Ventricle",   color: "#d92525" },
  { name: "Right Ventricle",  color: "#3372d9" },
  { name: "Left Atrium",      color: "#f27d1a" },
  { name: "Right Atrium",     color: "#26b359" },
  { name: "Myocardium",       color: "#ccb533" },
  { name: "Aorta",            color: "#bf2690" },
  { name: "Pulmonary Artery", color: "#4dc2e6" },
];

// ── inner mesh component ──────────────────────────────────────────────────────
function HeartModel({
  url,
  ghost,
  hidden,
}: {
  url: string;
  ghost: boolean;
  hidden: Set<string>;
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null!);

  // gentle auto-rotate until user interacts
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.15;
  });

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const name: string = obj.name || "";
        obj.visible = !hidden.has(name);
        const mat = obj.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity     = ghost ? 0.25 : 0.92;
        mat.side        = THREE.DoubleSide;
        mat.needsUpdate = true;
      }
    });
  }, [scene, ghost, hidden]);

  return <primitive ref={groupRef} object={scene} />;
}

// ── loading spinner ──────────────────────────────────────────────────────────
function Loader() {
  return (
    <Html center>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        color: "#e0e0e0", fontFamily: "monospace", gap: 12,
      }}>
        <div style={{
          width: 48, height: 48, border: "3px solid #444",
          borderTop: "3px solid #e05252", borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }} />
        <span style={{ fontSize: 13, letterSpacing: 1 }}>Loading mesh…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </Html>
  );
}

// ── main export ───────────────────────────────────────────────────────────────
export default function MeshViewer3D({ meshUrl }: { meshUrl: string }) {
  const [ghost,  setGhost]  = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      background: "#0d0f14", borderRadius: 12, overflow: "hidden",
    }}>
      {/* ── disclaimer banner ─────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        background: "rgba(220,60,60,0.85)", color: "#fff",
        fontSize: 11, fontFamily: "monospace", letterSpacing: 0.5,
        padding: "5px 12px", textAlign: "center",
      }}>
        ⚠️ PHYSICIAN-INITIATED VISUALIZATION ONLY — NOT FOR CLINICAL DIAGNOSIS
      </div>

      {/* ── 3D canvas ─────────────────────────────────────────────────── */}
      <Canvas
        camera={{ position: [0, 0, 18], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#0d0f14" }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]}  intensity={1.2} />
        <directionalLight position={[-8, -5, -5]} intensity={0.5} />

        <Suspense fallback={<Loader />}>
          <HeartModel url={meshUrl} ghost={ghost} hidden={hidden} />
          <Environment preset="studio" />
          <BakeShadows />
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={60}
        />

        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport
            axisColors={["#e05252", "#52d67a", "#5285e0"]}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>

      {/* ── structure panel ───────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 16, left: 16, zIndex: 10,
        background: "rgba(15,18,26,0.88)", backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
        padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6,
        minWidth: 190,
      }}>
        <div style={{
          color: "#8888aa", fontSize: 10, fontFamily: "monospace",
          letterSpacing: 1.2, marginBottom: 4,
        }}>
          CARDIAC STRUCTURES
        </div>

        {STRUCTURES.map(({ name, color }) => (
          <label key={name} style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            opacity: hidden.has(name) ? 0.35 : 1, transition: "opacity 0.2s",
          }}>
            <input
              type="checkbox"
              checked={!hidden.has(name)}
              onChange={() => toggle(name)}
              style={{ display: "none" }}
            />
            <span style={{
              width: 11, height: 11, borderRadius: 2, flexShrink: 0,
              background: color,
              boxShadow: hidden.has(name) ? "none" : `0 0 6px ${color}88`,
            }} />
            <span style={{
              color: "#ccd0dd", fontSize: 12, fontFamily: "monospace",
              userSelect: "none",
            }}>
              {name}
            </span>
          </label>
        ))}

        {/* ghost toggle */}
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          }}>
            <div
              onClick={() => setGhost((g) => !g)}
              style={{
                width: 32, height: 18, borderRadius: 9,
                background: ghost ? "#5285e0" : "#333",
                position: "relative", transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: ghost ? 16 : 3,
                width: 12, height: 12, borderRadius: "50%",
                background: "#fff", transition: "left 0.2s",
              }} />
            </div>
            <span style={{
              color: "#8888aa", fontSize: 11, fontFamily: "monospace",
              letterSpacing: 0.5,
            }}>
              Ghost mode
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
