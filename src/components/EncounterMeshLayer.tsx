import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export function EncounterMeshLayer({
  url,
  visible,
  ghost,
}: {
  url: string;
  visible: boolean;
  ghost: boolean;
}) {
  const { scene } = useGLTF(url);

  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = (obj.material as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial();
        const nm = mat.clone();
        nm.transparent = true;
        nm.opacity = ghost ? 0.25 : 0.9;
        nm.side = THREE.DoubleSide;
        nm.depthWrite = !ghost;
        nm.needsUpdate = true;
        obj.material = nm;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, ghost]);

  if (!visible) return null;
  return <primitive object={prepared} />;
}

