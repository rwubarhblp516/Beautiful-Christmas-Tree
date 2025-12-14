export type TreeState = 'CHAOS' | 'FORMED';

export interface TreeColors {
  bottom: string;
  top: string;
}

export interface HandGesture {
  isOpen: boolean;
  position: { x: number; y: number }; // Normalized -1 to 1
  isDetected: boolean;
}

export interface SharedTreeData {
  images: Array<{ key: string; data: string }>; // base64
  cards: Array<{ id: string; message: string; signature: string }>;
  signatures: Record<string, string>;
  transforms: Record<string, { scale: number; offset: { x: number; y: number } }>;
}
