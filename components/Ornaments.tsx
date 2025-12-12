
import React, { useMemo, useRef, useLayoutEffect, useCallback, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { lerp, randomVector3 } from '../utils/math';

interface OrnamentData {
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  rotation: THREE.Euler;
  color: THREE.Color;
  targetScale: THREE.Vector3;
  chaosScale: THREE.Vector3;
  chaosTilt: number;
}

type PhotoTransform = {
  scale: number;
  offset: { x: number; y: number };
};

interface OrnamentsProps {
  mixFactor: number;
  type: 'BALL' | 'BOX' | 'STAR' | 'CANDY' | 'CRYSTAL' | 'PHOTO';
  count: number;
  colors?: string[];
  scale?: number;
  userImages?: string[];
  imageKeyMap?: Record<string, string>;
  signatureText?: string;
  customCards?: Array<{ id: string; message: string; signature: string }>;
  onFocusMedia?: (entry: { kind: 'image' | 'card'; url?: string; message?: string; signature?: string | null; id?: string; cacheKey?: string; editable?: boolean }, screenPos?: { x: number; y: number }) => void;
  photoTransforms?: Record<string, PhotoTransform>;
}

interface PhotoEntry {
  key: string;
  kind: 'image' | 'card';
  url?: string;
  texture?: THREE.Texture;
  signatureTexture?: THREE.Texture | null;
  message?: string;
  signatureText?: string | null;
  origin?: { x: number; y: number };
  id?: string;
  cacheKey?: string;
  transform?: PhotoTransform;
  editable?: boolean;
}

// --- Procedural Geometry Generators ---

const createCandyCaneGeometry = () => {
    // Create a path: Line up, then curve for the hook
    const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -1.0, 0),
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0.1, 0.8, 0),
        new THREE.Vector3(0.4, 0.9, 0),
        new THREE.Vector3(0.6, 0.6, 0) 
    ]);
    
    // Tube
    const geometry = new THREE.TubeGeometry(path, 32, 0.12, 8, false);
    geometry.center(); // Crucial for rotation
    return geometry;
};

const createStarGeometry = (points: number, outerRadius: number, innerRadius: number, depth: number) => {
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / (points * 2);
    
    shape.moveTo(0, outerRadius);
    
    for(let i = 0; i < points * 2; i++) {
        const radius = (i % 2 === 0) ? outerRadius : innerRadius;
        const angle = i * step;
        shape.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius);
    }
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 2
    });
    geometry.center();
    return geometry;
};

const generateCandyStripeTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    
    // Red stripes
    ctx.fillStyle = '#cc0000'; // Classic darker red
    
    // Draw diagonal stripes
    // To create a seamless spiral on the tube, we draw diagonal lines.
    // 3 stripes per tile
    for (let i = -128; i < 256; i += 42) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 20, 0);
        ctx.lineTo(i + 20 + 128, 128); // Slope of 1 (128x128)
        ctx.lineTo(i + 128, 128);
        ctx.closePath();
        ctx.fill();
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    
    // Repeat along the length (U) to create multiple spiral turns.
    // Repeat 4 times along the length, 1 time around the circumference.
    tex.repeat.set(4, 1); 
    return tex;
}

const generateSignatureTexture = (text: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Clear background (transparent)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!text) return new THREE.CanvasTexture(canvas);

    // Text Style
    ctx.fillStyle = '#111111'; // Almost Black ink
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Use the loaded font
    ctx.font = "bold 60px 'Monsieur La Doulaise', cursive";
    
    // Draw
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

const createFallbackTexture = (label: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f8f8f8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
};

const loadImageElement = async (url: string): Promise<HTMLImageElement> => {
    const fromUrl = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = src;
        });

    try {
        return await fromUrl(url);
    } catch (firstErr) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`fetch ${res.status}`);
            const blob = await res.blob();
            const tmpUrl = URL.createObjectURL(blob);
            try {
                return await fromUrl(tmpUrl);
            } finally {
                URL.revokeObjectURL(tmpUrl);
            }
        } catch (fetchErr) {
            throw fetchErr || firstErr;
        }
    }
};

const usePhotoTexture = (url: string, transform?: PhotoTransform) => {
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    useEffect(() => {
        let cancelled = false;
        let activeTexture: THREE.Texture | null = null;
        const load = async () => {
            try {
                const img = await loadImageElement(url);
                if (cancelled) return;

                const width = img.naturalWidth || (img as any).videoWidth || img.width || 1024;
                const height = img.naturalHeight || (img as any).videoHeight || img.height || 1024;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('no canvas ctx');

                ctx.fillStyle = '#f8f8f8';
                ctx.fillRect(0, 0, width, height);

                const safeScale = THREE.MathUtils.clamp(transform?.scale ?? 1, 0.5, 2.5);
                const ox = THREE.MathUtils.clamp(transform?.offset?.x ?? 0, -0.6, 0.6);
                const oy = THREE.MathUtils.clamp(transform?.offset?.y ?? 0, -0.6, 0.6);

                ctx.save();
                ctx.translate(width / 2 + ox * width, height / 2 + oy * height);
                ctx.scale(safeScale, safeScale);
                ctx.drawImage(img as CanvasImageSource, -width / 2, -height / 2, width, height);
                ctx.restore();

                const tex = new THREE.CanvasTexture(canvas);
                tex.needsUpdate = true;
                activeTexture = tex;
                setTexture(tex);
            } catch (err) {
                console.warn('Failed to load photo texture', url, err);
                if (cancelled) return;
                const tex = createFallbackTexture('加载失败');
                activeTexture = tex;
                setTexture(tex);
            }
        };

        load();

        return () => {
            cancelled = true;
            if (activeTexture) {
                activeTexture.dispose();
            }
        };
    }, [url, transform?.scale, transform?.offset?.x, transform?.offset?.y]);

    return texture;
};

// --- Base Mesh Component for Photos ---
const PhotoFrameMesh: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    texture: THREE.Texture;
    signatureTexture?: THREE.Texture | null;
    entry?: PhotoEntry;
    onFocus?: (entry: PhotoEntry, screenPos?: { x: number; y: number }) => void;
}> = ({ item, mixFactor, texture, signatureTexture, entry, onFocus }) => {
    const groupRef = useRef<THREE.Group>(null);
    const innerRef = useRef<THREE.Group>(null); 
    const photoMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const frameMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const currentMixRef = useRef(1);
    const worldVec = useMemo(() => new THREE.Vector3(), []);
    const projVec = useMemo(() => new THREE.Vector3(), []);
    
    const vecPos = useMemo(() => new THREE.Vector3(), []);
    const vecScale = useMemo(() => new THREE.Vector3(), []);
    const vecWorld = useMemo(() => new THREE.Vector3(), []);

    const { frameArgs, photoArgs, photoPos, textPos, textArgs } = useMemo(() => {
        const img = texture.image as any;
        const width = img?.width || 1;
        const height = img?.height || 1;
        const aspect = width / height;

        const maxSize = 0.85;
        let pw, ph;

        if (aspect >= 1) {
            pw = maxSize;
            ph = maxSize / aspect;
        } else {
            ph = maxSize;
            pw = maxSize * aspect;
        }

        const mSide = 0.08;
        const mTop = 0.08;
        const mBottom = 0.20;

        const fw = pw + mSide * 2;
        const fh = ph + mTop + mBottom;
        const py = (fh / 2) - mTop - (ph / 2);
        
        // Text Position: Bottom whitespace center
        // Frame goes from -fh/2 to fh/2
        // Bottom edge is -fh/2
        // Text center should be -fh/2 + mBottom/2
        const ty = -(fh / 2) + (mBottom / 2);

        return {
            frameArgs: [fw, fh, 0.05] as [number, number, number],
            photoArgs: [pw, ph] as [number, number],
            photoPos: [0, py, 0.03] as [number, number, number],
            textPos: [0, ty, 0.03] as [number, number, number],
            textArgs: [fw, mBottom] as [number, number]
        };
    }, [texture]);

    useFrame((state, delta) => {
        if (!groupRef.current || !innerRef.current) return;
    const speed = 0.8 * delta;
    currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
    const tRaw = currentMixRef.current;
    const t = Math.pow(tRaw, 0.6); // ease-in to slow early convergence
        
        vecPos.lerpVectors(item.chaosPos, item.targetPos, t);
        groupRef.current.position.copy(vecPos);
        
        vecScale.lerpVectors(item.chaosScale, item.targetScale, t);

        // --- Responsive Scaling Logic ---
        // Get the current viewport width from state (in 3D units at z=0)
        const { width } = state.viewport;
        // Determine if screen is "small" (mobile/tablet portrait)
        const isSmallScreen = width < 22; 
        
        // Scale down photos on small screens to fit better
        const responsiveBaseScale = isSmallScreen ? 0.6 : 1.0;
        vecScale.multiplyScalar(responsiveBaseScale);
        // --------------------------------
        
        const effectStrength = (1.0 - t);
        
        if (t < 0.99) {
             groupRef.current.getWorldPosition(vecWorld);
             const distToCamera = vecWorld.distanceTo(state.camera.position);
             
             // Dynamic zoom adjustment:
             // On mobile, reduce the max zoom when close to avoid overwhelming the screen
             const maxZoom = isSmallScreen ? 1.1 : 1.5; 
             const minZoom = 0.6;

             const perspectiveFactor = THREE.MathUtils.mapLinear(distToCamera, 10, 60, maxZoom, minZoom);
             const dynamicScale = lerp(1.0, perspectiveFactor, effectStrength);
             vecScale.multiplyScalar(dynamicScale);

             if (photoMatRef.current) {
                 const brightness = THREE.MathUtils.mapLinear(distToCamera, 12, 50, 0.9, 0.2);
                 photoMatRef.current.emissiveIntensity = Math.max(0.2, brightness) * effectStrength;
             }
        } else {
             if (photoMatRef.current) photoMatRef.current.emissiveIntensity = 0.25;
        }

        groupRef.current.scale.copy(vecScale);

        if (t > 0.8) {
             groupRef.current.lookAt(0, groupRef.current.position.y, 0); 
             groupRef.current.rotateY(Math.PI); 
             innerRef.current.rotation.z = lerp(innerRef.current.rotation.z, 0, speed);
        } else {
             groupRef.current.lookAt(state.camera.position);
             innerRef.current.rotation.z = lerp(innerRef.current.rotation.z, item.chaosTilt, speed);
        }
    });

    return (
        <group 
          ref={groupRef} 
          onPointerDown={(e) => {
             e.stopPropagation();
             if (onFocus && entry && mixFactor < 0.25) {
                 if (groupRef.current) {
                     groupRef.current.getWorldPosition(worldVec);
                     projVec.copy(worldVec).project(e.camera);
                     const sx = (projVec.x * 0.5 + 0.5) * window.innerWidth;
                     const sy = (projVec.y * -0.5 + 0.5) * window.innerHeight;
                     onFocus(entry, { x: sx, y: sy });
                 } else {
                     onFocus(entry, { x: e.clientX, y: e.clientY });
                 }
             }
          }}
        >
            <group ref={innerRef}>
                {/* Frame */}
                <mesh>
                    <boxGeometry args={frameArgs} />
                    <meshStandardMaterial 
                        ref={frameMatRef}
                        color="#ffffff" 
                        roughness={1.0}
                        metalness={0.0}
                        emissive="#ffffff"
                        emissiveIntensity={0.6}
                        toneMapped={false} 
                    />
                </mesh>
                {/* Photo */}
                <mesh position={photoPos}>
                    <planeGeometry args={photoArgs} />
                    <meshStandardMaterial 
                        ref={photoMatRef}
                        map={texture} 
                        emissiveMap={texture} 
                        roughness={0.4} 
                        metalness={0.0}
                        color="white"
                        emissive="white" 
                        emissiveIntensity={0.25}
                        toneMapped={false} 
                    />
                </mesh>
                {/* Signature Text Plane */}
                {signatureTexture && (
                    <mesh position={textPos}>
                        <planeGeometry args={textArgs} />
                        <meshBasicMaterial 
                            map={signatureTexture}
                            transparent={true}
                            opacity={0.85}
                            depthWrite={false} // Prevent z-fighting glitch with frame
                        />
                    </mesh>
                )}
            </group>
        </group>
    );
};

// --- Procedural Gift Box Component ---
const smooth = (t: number) => t * t * (3 - 2 * t);

const GiftBoxMesh: React.FC<{
    item: OrnamentData;
    mixFactor: number;
}> = ({ item, mixFactor }) => {
    const groupRef = useRef<THREE.Group>(null);
    const currentMixRef = useRef(mixFactor);
    
    const vecPos = useMemo(() => new THREE.Vector3(), []);
    const vecScale = useMemo(() => new THREE.Vector3(), []);
    
    // Auto-detect ribbon color for contrast
    const { ribbonColor, ribbonMaterial } = useMemo(() => {
        const c = item.color;
        const luminance = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        
        let ribColorStr = "#FFD700"; // Default Gold
        
        // Logic for ribbon color selection:
        // If box is very blue/cool, use Silver ribbon.
        // If box is bright/white/gold, use Red ribbon.
        // Otherwise (Dark Red/Green), use Gold ribbon.
        if (c.b > c.r + 0.2 && c.b > c.g + 0.2) {
             ribColorStr = "#E0E0E0"; // Silver
        } else if (luminance > 0.6) {
             ribColorStr = "#AA0000"; // Red
        }

        return {
            ribbonColor: new THREE.Color(ribColorStr),
            ribbonMaterial: new THREE.MeshStandardMaterial({
                color: ribColorStr,
                roughness: 0.2,
                metalness: 0.8,
                emissive: ribColorStr,
                emissiveIntensity: 0.2
            })
        }
    }, [item.color]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        const speed = 0.9 * delta;
        currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
        const t = smooth(currentMixRef.current);
        
        vecPos.lerpVectors(item.chaosPos, item.targetPos, t);
        groupRef.current.position.copy(vecPos);
        
        vecScale.lerpVectors(item.chaosScale, item.targetScale, t);
        groupRef.current.scale.copy(vecScale);
        
        groupRef.current.rotation.copy(item.rotation);
        
        if (t < 0.5) {
             groupRef.current.rotation.x += delta * 0.5;
             groupRef.current.rotation.y += delta * 0.5;
        }
    });

    return (
        <group ref={groupRef}>
            {/* Box Body */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial 
                    color={item.color} 
                    roughness={0.4}
                    metalness={0.1}
                />
            </mesh>
            
            {/* Ribbon 1 (X-Loop) */}
            <mesh scale={[0.2, 1.01, 1.01]} material={ribbonMaterial}>
                <boxGeometry args={[1, 1, 1]} />
            </mesh>

            {/* Ribbon 2 (Z-Loop) */}
            <mesh scale={[1.01, 1.01, 0.2]} material={ribbonMaterial}>
                <boxGeometry args={[1, 1, 1]} />
            </mesh>
            
            {/* Bow Knot */}
            <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} material={ribbonMaterial} scale={[0.35, 0.35, 0.35]}>
                 <torusKnotGeometry args={[0.6, 0.15, 64, 8, 2, 3]} />
            </mesh>
        </group>
    );
};

interface OrnamentMeshProps {
    item: OrnamentData;
    mixFactor: number;
    type: 'BALL' | 'STAR' | 'CANDY' | 'CRYSTAL';
    geometry: THREE.BufferGeometry;
    candyTexture?: THREE.Texture | null;
}

// Separated to keep a stable component identity; otherwise React remounts on every mix change
const OrnamentMesh: React.FC<OrnamentMeshProps> = ({ item, mixFactor, type, geometry, candyTexture }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const currentMixRef = useRef(mixFactor);
    const currentPos = useRef(new THREE.Vector3());
    const currentScale = useRef(new THREE.Vector3());

    // Initialize position/scale based on current mix to avoid jumps on mount
    useLayoutEffect(() => {
      if (!meshRef.current) return;
      const t = smooth(currentMixRef.current);
      currentPos.current.lerpVectors(item.chaosPos, item.targetPos, t);
      meshRef.current.position.copy(currentPos.current);
      currentScale.current.lerpVectors(item.chaosScale, item.targetScale, t);
      meshRef.current.scale.copy(currentScale.current);
    }, [item]);

    useFrame((state, delta) => {
      if (!meshRef.current || !materialRef.current) return;
      const speed = 0.9 * delta;
      currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
      const t = smooth(currentMixRef.current);

      currentPos.current.lerpVectors(item.chaosPos, item.targetPos, t);
      meshRef.current.position.copy(currentPos.current);

      if (type === 'STAR' && t > 0.8) {
         meshRef.current.lookAt(0, currentPos.current.y, 0); 
         meshRef.current.rotateZ(Math.PI / 2); 
      } else if (type === 'CRYSTAL' && t > 0.8) {
         meshRef.current.lookAt(0, currentPos.current.y, 0); 
      } else {
         meshRef.current.rotation.copy(item.rotation);
         if (t < 0.5) {
             meshRef.current.rotation.x += delta * 0.5;
             meshRef.current.rotation.y += delta * 0.5;
         }
      }

      currentScale.current.lerpVectors(item.chaosScale, item.targetScale, t);
      meshRef.current.scale.copy(currentScale.current);
    });

    const color = type === 'CANDY' ? '#ffffff' : `#${item.color.getHexString()}`;
    const metal = type === 'CRYSTAL' ? 0.9 : 0.2;
    const rough = type === 'CANDY' ? 0.25 : 0.35;
    const emissive = type === 'CRYSTAL' ? '#112244' : '#111111';
    const emissiveIntensity = type === 'CRYSTAL' ? 0.25 : 0.05;
    const tex = type === 'CANDY' ? candyTexture : undefined;

    return (
      <mesh ref={meshRef} position={item.targetPos} rotation={item.rotation} scale={item.targetScale}>
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          ref={materialRef}
          map={tex}
          color={color}
          roughness={rough}
          metalness={metal}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    );
};

const generateCardTexture = (message?: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0,0, 256, 320);
        if (message) {
            ctx.fillStyle = '#d9d9d9';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = "bold 24px 'Times New Roman', serif";
            const lines = message.split(/\r?\n/);
            const lineHeight = 32;
            const centerY = canvas.height / 2;
            const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
            lines.forEach((line, idx) => {
                ctx.fillText(line, canvas.width / 2, startY + idx * lineHeight, canvas.width - 40);
            });
        }
    }
    return new THREE.CanvasTexture(canvas);
}

const UserPhotoOrnament: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    url: string;
    signatureTexture?: THREE.Texture | null;
    entry?: PhotoEntry;
    onFocus?: (entry: PhotoEntry) => void;
    transform?: PhotoTransform;
}> = ({ item, mixFactor, url, signatureTexture, entry, onFocus, transform }) => {
    const texture = usePhotoTexture(url, transform);
    if (!texture) return null;
    return <PhotoFrameMesh item={item} mixFactor={mixFactor} texture={texture} signatureTexture={signatureTexture} entry={entry} onFocus={onFocus} />;
};

const SuspensePhotoOrnament = (props: any) => {
     return (
        <React.Suspense fallback={
             <group position={props.item.targetPos}>
                <mesh scale={props.item.targetScale}>
                    <boxGeometry args={[1, 1.2, 0.05]} />
                    <meshStandardMaterial color="#eee" />
                </mesh>
             </group>
        }>
            <UserPhotoOrnament {...props} />
        </React.Suspense>
    )
}

// Defines phase offsets for different ornament types to prevent overlap
const getTypeOffsetIndex = (type: string) => {
    switch(type) {
        case 'BALL': return 0;
        case 'BOX': return 1;
        case 'STAR': return 2;
        case 'CANDY': return 3;
        case 'CRYSTAL': return 4;
        case 'PHOTO': return 5;
        default: return 0;
    }
}

const Ornaments: React.FC<OrnamentsProps> = ({ mixFactor, type, count, colors, scale = 1, userImages = [], imageKeyMap = {}, signatureText, customCards = [], onFocusMedia, photoTransforms = {} }) => {
  const photoGroupRef = useRef<THREE.Group>(null);

  const candyTexture = useMemo(() => {
      if (type === 'CANDY') return generateCandyStripeTexture();
      return null;
  }, [type]);

  // Generate signature texture
  // Only generate if type is PHOTO and we have text
  const signatureTexture = useMemo(() => {
      if (type === 'PHOTO' && signatureText) {
          return generateSignatureTexture(signatureText);
      }
      return null;
  }, [type, signatureText]);

  // Generate specific geometry based on type
  const geometry = useMemo(() => {
      switch(type) {
          case 'CANDY':
              return createCandyCaneGeometry();
          case 'CRYSTAL': // Snowflake
              return createStarGeometry(6, 1.0, 0.3, 0.1); 
          case 'STAR':
              return createStarGeometry(5, 1.0, 0.5, 0.2);
          case 'BALL':
              return new THREE.SphereGeometry(1, 16, 16);
          case 'BOX':
          default:
              return new THREE.BoxGeometry(1, 1, 1);
      }
  }, [type]);

  const photoCount = type === 'PHOTO' ? (userImages?.length || 0) + (customCards?.length || 0) : count;

  const data = useMemo(() => {
    const items: OrnamentData[] = [];
    
    // Golden Spiral Constants
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.399 rads
    const treeHeight = 18;
    const treeRadiusBase = 7.5;
    const apexY = 9; // Top of the foliage volume
    
    // Phase offset per type to avoid different ornaments overlapping
    const typeIndex = getTypeOffsetIndex(type);
    const angleOffset = typeIndex * (Math.PI * 2 / 6); // Spread 6 types over 360 deg

    const total = type === 'PHOTO' ? photoCount : count;

    for (let i = 0; i < total; i++) {
      // --- Deterministic Golden Spiral Position ---
      
      // Vertical distribution:
      // We want uniform density on the conical surface.
      // Surface area of cone slice at distance d from apex is proportional to d^2.
      // So cumulative distribution function CDF(d) ~ d^2.
      // Inverse CDF for uniform variable u [0,1] is d ~ sqrt(u).
      // This means we need more points near the bottom (max d).
      
      // Use (i+1)/count to avoid 0 radius at exact apex
      // Limit to 0.9 (90%) so ornaments don't hang below the tree bottom
      const progress = Math.sqrt((i + 1) / count) * 0.9; // 0 (Top) -> 0.9 (Near Bottom)
      
      const r = progress * treeRadiusBase;
      const y = apexY - progress * treeHeight;
      const theta = i * goldenAngle + angleOffset;

      // Convert polar to Cartesian
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      
      const tPos = new THREE.Vector3(x, y, z);
      
      // Push out slightly to sit on surface
      const pushOut = (type === 'STAR' || type === 'PHOTO') ? 1.15 : 1.08;
      tPos.multiplyScalar(pushOut);

      // --- Chaos Position (Random) ---
      let cPos: THREE.Vector3;
      let chaosTilt = 0;
      
      if (type === 'PHOTO') {
          // Special chaos arrangement for photos
          const chaosRadius = 18;
          const chaosHeightRange = 12;
          const chaosY = ((i / count) - 0.5) * chaosHeightRange;
          // Use simple spiral for chaos too, just wider
          const chaosTheta = i * goldenAngle;
          cPos = new THREE.Vector3(chaosRadius * Math.cos(chaosTheta), chaosY, chaosRadius * Math.sin(chaosTheta));
          chaosTilt = ((i % 5) - 2) * 0.15; 
      } else {
          cPos = randomVector3(25);
      }

      const colorHex = colors ? colors[Math.floor(Math.random() * colors.length)] : '#ffffff';

      const baseScaleVec = new THREE.Vector3(1, 1, 1);
      const randScale = Math.random() * 0.4 + 0.8;
      
      if (type === 'CANDY') {
          baseScaleVec.setScalar(0.7); 
      } else if (type === 'CRYSTAL') {
          baseScaleVec.setScalar(0.6); // Snowflakes
      } else if (type === 'STAR') {
          baseScaleVec.setScalar(0.7);
      } else if (type === 'BOX') {
          // Randomized aspect ratio for gift boxes
          baseScaleVec.set(
              1.0 + Math.random() * 0.3, 
              0.7 + Math.random() * 0.4, 
              1.0 + Math.random() * 0.3
          );
      }

      const targetScale = baseScaleVec.clone().multiplyScalar(scale * randScale);
      
      let chaosScale = targetScale.clone();
      if (type === 'PHOTO') {
          const photoScale = 3.5 + Math.random() * 1.5;
          chaosScale.multiplyScalar(photoScale);
      }

      items.push({
        chaosPos: cPos,
        targetPos: tPos,
        rotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, 0),
        color: new THREE.Color(colorHex),
        targetScale: targetScale,
        chaosScale: chaosScale,
        chaosTilt: chaosTilt
      });
    }
    return items;
  }, [count, type, colors, scale, photoCount]);

  const cardTextures = useMemo(() => {
      if (type !== 'PHOTO') return [];
      return (customCards || []).map(card => ({
          id: card.id,
          texture: generateCardTexture(card.message || ''),
          signatureTexture: generateSignatureTexture(card.signature || ''),
          message: card.message,
          signatureText: card.signature
      }));
  }, [type, customCards]);

  const photoEntries = useMemo(() => {
      if (type !== 'PHOTO') return [];
      const entries: PhotoEntry[] = [];
      userImages?.forEach((url, idx) => {
          if (url) {
              const key = imageKeyMap[url] || `img-${idx}-${url}`;
              entries.push({ key: `${key}-${idx}`, kind: 'image', url, signatureTexture: signatureTexture, signatureText, cacheKey: key, transform: photoTransforms?.[key], editable: false });
          }
      });
      cardTextures.forEach(card => {
          entries.push({ key: `card-${card.id}`, kind: 'card', texture: card.texture, signatureTexture: card.signatureTexture, message: card.message, signatureText: card.signatureText || '', id: card.id, editable: false });
      });
      return entries;
  }, [type, userImages, signatureTexture, cardTextures, imageKeyMap, photoTransforms]);

  const emitFocus = useCallback((entry: PhotoEntry, origin?: { x: number; y: number }) => {
      if (!onFocusMedia) return;
      onFocusMedia({
          kind: entry.kind,
          url: entry.url,
          message: entry.message,
          signature: entry.signatureText ?? null,
          id: entry.id,
          cacheKey: entry.cacheKey,
          editable: entry.editable
      }, origin);
  }, [onFocusMedia]);

  // Auto-focus removed: photos are enlarged only via explicit click/tap.

  if (type === 'PHOTO') {
      if (photoEntries.length === 0) return null;
      return (
          <group ref={photoGroupRef}>
              {data.map((item, i) => {
                  const entry = photoEntries[i];
                  if (!entry) return null;
                  if (entry.kind === 'image' && entry.url) {
                      return <SuspensePhotoOrnament key={entry.key} item={item} mixFactor={mixFactor} url={entry.url} signatureTexture={entry.signatureTexture} entry={entry} onFocus={emitFocus} transform={entry.transform} />;
                  }
                  if (entry.kind === 'card' && entry.texture) {
                      return <PhotoFrameMesh key={entry.key} item={item} mixFactor={mixFactor} texture={entry.texture} signatureTexture={entry.signatureTexture} entry={entry} onFocus={emitFocus} />;
                  }
                  return null;
              })}
          </group>
      )
  }

  // Use Detailed GiftBox Mesh
  // For Boxes, keep detailed mesh to preserve ribbon/textures and colors
  if (type === 'BOX') {
      return (
          <group>
              {data.map((item, i) => (
                  <GiftBoxMesh key={i} item={item} mixFactor={mixFactor} />
              ))}
          </group>
      );
  }

  // Render non-photo ornaments individually to restore reliable per-color shading
  return (
    <group>
      {data.map((item, i) => (
        <OrnamentMesh 
            key={i} 
            item={item} 
            mixFactor={mixFactor} 
            type={type} 
            geometry={geometry} 
            candyTexture={candyTexture}
        />
      ))}
    </group>
  );
};

export default Ornaments;
