'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import type * as THREE from 'three';

function Scene() {
  const groupRef = useRef<THREE.Group>(null);
  const tilt = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    const { pointer } = state;
    tilt.current.x += (pointer.x - tilt.current.x) * 0.04;
    tilt.current.y += (pointer.y - tilt.current.y) * 0.04;
    if (groupRef.current) {
      groupRef.current.rotation.y = tilt.current.x * 0.5;
      groupRef.current.rotation.x = -tilt.current.y * 0.3;
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.1}>
        <mesh>
          <icosahedronGeometry args={[1.5, 5]} />
          <MeshDistortMaterial
            color="#0D59E7"
            distort={0.32}
            speed={1.5}
            roughness={0.15}
            metalness={0.65}
            emissive="#0D59E7"
            emissiveIntensity={0.18}
          />
        </mesh>
      </Float>

      <Float speed={2} rotationIntensity={1} floatIntensity={2}>
        <mesh position={[2.5, 1.1, -1]}>
          <octahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial color="#00B4DB" roughness={0.2} metalness={0.7} />
        </mesh>
      </Float>

      <Float speed={1.8} rotationIntensity={0.8} floatIntensity={1.7}>
        <mesh position={[-2.3, -0.7, -0.6]}>
          <torusGeometry args={[0.3, 0.1, 16, 32]} />
          <meshStandardMaterial color="#18C15E" roughness={0.25} metalness={0.6} />
        </mesh>
      </Float>

      <Float speed={2.2} rotationIntensity={1.2} floatIntensity={1.4}>
        <mesh position={[1.7, -1.3, 0.5]}>
          <boxGeometry args={[0.38, 0.38, 0.38]} />
          <meshStandardMaterial color="#F39C12" roughness={0.3} metalness={0.5} />
        </mesh>
      </Float>

      <Float speed={1.6} rotationIntensity={0.7} floatIntensity={1.3}>
        <mesh position={[-1.9, 1.3, -0.3]}>
          <coneGeometry args={[0.26, 0.5, 4]} />
          <meshStandardMaterial color="#EF4444" roughness={0.3} metalness={0.5} />
        </mesh>
      </Float>
    </group>
  );
}

export default function Hero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.55} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-5, -3, -5]} intensity={0.7} color="#0D59E7" />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
