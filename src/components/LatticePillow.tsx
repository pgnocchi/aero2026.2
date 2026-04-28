import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Float, Text, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { SimulationState, ForceType } from '../types';

interface LatticePillowSceneProps {
  state: SimulationState;
  results: {
    stress: number;
    deflection: number;
    sf: number;
  };
}

const LatticeBlock: React.FC<LatticePillowSceneProps> = ({ state, results }) => {
  const meshRef = useRef<THREE.Group>(null);
  const latticeRef = useRef<THREE.LineSegments>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);

  // Block Dimensions from state
  const { length, width, thickness } = state.dimensions;
  
  // Resolution constant for simulation grid
  const nx = 20, ny = 12, nz = 4;

  // Create base points for a regular rectangular grid
  const { basePoints, indices } = useMemo(() => {
    const pts = [];
    const idx = [];
    const stepX = length / nx;
    const stepY = width / ny;
    const stepZ = thickness / nz;

    const addLine = (p1: THREE.Vector3, p2: THREE.Vector3) => {
      pts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    };

    // Lattice wireframe generation (3D Grid)
    for (let k = 0; k <= nz; k++) {
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const curr = new THREE.Vector3(i * stepX - length/2, j * stepY - width/2, k * stepZ - thickness/2);
          if (i < nx) addLine(curr, new THREE.Vector3((i+1) * stepX - length/2, j * stepY - width/2, k * stepZ - thickness/2));
          if (j < ny) addLine(curr, new THREE.Vector3(i * stepX - length/2, (j+1) * stepY - width/2, k * stepZ - thickness/2));
          if (k < nz) addLine(curr, new THREE.Vector3(i * stepX - length/2, j * stepY - width/2, (k+1) * stepZ - thickness/2));
        }
      }
    }

    return { 
      basePoints: new Float32Array(pts),
      indices: new Uint16Array(Array.from({length: pts.length/3}, (_, i) => i))
    };
  }, [length, width, thickness]);

  useFrame((sceneState) => {
    if (!latticeRef.current) return;
    const time = sceneState.clock.getElapsedTime();
    const lp = latticeRef.current.geometry.attributes.position.array as Float32Array;
    const lc = latticeRef.current.geometry.attributes.color.array as Float32Array;
    
    // Calculate deformation scale based on results
    const defScale = results.deflection * 1.5; 

    for (let i = 0; i < basePoints.length; i += 3) {
      const bx = basePoints[i];
      const by = basePoints[i+1];
      const bz = basePoints[i+2];

      let dx = 0, dy = 0, dz = 0;
      let stressFactor = 0;

      const nX = bx / (length / 2);
      const nY = by / (width / 2);
      const nZ = bz / (thickness / 2);

      // Deform mapping based on force type
      switch (state.selectedForce) {
        case ForceType.COMPRESSION:
          stressFactor = Math.exp(-(nX * nX + nY * nY) * 2) * (nZ > 0 ? 1 : 0);
          dz = -defScale * stressFactor;
          break;
        case ForceType.BENDING:
          stressFactor = Math.cos(nX * Math.PI / 2);
          dz = -defScale * stressFactor;
          break;
        case ForceType.TENSION:
          stressFactor = Math.abs(nX);
          dx = nX * defScale * 0.5;
          break;
        case ForceType.TORSION:
          stressFactor = Math.abs(nX * nY);
          dz = (nX * nY) * defScale;
          break;
        case ForceType.IMPACT:
          stressFactor = Math.exp(-(nX * nX + nY * nY) * 5) * (Math.sin(time * 10) * 0.5 + 0.5);
          dz = -defScale * stressFactor;
          break;
        case ForceType.SHEAR:
          stressFactor = Math.abs(nZ);
          dx = nZ * defScale * 0.5;
          break;
      }

      lp[i] = bx + dx;
      lp[i+1] = by + dy;
      lp[i+2] = bz + dz;

      // Update vertex colors
      const isHot = stressFactor > 0.5;
      lc[i] = isHot ? 1.0 : 0.23;
      lc[i+1] = isHot ? 0.45 : 0.51;
      lc[i+2] = isHot ? 0.1 : 0.96;
    }

    latticeRef.current.geometry.attributes.position.needsUpdate = true;
    latticeRef.current.geometry.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={meshRef}>
      {/* 3D Lattice Wireframe */}
      <lineSegments ref={latticeRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={basePoints.length / 3}
            array={basePoints.slice()}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={basePoints.length / 3}
            array={new Float32Array(basePoints.length).fill(1)}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.6} />
      </lineSegments>

      {/* Semi-transparent surface */}
      <mesh>
        <boxGeometry args={[length, width, thickness]} />
        <meshStandardMaterial 
          color={state.material.color} 
          transparent 
          opacity={0.05} 
          roughness={0.1}
        />
      </mesh>

      {/* Labels for Orientation */}
      <Text position={[length/2 + 40, 0, 0]} fontSize={16} color="#94a3b8">L</Text>
      <Text position={[0, width/2 + 40, 0]} fontSize={16} color="#94a3b8">W</Text>
    </group>
  );
};

export const LatticePillowScene: React.FC<LatticePillowSceneProps> = (props) => {
  return (
    <Canvas 
      shadows 
      gl={{ antialias: true, alpha: true }} 
      style={{ width: '100%', height: '100%' }}
    >
      <PerspectiveCamera makeDefault position={[600, 400, 600]} fov={40} />
      <OrbitControls makeDefault minDistance={300} maxDistance={1500} />
      
      <Environment preset="studio" />
      <ambientLight intensity={0.4} />
      <pointLight position={[500, 500, 500]} intensity={1} />
      
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
        <LatticeBlock {...props} />
      </Float>

      <ContactShadows position={[0, -300, 0]} opacity={0.4} scale={20} blur={2} />
      <gridHelper args={[2000, 40]} position={[0, -300, 0]}>
        <meshBasicMaterial attach="material" transparent opacity={0.05} color="#64748b" />
      </gridHelper>
    </Canvas>
  );
};

