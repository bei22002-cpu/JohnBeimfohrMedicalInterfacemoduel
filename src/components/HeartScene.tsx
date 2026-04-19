import { useFrame } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ScenePlan } from "../types/scenePlan";
import type { SessionState } from "../state/sessionStore";

type Props = {
  plan: ScenePlan;
  session: SessionState;
  /** Pause time-based cardiac phase when user prefers reduced motion. */
  reducedMotion: boolean;
};

export function HeartScene({ plan, session, reducedMotion }: Props) {
  const phaseRef = useRef(0);
  const throttle = useRef(0);
  const [, setFrame] = useState(0);
  const motionScale = reducedMotion ? 0 : 1;
  useFrame((_, delta) => {
    if (!session.frozen) phaseRef.current += delta * session.animationSpeed * motionScale;
    throttle.current += delta;
    if (throttle.current > 0.12) {
      throttle.current = 0;
      setFrame((f) => (f + 1) % 100000);
    }
  });

  const phase = Math.sin(phaseRef.current * 1.2) * 0.5 + 0.5;
  const systole = phase;
  const diastole = 1 - phase;

  const template = plan.sceneTemplate;

  const stenosis =
    typeof plan.pathologyParams.stenosisPercent === "number" ? (plan.pathologyParams.stenosisPercent as number) / 100 : 0;
  const mr = typeof plan.pathologyParams.regurgitantSeverity === "number" ? (plan.pathologyParams.regurgitantSeverity as number) : 0;
  const asJet = plan.flowOverlay.mode === "stenosis_jet";
  const hcm = template === "hcm_lvot";
  const lvDil = typeof plan.pathologyParams.lvDilation === "number" ? (plan.pathologyParams.lvDilation as number) : 1;

  const ladPoints = useMemo(
    () =>
      [new THREE.Vector3(0.2, 0.4, 0.35), new THREE.Vector3(0.45, 0.15, 0.5), new THREE.Vector3(0.75, -0.05, 0.35)].map(
        (v) => v.clone(),
      ),
    [],
  );

  const showCoronary =
    template === "coronary_overview" ||
    template === "coronary_stenosis_pci" ||
    template === "aortic_stenosis_tavr" ||
    template === "idle_neutral_heart";

  const pciActive = template === "coronary_stenosis_pci";
  const pciPhase = reducedMotion ? 0.5 : (Math.floor(performance.now() / 2200) % 6) / 5;

  const lvScale = 1 + systole * 0.08;
  const rvScale = 1 + systole * 0.07;

  return (
    <group>
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 8, 5]} intensity={1.1} castShadow />

      <group rotation={[0, session.cameraYaw, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <sphereGeometry args={[0.95 * lvScale * lvDil, 32, 32]} />
          <meshStandardMaterial
            color={hcm ? "#c47474" : "#b85c5c"}
            roughness={0.45}
            metalness={0.05}
            transparent
            opacity={0.92}
          />
        </mesh>
        <mesh position={[0.35, 0.55, -0.15]} castShadow>
          <sphereGeometry args={[0.55 * rvScale, 28, 28]} />
          <meshStandardMaterial color="#9d4f4f" roughness={0.5} transparent opacity={0.9} />
        </mesh>
        <mesh position={[-0.55, 0.65, -0.1]}>
          <sphereGeometry args={[0.42, 24, 24]} />
          <meshStandardMaterial color="#a85a5a" roughness={0.55} transparent opacity={0.85} />
        </mesh>
        <mesh position={[-0.35, 0.75, 0.15]}>
          <sphereGeometry args={[0.38, 24, 24]} />
          <meshStandardMaterial color="#a85a5a" roughness={0.55} transparent opacity={0.85} />
        </mesh>

        <mesh position={[0.05, 1.05, 0.1]} rotation={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.28, 0.55, 24]} />
          <meshStandardMaterial color="#8a3a3a" roughness={0.35} />
        </mesh>

        <mesh position={[0.05, 0.82, 0.12]} rotation={[0.2, 0, 0]}>
          <torusGeometry args={[0.2 - (asJet ? 0.06 : 0), 0.04, 12, 32]} />
          <meshStandardMaterial
            color="#d9c4b8"
            emissive={asJet ? "#553322" : "#000000"}
            emissiveIntensity={asJet ? 0.35 : 0}
            roughness={0.4}
          />
        </mesh>

        <mesh position={[-0.05, 0.45, 0.28]} rotation={[1.1, 0, 0]}>
          <torusGeometry args={[0.24, 0.03, 10, 28]} />
          <meshStandardMaterial color="#c9b0a8" roughness={0.5} />
        </mesh>

        {hcm && (
          <mesh position={[0.12, 0.25, 0.05]}>
            <boxGeometry args={[0.35, 0.65, 0.22]} />
            <meshStandardMaterial color="#a04040" roughness={0.5} />
          </mesh>
        )}

        {showCoronary && (
          <group>
            <Line points={ladPoints} color="#e8bc3c" lineWidth={2} />
            <mesh position={ladPoints[1].clone().lerp(ladPoints[2], 0.45)}>
              <sphereGeometry args={[0.04 + stenosis * 0.12, 12, 12]} />
              <meshStandardMaterial color="#f0d080" emissive="#442200" emissiveIntensity={stenosis * 0.5} />
            </mesh>
          </group>
        )}

        {plan.flowOverlay.mode === "regurgitant_jet" && mr > 0 && (
          <group position={[-0.15, 0.55, 0.42]}>
            {Array.from({ length: 12 }).map((_, i) => (
              <mesh
                key={i}
                position={[
                  Math.sin((reducedMotion ? 0 : performance.now() / 200) + i) * 0.05,
                  systole * 0.15 * mr + i * 0.02,
                  -i * 0.06 * mr,
                ]}
              >
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color="#66aaff" transparent opacity={0.55} />
              </mesh>
            ))}
          </group>
        )}

        {asJet && (
          <mesh position={[0.15, 1.35, 0.15]} rotation={[0.5, 0, 0]}>
            <coneGeometry args={[0.08, 0.45, 12]} />
            <meshBasicMaterial color="#ffcc88" transparent opacity={0.25} />
          </mesh>
        )}

        {pciActive && (
          <group>
            <Line
              points={[ladPoints[0], ladPoints[1].clone().lerp(ladPoints[2], Math.min(1, pciPhase + 0.1))]}
              color="#cccccc"
              lineWidth={1}
            />
            {pciPhase > 0.4 && (
              <mesh position={ladPoints[1].clone().lerp(ladPoints[2], 0.5)}>
                <cylinderGeometry args={[0.035, 0.035, 0.2, 12]} />
                <meshStandardMaterial color="#c0c0d8" metalness={0.6} roughness={0.3} />
              </mesh>
            )}
          </group>
        )}

        {template === "afib_conduction" && (
          <group position={[-0.4, 0.7, 0.2]}>
            {Array.from({ length: 20 }).map((_, i) => (
              <mesh key={i} position={[Math.sin(i * 0.9) * 0.35, Math.cos(i * 1.1) * 0.12, (i % 5) * 0.02]}>
                <sphereGeometry args={[0.018, 6, 6]} />
                <meshBasicMaterial color={i % 3 === 0 ? "#ff8844" : "#4488ff"} />
              </mesh>
            ))}
          </group>
        )}

        {template === "device_crt_pacemaker_icd" && (
          <group>
            <Line
              points={[
                new THREE.Vector3(-0.9, 0.3, 0.2),
                new THREE.Vector3(-0.2, 0.35, 0.25),
                new THREE.Vector3(0.1, -0.1, 0.15),
              ]}
              color="#c8d0e8"
              lineWidth={1.5}
            />
            <mesh position={[-0.92, 0.28, 0.18]}>
              <boxGeometry args={[0.15, 0.22, 0.06]} />
              <meshStandardMaterial color="#8890a8" metalness={0.5} roughness={0.35} />
            </mesh>
          </group>
        )}

        {template === "aortic_stenosis_tavr" && plan.pathologyParams.replacement === "TAVR" && (
          <mesh position={[0.4, 0.95, 0.35]} rotation={[0.3, -0.4, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.9, 10]} />
            <meshStandardMaterial color="#a8a8c8" metalness={0.4} roughness={0.4} transparent opacity={0.85} />
          </mesh>
        )}
      </group>

      {session.showSceneLabels && (
        <>
          <Text position={[-1.8, 1.5, 0]} fontSize={0.09} color="#e8eef8" anchorX="left" maxWidth={3.2}>
            {plan.labels.join(" · ") || " "}
          </Text>
          <Text position={[-1.8, 1.35, 0]} fontSize={0.055} color="#8899aa" anchorX="left" maxWidth={3.5}>
            {diastole > 0.5 ? "Diastole (filling)" : "Systole (ejection)"} · conceptual timing
          </Text>
        </>
      )}
    </group>
  );
}
