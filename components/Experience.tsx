
import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import Foliage from './Foliage';
import Ornaments from './Ornaments';
import SpiralLights from './SpiralLights';
import Snow from './Snow';
import TopStar from './TopStar';
import { TreeColors } from '../types';

interface ExperienceProps {
  mixFactor: number;
  colors: TreeColors;
  inputRef: React.MutableRefObject<{ x: number, y: number, isDetected?: boolean }>;
  userImages?: string[];
  signatureText?: string;
}

// COLORS FOR REALISTIC OBJECTS
const BALL_COLORS = [
    '#8B0000', // Dark Red
    '#D32F2F', // Bright Red
    '#1B5E20', // Dark Green
    '#D4AF37', // Gold 
    '#C0C0C0', // Silver
    '#191970'  // Midnight Blue
]; 

const BOX_COLORS = [
    '#800000', // Maroon
    '#1B5E20', // Forest Green
    '#D4AF37', // Gold
    '#FFFFFF', // White
    '#4B0082', // Indigo/Deep Purple
    '#2F4F4F', // Dark Slate Gray
    '#008080', // Teal
    '#8B4513', // Bronze/SaddleBrown
    '#DC143C'  // Crimson
];

const STAR_COLORS = ['#FFD700', '#FDB931']; // Gold variations
const CRYSTAL_COLORS = ['#F0F8FF', '#E0FFFF', '#B0E0E6']; // Ice Blues and Whites for Snowflakes
// Set Candy base to white, as stripes are handled via texture in Ornaments.tsx
const CANDY_COLORS = ['#FFFFFF']; 

// Handles Camera Parallax, Tree Rotation (Drag) and Zoom (Wheel)
const SceneController: React.FC<{ 
    inputRef: React.MutableRefObject<{ x: number, y: number, isDetected?: boolean }>, 
    groupRef: React.RefObject<THREE.Group> 
}> = ({ inputRef, groupRef }) => {
    const { camera, gl } = useThree();
    const vec = useMemo(() => new THREE.Vector3(), []);
    
    // Interaction State
    const zoomTarget = useRef(32); 
    const isDragging = useRef(false);
    const lastPointerX = useRef(0);
    
    // Physics State
    const rotationVelocity = useRef(0.002); // Start with slow auto-spin
    
    // Hand Control State
    const wasDetected = useRef(false); // To detect the "grab" frame
    const grabOffset = useRef(0);      // The rotation offset when grabbed
    
    // Smooth Input State (for Parallax)
    const currentInput = useRef({ x: 0, y: 0 }); 

    useEffect(() => {
        const canvas = gl.domElement;
        canvas.style.touchAction = 'none';

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoomTarget.current += e.deltaY * 0.02;
            zoomTarget.current = THREE.MathUtils.clamp(zoomTarget.current, 12, 55);
        };

        const onPointerDown = (e: PointerEvent) => {
            if (e.button === 0) { 
                isDragging.current = true;
                lastPointerX.current = e.clientX;
                canvas.setPointerCapture(e.pointerId);
                rotationVelocity.current = 0; // Stop auto-spin on grab
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            isDragging.current = false;
            canvas.releasePointerCapture(e.pointerId);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (isDragging.current && groupRef.current) {
                const deltaX = e.clientX - lastPointerX.current;
                lastPointerX.current = e.clientX;
                // Mouse still uses impulse/velocity logic
                const rotationAmount = deltaX * 0.005;
                groupRef.current.rotation.y += rotationAmount;
                rotationVelocity.current = rotationAmount;
            }
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerleave', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);

        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
        };
    }, [gl, groupRef]);

    useFrame((state, delta) => {
        const safeDelta = Math.min(delta, 0.1);

        // 1. Smooth Input Interpolation (Parallax Logic)
        const targetX = inputRef.current.x;
        const targetY = inputRef.current.y;
        const isHandDetected = !!inputRef.current.isDetected;
        
        // Slower smoothing for parallax (hides jitter from AI)
        const inputSmoothing = 4.0 * safeDelta;
        currentInput.current.x = THREE.MathUtils.lerp(currentInput.current.x, targetX, inputSmoothing);
        currentInput.current.y = THREE.MathUtils.lerp(currentInput.current.y, targetY, inputSmoothing);

        // 2. Camera Update
        const camX = currentInput.current.x * 4; 
        const camY = currentInput.current.y * 2; 
        const camZ = zoomTarget.current + Math.abs(currentInput.current.x) * 2; 
        camera.position.lerp(vec.set(camX, camY, camZ), 2.0 * safeDelta);
        camera.lookAt(0, 0, 0);

        // 3. Tree Rotation Physics
        if (groupRef.current) {
            
            if (isHandDetected) {
                // --- HAND CONTROL (GRAB MODE) ---
                
                // Sensitivity: Full screen width (x: -1 to 1) = 1.2 Full Rotation
                const HAND_ROTATION_FACTOR = Math.PI * 1.2; 
                const targetHandRotation = currentInput.current.x * HAND_ROTATION_FACTOR;

                if (!wasDetected.current) {
                    // Just grabbed
                    grabOffset.current = groupRef.current.rotation.y - targetHandRotation;
                    rotationVelocity.current = 0;
                }

                // Desired Angle
                const targetAngle = targetHandRotation + grabOffset.current;
                
                // PERFORMANCE FIX: 
                // Reduced smoothFactor from 15.0 to 6.0. 
                // Since we throttled the AI to save GPU, we need a looser spring (more smoothing)
                // to interpolate the lower framerate of the hand data.
                const smoothFactor = 6.0 * safeDelta;
                
                const prevRot = groupRef.current.rotation.y;
                groupRef.current.rotation.y = THREE.MathUtils.lerp(prevRot, targetAngle, smoothFactor);
                
                // Calculate implicit velocity
                rotationVelocity.current = (groupRef.current.rotation.y - prevRot);

                wasDetected.current = true;

            } else {
                // --- IDLE / MOUSE CONTROL (INERTIA MODE) ---
                
                if (wasDetected.current) {
                    if (Math.abs(rotationVelocity.current) < 0.0001) {
                        rotationVelocity.current = 0.002; 
                    }
                    wasDetected.current = false;
                }

                if (!isDragging.current) {
                    // Auto-spin / Inertia
                    groupRef.current.rotation.y += rotationVelocity.current;
                    
                    const baseSpeed = 0.002;
                    rotationVelocity.current = THREE.MathUtils.lerp(rotationVelocity.current, baseSpeed, safeDelta * 0.5);
                }
            }
        }
    });
    
    return null;
};

const SceneContent: React.FC<ExperienceProps> = ({ mixFactor, colors, inputRef, userImages, signatureText }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const photoCount = (userImages && userImages.length > 0) ? userImages.length : 10;

  return (
    <>
      <SceneController inputRef={inputRef} groupRef={groupRef} />
      
      <ambientLight intensity={0.4} />
      <spotLight position={[20, 20, 20]} angle={0.4} penumbra={1} intensity={2.0} color="#fff5d0" castShadow />
      <pointLight position={[-10, 5, -10]} intensity={1.2} color="#00ff00" />
      <pointLight position={[10, -5, 10]} intensity={1.2} color="#ff0000" />
      <pointLight position={[0, 10, 10]} intensity={0.5} color="#ffffff" />
      
      <Environment 
        files='/hdri/potsdamer_platz_1k.hdr' 
        background={false} 
      />
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

      <Snow mixFactor={mixFactor} />

      <group ref={groupRef} position={[0, 0, 0]}>
        
        {/* The Golden Top Star */}
        <TopStar mixFactor={mixFactor} />

        {/* Dense Foliage */}
        <Foliage mixFactor={mixFactor} colors={colors} />
        
        {/* Spiral Light Strip */}
        <SpiralLights mixFactor={mixFactor} />
        
        {/* Ornaments - Realistic Objects */}
        <Ornaments 
            mixFactor={mixFactor} 
            type="BALL" 
            count={60} 
            scale={0.5}
            colors={BALL_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="BOX" // Gift Boxes
            count={30} 
            scale={0.6}
            colors={BOX_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="STAR" // 5-Point Stars
            count={25} 
            scale={0.5}
            colors={STAR_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="CRYSTAL" // Snowflakes
            count={40} 
            scale={0.4}
            colors={CRYSTAL_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="CANDY" // Candy Canes
            count={40} 
            scale={0.8}
            colors={CANDY_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="PHOTO" 
            count={photoCount} 
            userImages={userImages}
            signatureText={signatureText}
        />
      </group>

      <EffectComposer enableNormalPass={false}>
        <Bloom 
            luminanceThreshold={0.9} 
            mipmapBlur 
            intensity={1.2} 
            radius={0.6}
        />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
};

const Experience: React.FC<ExperienceProps> = (props) => {
  return (
    <Canvas
      dpr={[1, 1.25]} // Cap DPR at 1.25 to save GPU for AI
      camera={{ position: [0, 0, 32], fov: 45 }}
      gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      shadows
      style={{ touchAction: 'none' }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
};

export default Experience;
