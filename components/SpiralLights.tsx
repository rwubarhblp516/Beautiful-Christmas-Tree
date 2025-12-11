import React, { useMemo, useRef, useLayoutEffect } from 'react'
import { extend, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { generateSpiralData, lerp } from '../utils/math'

interface SpiralLightsProps {
  mixFactor: number
}

// Register three primitives for JSX
extend({
  InstancedMesh: THREE.InstancedMesh,
  SphereGeometry: THREE.SphereGeometry,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
})

const SpiralLights: React.FC<SpiralLightsProps> = ({ mixFactor }) => {
  const count = 220
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const currentMixRef = useRef(1)
  const phaseOffsets = useMemo(
    () => Array.from({ length: count }, () => Math.random() * Math.PI * 2),
    [count]
  )

  const { target, chaos } = useMemo(
    () => generateSpiralData(count, 19, 7.5, 9),
    [count]
  )

  useLayoutEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < count; i++) {
      dummy.position.set(target[i * 3], target[i * 3 + 1], target[i * 3 + 2])
      dummy.scale.setScalar(0.08 + Math.random() * 0.03)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [target, dummy, count])

  useFrame((state, delta) => {
    if (!meshRef.current) return
    const speed = 2.0 * delta
    currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed)
    const t = currentMixRef.current
    const time = state.clock.elapsedTime

    for (let i = 0; i < count; i++) {
      const tx = target[i * 3]
      const ty = target[i * 3 + 1]
      const tz = target[i * 3 + 2]
      const cx = chaos[i * 3]
      const cy = chaos[i * 3 + 1]
      const cz = chaos[i * 3 + 2]

      const x = lerp(cx, tx, t)
      const y = lerp(cy, ty, t)
      const z = lerp(cz, tz, t)

      dummy.position.set(x, y, z)

      const pulse = Math.sin(time * 3 + phaseOffsets[i]) * 0.025 + 0.1
      dummy.scale.setScalar(pulse + (1 - t) * 0.05)

      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial
        color="#fff2cc"
        transparent
        opacity={0.9}
        toneMapped={false}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

export default SpiralLights
