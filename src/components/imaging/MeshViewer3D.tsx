import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  BakeShadows,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";

function Loader() {
  return (
    <Html center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#ccd0dd" }}>
        <div style={{ width: 44, height: 44, border: "3px solid #333", borderTop: "3px solid #7aabff", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 12 }}>Loading mesh…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </Html>
  );
}

function HeartModel({ url, ghost, hidden }: { url: string; ghost: boolean; hidden: Set<string> }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.12;
  });

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const name = obj.name || "";
        obj.visible = !hidden.has(name);
        const mat = obj.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = ghost ? 0.25 : 0.92;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      }
    });
  }, [scene, ghost, hidden]);

  return <primitive ref={groupRef} object={scene} />;
}

export function MeshViewer3D({ meshUrl }: { meshUrl: string }) {
  const [ghost, setGhost] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  return (
    <div style={{ position: "relative", width: "100%", height: 520, background: "#0d0f14", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, background: "rgba(220,60,60,0.85)", color: "#fff", fontSize: 11, padding: "5px 12px", textAlign: "center" }}>
        Physician-initiated visualization only — NOT for clinical diagnosis
      </div>

      <Canvas camera={{ position: [0, 0, 18], fov: 45 }} gl={{ antialias: true, alpha: false }} style={{ background: "#0d0f14" }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={1.2} />
        <directionalLight position={[-8, -5, -5]} intensity={0.5} />

        <Suspense fallback={<Loader />}>
          <HeartModel url={meshUrl} ghost={ghost} hidden={hidden} />
          <Environment preset="studio" />
          <BakeShadows />
        </Suspense>

        <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={60} />

        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport axisColors={["#e05252", "#52d67a", "#5285e0"]} labelColor="white" />
        </GizmoHelper>
      </Canvas>

      <div style={{ position: "absolute", bottom: 14, left: 14, zIndex: 10, display: "flex", gap: 10, alignItems: "center", background: "rgba(15,18,26,0.75)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
        <button type="button" className="btn" onClick={() => setGhost((g) => !g)}>
          {ghost ? "Solid" : "Ghost"}
        </button>
        <button type="button" className="btn" onClick={() => setHidden(new Set())}>
          Show all
        </button>
        <span style={{ fontSize: 11, color: "#6a7a88" }}>Hide/show structure nodes via GLB node names</span>
      </div>
    </div>
  );
}

useGLTF.preload("/meshes/example.glb");

