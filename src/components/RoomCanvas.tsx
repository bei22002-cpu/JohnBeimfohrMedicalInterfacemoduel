import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, Center, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsHandle } from "three-stdlib";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { HeartScene } from "./HeartScene";
import { useSession } from "../state/sessionStore";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { AtlasObjModel } from "./AtlasObjModel";
import { EncounterMeshLayer } from "./EncounterMeshLayer";

function CameraRig({ distance }: { distance: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0.4, distance);
    camera.lookAt(0, 0.35, 0);
  }, [camera, distance]);
  return null;
}

function SyncedOrbitControls({ resetNonce }: { resetNonce: number }) {
  const ref = useRef<OrbitControlsHandle>(null);
  useEffect(() => {
    if (resetNonce === 0) return;
    ref.current?.reset();
  }, [resetNonce]);
  return <OrbitControls ref={ref} enablePan={false} enableDamping dampingFactor={0.08} />;
}

export function RoomCanvas() {
  const { state: session, dispatch } = useSession();
  const reducedMotion = usePrefersReducedMotion();
  const plan = session.scenePlan;
  const atlasParts = useMemo(
    () => [
      { id: "chamber.LA", label: "Left atrium", url: "/meshes/clinical-core/NORMAL_LA.obj", color: "#a85a5a" },
      { id: "chamber.LV", label: "Left ventricle", url: "/meshes/clinical-core/NORMAL_LV.obj", color: "#b85c5c" },
      { id: "chamber.RA", label: "Right atrium", url: "/meshes/clinical-core/NORMAL_RA.obj", color: "#9b5252" },
      { id: "chamber.RV", label: "Right ventricle", url: "/meshes/clinical-core/NORMAL_RV.obj", color: "#9d4f4f" },
      { id: "great_vessel.aorta", label: "Aorta", url: "/meshes/clinical-core/NORMAL_AO.obj", color: "#8a3a3a" },
      { id: "great_vessel.pulmonary_artery", label: "Pulmonary artery", url: "/meshes/clinical-core/NORMAL_PA.obj", color: "#7a3636" },
    ],
    [],
  );

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%", background: "#0a0e14" }}
    >
      <color attach="background" args={["#0a0e14"]} />
      <CameraRig distance={session.cameraDistance} />
      <SyncedOrbitControls resetNonce={session.orbitResetNonce} />

      {/* If you copy TorontoHeartAtlas OBJs to /public/meshes/clinical-core, they will render here. */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 8, 5]} intensity={1.15} castShadow />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.35}>
          <group rotation={[0, session.cameraYaw, 0]}>
            <Center>
              {session.encounterMeshUrl && (
                <EncounterMeshLayer url={session.encounterMeshUrl} visible={session.showEncounterMesh} ghost />
              )}
              {atlasParts.map((p) => (
                <group
                  key={p.id}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "SET_HOVERED", id: p.id });
                  }}
                  onPointerOut={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "SET_HOVERED", id: undefined });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "SET_SELECTED", id: p.id });
                  }}
                >
                  <AtlasObjModel
                    url={p.url}
                    color={p.color}
                    emphasis={session.selectedId === p.id ? "selected" : session.hoveredId === p.id ? "hover" : "none"}
                  />
                </group>
              ))}
            </Center>
          </group>
        </Bounds>
      </Suspense>

      <HeartScene plan={plan} session={session} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
