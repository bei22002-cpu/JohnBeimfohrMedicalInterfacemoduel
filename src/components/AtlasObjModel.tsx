import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { OBJLoader } from "three-stdlib";
import * as THREE from "three";

export function AtlasObjModel({
  url,
  color,
  emphasis,
}: {
  url: string;
  color: string;
  emphasis: "none" | "hover" | "selected";
}) {
  const obj = useLoader(OBJLoader, url);

  const prepared = useMemo(() => {
    const clone = obj.clone(true);
    clone.traverse((n) => {
      const m = (n as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      if (!m) return;
      const mat = Array.isArray(m) ? m[0] : m;
      const base = new THREE.Color(color);
      const emissive = emphasis === "selected" ? new THREE.Color("#2c7bd9") : emphasis === "hover" ? new THREE.Color("#ffd27a") : new THREE.Color("#000000");
      const emissiveIntensity = emphasis === "selected" ? 0.55 : emphasis === "hover" ? 0.35 : 0;
      const sm = new THREE.MeshStandardMaterial({
        color: base,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
        emissive,
        emissiveIntensity,
      });
      (n as unknown as { material?: THREE.Material }).material = sm;
      (n as unknown as { castShadow?: boolean; receiveShadow?: boolean }).castShadow = true;
      (n as unknown as { castShadow?: boolean; receiveShadow?: boolean }).receiveShadow = true;
      void mat;
    });
    return clone;
  }, [obj, color, emphasis]);

  return <primitive object={prepared} />;
}

