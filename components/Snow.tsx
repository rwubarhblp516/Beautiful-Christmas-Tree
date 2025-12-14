
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lerp } from '../utils/math';
import { resolveAssetPath } from '../utils/assetPath';

// Ensure TS/JSX knows about these Three.js elements
extend({ Points: THREE.Points, BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute, ShaderMaterial: THREE.ShaderMaterial });

const snowVertexShader = `
  precision highp float;
  uniform float uTime; // Global Time
  uniform float uMix;  // Still used for drift amplitude
  
  attribute float aScale;
  attribute vec3 aVelocity;
  attribute float aUseMap;
  
  varying float vAlpha;
  varying float vUseMap;

  void main() {
    vec3 pos = position;
    
    float fallSpeed = aVelocity.y; 
    
    pos.y = mod(pos.y - uTime * fallSpeed + 15.0, 30.0) - 15.0; // Wrap Y (-15 to 15)
    
    // Side drift
    // uMix still controls the Amplitude of the drift (Chaos = wider drift)
    float drift = sin(uTime * aVelocity.x + pos.y) * (0.5 + (1.0 - uMix) * 2.0);
    pos.x += drift;
    pos.z += cos(uTime * aVelocity.z + pos.x) * 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size: adjust with depth, clamp to avoid streaks (rarer big flakes)
    float sz = aScale * (45.0 / max(1.0, -mvPosition.z));
    gl_PointSize = clamp(sz, 8.0, 72.0);
    
    // Fade at edges of box and with depth for softer horizon
    float yFade = 1.0 - smoothstep(10.0, 15.0, abs(pos.y));
    float zFade = 1.0 - smoothstep(20.0, 35.0, abs(pos.z));
    vAlpha = yFade * zFade;
    vUseMap = aUseMap;
  }
`;

const snowFragmentShader = `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uHasMap;
  varying float vAlpha;
  varying float vUseMap;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    vec3 color = vec3(1.0);
    float alpha = vAlpha * 0.8;

    if (uHasMap > 0.5 && vUseMap > 0.5) {
      vec4 tex = texture2D(uMap, gl_PointCoord);
      alpha *= tex.a;
      color = mix(color, tex.rgb, tex.a);
      if (alpha < 0.01) discard;
    } else {
      if (dist > 0.5) discard;
      float baseMask = 1.0 - smoothstep(0.3, 0.5, dist);
      alpha *= baseMask;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

const Snow: React.FC<{ mixFactor: number }> = ({ mixFactor }) => {
  const isMobile = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches,
    []
  );
  // Fewer flakes on mobile for perf
  const count = isMobile ? 1100 : 1800;

  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const currentMixRef = useRef(1);
  const { camera } = useThree();
  const [spriteTex, setSpriteTex] = useState<THREE.Texture | null>(null);
  const spriteUrls = useMemo(
    () => [
      'snowflakes/flake1.png',
      'snowflakes/flake2.png',
      'snowflakes/flake3.png',
      'snowflakes/flake.png',
      'snowflakes/snowflake.png',
      'snowflakes/snow.png'
    ].map(resolveAssetPath),
    []
  );

  const { positions, scales, velocities, useMapArr } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sc = new Float32Array(count);
    const vel = new Float32Array(count * 3);
    const useMap = new Float32Array(count);
    
    for(let i=0; i<count; i++) {
        // Random box -25 to 25 (Slightly larger to cover screen edges)
        pos[i*3] = (Math.random() - 0.5) * 50;
        pos[i*3+1] = (Math.random() - 0.5) * 30; // Y height
        pos[i*3+2] = (Math.random() - 0.5) * 40; // Z depth
        
        // Many small, few large (power curve)
        const r = Math.random();
        sc[i] = 0.5 + Math.pow(r, 3.0) * 5.5;

        // Portion use sprite texture, rest fall back to procedural
        useMap[i] = Math.random() < 0.6 ? 1 : 0;
        if (useMap[i] > 0.5) {
          sc[i] *= 2.0;
          if (Math.random() < 0.25) sc[i] *= 1.4;
          if (Math.random() < 0.08) sc[i] *= 1.6;
        } else {
          // Procedural flakes stay much smaller (max roughly half of sprite size)
          sc[i] *= 0.8;
          if (Math.random() < 0.1) sc[i] *= 1.2;
        }
        
        vel[i*3] = Math.random() * 0.5 + 0.2; // Drift freq
        vel[i*3+1] = Math.random() * 2.0 + 1.0; // Fall speed
        vel[i*3+2] = Math.random() * 0.5 + 0.2;
    }
    return { positions: pos, scales: sc, velocities: vel, useMapArr: useMap };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMix: { value: 1 },
    uMap: { value: null },
    uHasMap: { value: 0 }
  }), []);

  useEffect(() => {
    let disposed = false;
    const loader = new THREE.TextureLoader();

    // Fallback: generate a soft dot texture
    const generateFallback = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(size/2, size/2, 4, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }
      const tex = new THREE.Texture(canvas);
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    const tryUrls = [...spriteUrls];
    const tryNext = () => {
      const url = tryUrls.shift();
      if (!url) {
        const tex = generateFallback();
        if (!disposed) setSpriteTex(tex);
        return;
      }
      loader.load(
        url,
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          if (!disposed) setSpriteTex(tex);
        },
        undefined,
        () => tryNext()
      );
    };

    tryNext();

    return () => {
      disposed = true;
    };
  }, [spriteUrls]);

  useEffect(() => {
    return () => {
      if (spriteTex) spriteTex.dispose();
    };
  }, [spriteTex]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uMap.value = spriteTex;
      materialRef.current.uniforms.uHasMap.value = spriteTex ? 1 : 0;
    }
  }, [spriteTex]);

  useFrame((state, delta) => {
     if (materialRef.current && pointsRef.current) {
         currentMixRef.current = lerp(currentMixRef.current, mixFactor, delta * 2.0);
         
         materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
         materialRef.current.uniforms.uMix.value = currentMixRef.current;

         pointsRef.current.position.x = camera.position.x;
         pointsRef.current.position.y = camera.position.y;
     }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} />
        <bufferAttribute attach="attributes-aVelocity" count={count} array={velocities} itemSize={3} />
        <bufferAttribute attach="attributes-aUseMap" count={count} array={useMapArr} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial 
        ref={materialRef}
        vertexShader={snowVertexShader}
        fragmentShader={snowFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
};

export default Snow;
