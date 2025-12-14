import { Object3DNode } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            ambientLight: Object3DNode<THREE.AmbientLight, typeof THREE.AmbientLight>;
            pointLight: Object3DNode<THREE.PointLight, typeof THREE.PointLight>;
            spotLight: Object3DNode<THREE.SpotLight, typeof THREE.SpotLight>;
            fog: Object3DNode<THREE.Fog, typeof THREE.Fog>;
            color: Object3DNode<THREE.Color, typeof THREE.Color>;
            group: Object3DNode<THREE.Group, typeof THREE.Group>;
            // Add others if needed
        }
    }
}
