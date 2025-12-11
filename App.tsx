
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Experience from './components/Experience';
import GestureController from './components/GestureController';
import { TreeColors, HandGesture } from './types';
import { loadCachedImagesWithKeys, saveImagesToCacheWithKeys, deleteCachedImages } from './utils/idb';

const clampValue = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const DraggableZoomableImage: React.FC<{
  src: string;
  scale: number;
  offset: { x: number; y: number }; // normalized to image width/height (0.1 = 10% shift)
  onScale: (s: number | ((p: number) => number)) => void;
  onOffset: (o: { x: number; y: number } | ((p: { x: number; y: number }) => { x: number; y: number })) => void;
  onReset: () => void;
  editable: boolean;
  showInlineControls?: boolean;
}> = ({ src, scale, offset, onScale, onOffset, onReset, editable, showInlineControls = true }) => {
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    draggingRef.current = true;
    lastRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !draggingRef.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const dx = e.clientX - lastRef.current.x;
    const dy = e.clientY - lastRef.current.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    const normDx = rect.width ? dx / rect.width : 0;
    const normDy = rect.height ? dy / rect.height : 0;
    onOffset(prev => ({
      x: clampValue(prev.x + normDx, -0.6, 0.6),
      y: clampValue(prev.y + normDy, -0.6, 0.6),
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.1;
    onScale((prev: number | ((p: number) => number)) => {
      const base = typeof prev === 'number' ? prev : prev(1);
      return clampValue(base + delta, 0.5, 2.5);
    });
  };

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${editable ? 'cursor-grab' : 'cursor-default'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      <img
        src={src}
        alt="Memory"
    draggable={false}
    className="absolute left-1/2 top-1/2 select-none"
    style={{
          transform: `translate(-50%, -50%) translate(${(offset.x * 100).toFixed(4)}%, ${(offset.y * 100).toFixed(4)}%) scale(${scale})`,
          transformOrigin: 'center center',
          maxWidth: 'none',
          maxHeight: 'none',
        }}
      />
      {editable && showInlineControls && (
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={() => onScale((s: number) => clampValue(s - 0.15, 0.5, 2.5))}
            className="w-8 h-8 rounded-full bg-black/70 text-white text-sm border border-white/20 hover:bg-white hover:text-black transition"
          >
            -
          </button>
          <button
            onClick={onReset}
            className="px-3 h-8 rounded-full bg-white/80 text-black text-xs border border-black/20 hover:bg-black hover:text-white transition"
          >
            重置
          </button>
          <button
            onClick={() => onScale((s: number) => clampValue(s + 0.15, 0.5, 2.5))}
            className="w-8 h-8 rounded-full bg-black/70 text-white text-sm border border-white/20 hover:bg-white hover:text-black transition"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const ROMANTIC_LINES = [
    "我爱你，胜过世间所有的灯火。",
    "今晚的星星都在替我眨眼。",
    "你的名字，是我听过最温柔的咒语。",
    "想和你看漫天雪落，也想和你看烟火。",
    "落笔是你，心声也是你。",
    "把所有温柔和浪漫留给你。",
    "风都知道我等你。",
    "世界很冷，但你很暖。",
    "我绕了一圈星河，只为靠近你。",
    "余生请多指教。"
  ];
  // 1 = Formed, 0 = Chaos.
  const [targetMix, setTargetMix] = useState(1); 
  // Default colors kept, UI control removed
  const [colors] = useState<TreeColors>({ bottom: '#022b1c', top: '#217a46' });
  
  // inputRef now tracks detection state for physics switching
  const inputRef = useRef({ x: 0, y: 0, isDetected: false });
  
  // Image Upload State
  const [userImages, setUserImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signature Modal State
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatureText, setSignatureText] = useState("");
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
  const [cardMessage, setCardMessage] = useState("我一直都想对你说~");
  const [customCards, setCustomCards] = useState<Array<{ id: string; message: string; signature: string }>>([]);
  const messageRef = useRef<HTMLDivElement>(null);
  const [focusedEntry, setFocusedEntry] = useState<{ kind: 'image' | 'card'; url?: string; message?: string; signature?: string | null; id?: string; cacheKey?: string; editable?: boolean } | null>(null);
  const [focusOrigin, setFocusOrigin] = useState<{ x: number; y: number } | null>(null);
  const [focusActive, setFocusActive] = useState(false);
  const [focusedSignature, setFocusedSignature] = useState("");
  const [focusScale, setFocusScale] = useState(1);
  const [focusOffset, setFocusOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cardsLoaded, setCardsLoaded] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [pendingBgFile, setPendingBgFile] = useState<File | null>(null);
  const [pendingBgUrl, setPendingBgUrl] = useState<string | null>(null);
  const [photoSignatures, setPhotoSignatures] = useState<Record<string, string>>({});
  const [photoTransforms, setPhotoTransforms] = useState<Record<string, { scale: number; offset: { x: number; y: number } }>>({});
  const [draftBgScale, setDraftBgScale] = useState(1);
  const [draftBgOffset, setDraftBgOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Camera Gui Visibility
  const [showCamera, setShowCamera] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [bgmReady, setBgmReady] = useState(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  
  const MAX_CACHE_IMAGES = 50;
  const [userImageRecords, setUserImageRecords] = useState<Array<{ key: string; url: string }>>([]);
  const currentUrlsRef = useRef<string[]>([]);

  const revokeBlobUrls = (urls: string[]) => {
      urls.forEach(url => {
          if (url && url.startsWith('blob:')) {
              URL.revokeObjectURL(url);
          }
      });
  };
  const revokeUrl = (url?: string | null) => {
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  };

  // Load photo signature map
  useEffect(() => {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem('photo_signatures_v1');
      if (raw) {
          try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                  setPhotoSignatures(parsed);
              }
          } catch (err) {
              console.warn('Failed to parse photo signatures', err);
          }
      }
  }, []);

  // Persist photo signature map
  useEffect(() => {
      if (typeof window === 'undefined') return;
      localStorage.setItem('photo_signatures_v1', JSON.stringify(photoSignatures));
  }, [photoSignatures]);

  // Load saved photo transforms (scale/offset)
  useEffect(() => {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem('photo_transforms_v1');
      if (raw) {
          try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                  setPhotoTransforms(parsed);
              }
          } catch (err) {
              console.warn('Failed to parse photo transforms', err);
          }
      }
  }, []);

  // Persist transforms
  useEffect(() => {
      if (typeof window === 'undefined') return;
      localStorage.setItem('photo_transforms_v1', JSON.stringify(photoTransforms));
  }, [photoTransforms]);

  const applyImageRecords = (records: Array<{ key: string; url: string }>) => {
      const urls = records.map(r => r.url);
      setUserImages(prev => {
          // revoke only removed urls to avoid breaking alive blobs
          const nextSet = new Set(urls);
          const toRevoke = prev.filter(u => !nextSet.has(u));
          revokeBlobUrls(toRevoke);
          currentUrlsRef.current = urls;
          return urls;
      });
      setUserImageRecords(records);
      setPhotoTransforms(prev => {
          const next: typeof prev = {};
          records.forEach(rec => {
              if (prev[rec.key]) next[rec.key] = prev[rec.key];
          });
          return Object.keys(prev).length === Object.keys(next).length ? prev : next;
      });
  };

  const initAudio = useCallback(() => {
      if (!bgmRef.current) {
          const bg = new Audio('/audio/bgm.mp3');
          bg.loop = true;
          bg.autoplay = true;
          bg.preload = 'auto';
          bg.volume = isMuted ? 0 : volume;
          bgmRef.current = bg;
      }
  }, [isMuted, volume]);

  const ensureAudioStarted = useCallback(() => {
      initAudio();
      if (bgmRef.current) {
          const bg = bgmRef.current;
          bg.muted = false;
          bg.volume = isMuted ? 0 : volume;
          bg
            .play()
            .then(() => setBgmReady(true))
            .catch(() => {
                // Fallback: try muted autoplay then unmute
                bg.muted = true;
                bg.volume = 0;
                bg.play()
                  .then(() => {
                      bg.muted = false;
                      bg.volume = isMuted ? 0 : volume;
                      setBgmReady(true);
                  })
                  .catch(() => {
                      // Autoplay blocked; wait for user gesture
                  });
            });
      }
  }, [initAudio, isMuted, volume]);

  // Load cached images on first render (stored in IndexedDB)
  useEffect(() => {
      loadCachedImagesWithKeys(MAX_CACHE_IMAGES)
        .then(records => {
            if (records.length > 0) {
                applyImageRecords(records);
            }
        })
        .catch(err => console.warn('Failed to load cached photos', err));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
      return () => {
          revokeBlobUrls(currentUrlsRef.current);
          revokeUrl(pendingBgUrl);
      };
  }, [pendingBgUrl]);

  // Try to start BGM on load (will silently fail if autoplay blocked)
  useEffect(() => {
      ensureAudioStarted();
      const onFirstInteraction = () => {
          ensureAudioStarted();
      };
      const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
      events.forEach(ev => window.addEventListener(ev, onFirstInteraction, { once: true }));

      const onVisible = () => {
          if (!document.hidden) ensureAudioStarted();
      };
      document.addEventListener('visibilitychange', onVisible);

      return () => {
          events.forEach(ev => window.removeEventListener(ev, onFirstInteraction));
          document.removeEventListener('visibilitychange', onVisible);
      };
  }, [ensureAudioStarted]);

  // Apply mute/unmute to audio refs
  useEffect(() => {
      if (bgmRef.current) {
          bgmRef.current.volume = isMuted ? 0 : volume;
          if (!isMuted && bgmReady) {
              bgmRef.current.play().catch(() => {});
          }
      }
  }, [isMuted, bgmReady, volume]);

  // Wrap in useCallback to prevent new function creation on every render
  const handleGesture = useCallback((data: HandGesture) => {
    if (data.isDetected) {
        const newTarget = data.isOpen ? 0 : 1;
        setTargetMix(prev => {
            if (prev !== newTarget) return newTarget;
            return prev;
        });
        
        inputRef.current = { 
            x: data.position.x * 1.2, 
            y: data.position.y,
            isDetected: true
        };
    } else {
        // Mark as not detected, keep last position to avoid jumps before fade out
        inputRef.current.isDetected = false;
    }
  }, []);

  const toggleState = () => {
      setTargetMix(prev => prev === 1 ? 0 : 1);
      ensureAudioStarted();
  };

  const handleUploadClick = () => {
      fileInputRef.current?.click();
      ensureAudioStarted();
  };

  const handleSignatureClick = () => {
      // Always start from blank (text card)
      setActivePhotoUrl(null);
      setCardMessage("我一直都想对你说~");
      setSignatureText("");
      setPendingBgFile(null);
      revokeUrl(pendingBgUrl);
      setPendingBgUrl(null);
      setDraftBgScale(1);
      setDraftBgOffset({ x: 0, y: 0 });
      setIsSignatureOpen(true);
  };

  const randomRomanticLine = () => {
      const pick = ROMANTIC_LINES[Math.floor(Math.random() * ROMANTIC_LINES.length)];
      setActivePhotoUrl(null);
      setCardMessage(pick);
      setSignatureText("");
      setPendingBgFile(null);
      revokeUrl(pendingBgUrl);
      setPendingBgUrl(null);
      setDraftBgScale(1);
      setDraftBgOffset({ x: 0, y: 0 });
  };

  // Refresh only modal content, do not add to tree
  const handleRandomPhoto = () => {
      randomRomanticLine();
  };

  // Load cached custom cards from localStorage
  useEffect(() => {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem('custom_cards_v1');
      if (raw) {
          try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                  setCustomCards(parsed.filter(item => item && item.id && item.message !== undefined && item.signature !== undefined));
              }
          } catch (err) {
              console.warn('Failed to parse cached cards', err);
          }
      }
      setCardsLoaded(true);
  }, []);

  // Persist custom cards
  useEffect(() => {
      if (typeof window === 'undefined') return;
       if (!cardsLoaded) return;
      localStorage.setItem('custom_cards_v1', JSON.stringify(customCards));
  }, [customCards, cardsLoaded]);

  // Keep editable message surface in sync when state changes
  useEffect(() => {
      if (messageRef.current && messageRef.current.innerText !== cardMessage) {
          messageRef.current.innerText = cardMessage;
      }
  }, [cardMessage, isSignatureOpen]);
  
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          revokeUrl(pendingBgUrl);
          const url = URL.createObjectURL(file);
          setPendingBgFile(file);
          setPendingBgUrl(url);
          setActivePhotoUrl(url);
          setCardMessage("");
          setDraftBgScale(1);
          setDraftBgOffset({ x: 0, y: 0 });
      }
  };

  const handleAddCard = () => {
      ensureAudioStarted();
      const trimmedMessage = cardMessage.trim() || "我一直都想对你说~";
      const trimmedSignature = signatureText.trim();
      // If用户上传了背景图片，作为照片加入树；否则加入文字卡片
      if (pendingBgFile) {
          (async () => {
              try {
                  const records = await saveImagesToCacheWithKeys([pendingBgFile], MAX_CACHE_IMAGES);
                  if (records.length) {
                      applyImageRecords([...records, ...userImageRecords].slice(0, MAX_CACHE_IMAGES));
                      setPhotoTransforms(prev => {
                          const next = { ...prev };
                          records.forEach(rec => {
                              next[rec.key] = { scale: draftBgScale, offset: draftBgOffset };
                          });
                          return next;
                      });
                  }
              } catch (err) {
                  console.warn('Failed to save bg photo, fallback to object URL', err);
                  if (pendingBgUrl) {
                      const tempKey = `temp-${Math.random().toString(16).slice(2)}`;
                      const next = [{ key: tempKey, url: pendingBgUrl }, ...userImageRecords].slice(0, MAX_CACHE_IMAGES);
                      applyImageRecords(next);
                      setPhotoTransforms(prev => ({
                          ...prev,
                          [tempKey]: { scale: draftBgScale, offset: draftBgOffset }
                      }));
                  }
              } finally {
                  setPendingBgFile(null);
                  setPendingBgUrl(null);
                  setDraftBgScale(1);
                  setDraftBgOffset({ x: 0, y: 0 });
              }
          })();
      } else {
          const id = (crypto?.randomUUID?.() ?? `card-${Date.now()}-${Math.random().toString(16).slice(2)}`);
          setCustomCards(prev => [...prev, { id, message: trimmedMessage, signature: trimmedSignature }]);
      }
      setIsSignatureOpen(false);
      setTargetMix(1);
      setActivePhotoUrl(null);
  };

  const toggleMute = () => {
      ensureAudioStarted();
      setIsMuted(prev => !prev);
  };

  const handleFocusMedia = useCallback((entry: { kind: 'image' | 'card'; url?: string; message?: string; signature?: string | null; id?: string; cacheKey?: string; editable?: boolean }, screenPos?: { x: number; y: number }) => {
      const key = entry.cacheKey || entry.url || entry.id || '';
      const normalizedEntry = entry.kind === 'image'
        ? { ...entry, editable: entry.editable ?? true }
        : { ...entry, editable: entry.editable ?? false };

      setFocusedEntry(normalizedEntry);
      if (entry.kind === 'image') {
          setFocusedSignature(photoSignatures[key] || "");
          const t = key ? photoTransforms[key] : undefined;
          setFocusScale(t?.scale ?? 1);
          setFocusOffset(t?.offset ?? { x: 0, y: 0 });
      } else {
          setFocusedSignature(entry.signature || "");
          setFocusScale(1);
          setFocusOffset({ x: 0, y: 0 });
      }
      if (screenPos) {
          setFocusOrigin(screenPos);
      } else {
          setFocusOrigin(null);
      }
      setFocusActive(false);
      requestAnimationFrame(() => setFocusActive(true));
  }, [photoSignatures, photoTransforms]);

  const closeFocused = () => {
      setFocusActive(false);
      setTimeout(() => setFocusedEntry(null), 300);
  };

  const handleSaveSignature = () => {
      if (!focusedEntry || !focusedEntry.editable) return;
      if (focusedEntry.kind === 'image') {
          const key = focusedEntry.cacheKey || focusedEntry.url || focusedEntry.id;
          if (!key) return;
          setPhotoSignatures(prev => ({ ...prev, [key]: focusedSignature }));
          setPhotoTransforms(prev => ({
              ...prev,
              [key]: {
                  scale: clampValue(focusScale, 0.5, 2.5),
                  offset: {
                      x: clampValue(focusOffset.x, -0.6, 0.6),
                      y: clampValue(focusOffset.y, -0.6, 0.6)
                  }
              }
          }));
      } else {
          if (!focusedEntry.id) return;
          setCustomCards(prev => prev.map(c => c.id === focusedEntry.id ? { ...c, signature: focusedSignature } : c));
      }
      // Close the focus overlay and bring back manager
      closeFocused();
      setIsManageOpen(true);
  };

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const nudgeScale = (delta: number) => setFocusScale(s => clamp(s + delta, 0.5, 2.5));
  const resetTransform = () => {
      setFocusScale(1);
      setFocusOffset({ x: 0, y: 0 });
  };

  const handleDeletePhoto = async (recordKey: string, url: string) => {
      revokeUrl(url);
      const next = userImageRecords.filter(r => r.key !== recordKey);
      applyImageRecords(next);
      try {
          await deleteCachedImages([recordKey]);
      } catch (err) {
          console.warn('Failed to delete cached image', err);
      }
      setPhotoSignatures(prev => {
          const copy = { ...prev };
          delete copy[recordKey];
          return copy;
      });
      setPhotoTransforms(prev => {
          const copy = { ...prev };
          delete copy[recordKey];
          return copy;
      });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setIsProcessing(true);
          
          // 1. Immediately disperse the tree (Chaos State) behind the loading screen
          setTargetMix(0);
          
          // Defer processing to next tick to allow React to render the loading screen first
          setTimeout(() => {
              (async () => {
                  const files = Array.from(e.target.files!).slice(0, MAX_CACHE_IMAGES); // Limit to 50
                  let records: Array<{ key: string; url: string }> = [];

                  try {
                      records = await saveImagesToCacheWithKeys(files, MAX_CACHE_IMAGES);
                  } catch (err) {
                      console.warn('Failed to persist images to IndexedDB, falling back to object URLs', err);
                      records = files.map(file => ({
                        key: `temp-${Math.random().toString(16).slice(2)}`,
                        url: URL.createObjectURL(file)
                      }));
                  }

                  applyImageRecords(records);

                  // Reset input
                  if (fileInputRef.current) fileInputRef.current.value = '';

                  // Keep loader visible for a moment to cover the texture upload stutter
                  setTimeout(() => {
                      setIsProcessing(false);
                      
                      // 2. Trigger the "Ritual" Assembly Animation
                      // Wait a brief moment after loader vanishes so user sees the scattered photos,
                      // then fly them into position.
                      setTimeout(() => {
                          setTargetMix(1);
                      }, 800);

                  }, 1200); 
              })();
          }, 50);
      }
  };

  // Unified Icon Button Style - Premium Silver Glassmorphism (Circular)
  const iconButtonClass = `
    group relative 
    w-10 h-10 md:w-12 md:h-12
    rounded-full 
    bg-black/30 backdrop-blur-md 
    border border-white/20 
    text-slate-300 
    transition-all duration-500 ease-out 
    hover:border-white/60 hover:text-white hover:bg-white/10 
    hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] 
    active:scale-90 active:bg-white/20
    flex justify-center items-center cursor-pointer
  `;

  // Standard Text Button for Modal
  const textButtonClass = `
    group relative 
    w-auto px-8 h-10
    overflow-hidden rounded-sm 
    bg-black/80 backdrop-blur-md 
    border border-white/40 
    text-slate-300 font-luxury text-[11px] uppercase tracking-[0.25em] 
    transition-all duration-500 ease-out 
    hover:border-white/80 hover:text-black hover:bg-white 
    hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] 
    active:scale-95
    flex justify-center items-center cursor-pointer
  `;

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*" 
        multiple
        className="hidden"
      />
      {/* Hidden BG Upload for Polaroid */}
      <input
        type="file"
        ref={bgFileInputRef}
        onChange={handleBgUpload}
        accept="image/*"
        className="hidden"
      />

      {/* LOADING OVERLAY */}
      {isProcessing && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-500 animate-in fade-in">
              <div className="relative w-16 h-16 mb-6">
                  {/* Outer Ring */}
                  <div className="absolute inset-0 border-2 border-t-[#d4af37] border-r-transparent border-b-[#d4af37] border-l-transparent rounded-full animate-spin"></div>
                  {/* Inner Ring */}
                  <div className="absolute inset-2 border-2 border-t-transparent border-r-white/30 border-b-transparent border-l-white/30 rounded-full animate-spin-reverse"></div>
                  {/* Center Star */}
                  <div className="absolute inset-0 flex items-center justify-center text-[#d4af37] text-xl animate-pulse">✦</div>
              </div>
              <div className="text-[#d4af37] font-luxury tracking-[0.25em] text-xs uppercase animate-pulse">
                  圣诞树装饰中...
              </div>
              <style>{`
                @keyframes spin-reverse {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
                .animate-spin-reverse {
                    animation: spin-reverse 2s linear infinite;
                }
              `}</style>
          </div>
      )}

      {/* MANAGE CACHE MODAL */}
      {isManageOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="relative w-full max-w-4xl bg-white/10 text-white p-6 md:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.6)] rounded-2xl border border-white/15 backdrop-blur-xl">
                <button 
                  onClick={() => setIsManageOpen(false)}
                  className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-black text-white border border-white/30 flex items-center justify-center hover:bg-white hover:text-black transition"
                >
                  ×
                </button>
                <h3 className="text-xl font-luxury uppercase tracking-[0.4em] mb-4 text-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">缓存管理</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
                    <div>
                        <div className="text-sm text-white/80 mb-2">照片 ({userImageRecords.length})</div>
                        <div className="flex flex-col gap-2">
                            {userImageRecords.length === 0 && <div className="text-white/40 text-xs">暂无照片</div>}
                            {userImageRecords.map(rec => (
                                <div key={rec.key} className="flex items-center gap-3 bg-white/10 p-2 rounded-lg border border-white/10 backdrop-blur-sm">
                                    <img src={rec.url} alt="cached" className="w-16 h-16 object-cover rounded-sm" />
                                    <div className="flex-1 text-xs text-white/80 break-all">{rec.key}</div>
                                    <button
                                      onClick={() => { handleFocusMedia({ kind: 'image', url: rec.url, cacheKey: rec.key, editable: true }); setIsManageOpen(false); }}
                                      className="px-2 py-1 text-xs bg-white/20 border border-white/30 rounded-full hover:bg-white/30"
                                    >
                                      查看
                                    </button>
                                    <button
                                      onClick={() => handleDeletePhoto(rec.key, rec.url)}
                                      className="px-2 py-1 text-xs bg-red-500/30 border border-red-400/60 rounded-full hover:bg-red-500/50"
                                    >
                                      删除
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-white/80 mb-2">拍立得签名 ({customCards.length})</div>
                        <div className="flex flex-col gap-2">
                            {customCards.length === 0 && <div className="text-white/40 text-xs">暂无卡片</div>}
                            {customCards.map(card => (
                                <div key={card.id} className="flex items-center gap-3 bg-white/10 p-2 rounded-lg border border-white/10 backdrop-blur-sm">
                                    <div className="flex-1 text-xs text-white/85 line-clamp-2">{card.message || "无内容"}</div>
                                    <button
                                      onClick={() => { handleFocusMedia({ kind: 'card', message: card.message, signature: card.signature, id: card.id, editable: true }); setIsManageOpen(false); }}
                                      className="px-2 py-1 text-xs bg-white/20 border border-white/30 rounded-full hover:bg-white/30"
                                    >
                                      查看
                                    </button>
                                    <button
                                      onClick={() => setCustomCards(prev => prev.filter(c => c.id !== card.id))}
                                      className="px-2 py-1 text-xs bg-red-500/30 border border-red-400/60 rounded-full hover:bg-red-500/50"
                                    >
                                      删除
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* CENTER TITLE - Ethereal Silver Script */}
      {/* Layer: z-0 (Background layer, behind the tree) */}
      <div className={`fixed top-[6%] left-0 w-full flex justify-center px-10 md:px-32 pointer-events-none z-50 transition-opacity duration-700 ${isSignatureOpen ? 'opacity-0' : 'opacity-100'}`}>
        <h1 
            className="font-script font-normal text-8xl md:text-[10rem] text-center leading-[1.2] py-6"
            style={{
                // Silver Metallic Gradient
                background: 'linear-gradient(to bottom, #ffffff 20%, #e8e8e8 50%, #b0b0b0 90%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                // 3D Depth Shadows + Glow
                filter: 'drop-shadow(0px 5px 5px rgba(0,0,0,0.8)) drop-shadow(0px 0px 20px rgba(255,255,255,0.4))'
            }}
        >
             *Merry * Christmas*
        </h1>
      </div>

      {/* 3D Scene */}
      {/* Layer: z-10 (Foreground layer, tree renders on top of text) */}
      <div className={`absolute inset-0 z-10 transition-all duration-700 ${isSignatureOpen ? 'blur-sm scale-95 opacity-50' : 'blur-0 scale-100 opacity-100'}`}>
        <Experience 
            mixFactor={targetMix}
            colors={colors} 
            inputRef={inputRef} 
            userImages={userImages}
            userImageRecords={userImageRecords}
            signatureText={signatureText}
            customCards={customCards}
            onFocusMedia={handleFocusMedia}
            photoTransforms={photoTransforms}
        />
      </div>

      {/* SIGNATURE MODAL OVERLAY */}
      {isSignatureOpen && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity duration-500 animate-in fade-in">
              <div 
                className="relative bg-[#f8f8f8] p-4 pb-12 shadow-[0_0_50px_rgba(255,255,255,0.2)] transform transition-transform duration-700 scale-100 rotate-[-2deg]"
                style={{ width: 'min(80vw, 320px)', aspectRatio: '3.5/4.2' }}
              >
                  {/* Close Button */}
                  <button 
                    onClick={() => setIsSignatureOpen(false)}
                    className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-black border border-white/20 text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors z-50"
                  >
                      ×
                  </button>

                  {/* Photo Area */}
                  <div className="w-full h-[75%] bg-[#1a1a1a] overflow-hidden relative shadow-inner">
                      {activePhotoUrl ? (
                          <DraggableZoomableImage
                            src={activePhotoUrl}
                            scale={draftBgScale}
                            offset={draftBgOffset}
                            onScale={setDraftBgScale}
                            onOffset={setDraftBgOffset}
                            onReset={() => { setDraftBgScale(1); setDraftBgOffset({ x: 0, y: 0 }); }}
                            editable
                            showInlineControls={false}
                          />
                      ) : (
                          <>
                            <div className="w-full h-full flex items-center justify-center text-white/40 font-body text-lg italic tracking-widest text-center px-4" />
                            {/* Editable message overlay */}
                            <div className="absolute inset-0 flex items-center justify-center px-4">
                                <div
                                  ref={messageRef}
                                  contentEditable
                                  suppressContentEditableWarning
                                  data-placeholder="我一直都想对你说~"
                                  className="card-message-editor w-full h-full text-white/85 text-center font-script text-lg leading-7 tracking-widest whitespace-pre-wrap outline-none bg-transparent flex items-center justify-center"
                                  onInput={(e) => setCardMessage((e.target as HTMLDivElement).innerText)}
                                />
                            </div>
                          </>
                      )}
                      {/* Paper grain overlay */}
                      <div 
                        className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-25"
                        style={{
                            backgroundImage: `
                              radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 35%),
                              radial-gradient(circle at 80% 40%, rgba(255,255,255,0.08), transparent 30%),
                              radial-gradient(circle at 40% 70%, rgba(0,0,0,0.25), transparent 30%),
                              repeating-linear-gradient(0deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)
                            `
                        }}
                      />
                      {/* Gloss Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/20 pointer-events-none" />
                  </div>

                  {/* Signature Input Area */}
                  <div className="absolute bottom-0 left-0 w-full h-[25%] flex items-center justify-center px-4">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Sign here..."
                        value={signatureText}
                        onChange={(e) => setSignatureText(e.target.value)}
                        className="w-full text-center bg-transparent border-none outline-none font-script text-3xl md:text-4xl text-[#1a1a1a] placeholder:text-gray-300/50"
                        style={{ transform: 'translateY(-5px) rotate(-1deg)' }}
                        maxLength={20}
                      />
                  </div>
                  {/* Actions: random line + upload bg */}
                  <div className="absolute -bottom-6 right-4 flex gap-2">
                    <button
                      onClick={randomRomanticLine}
                      className="w-10 h-10 rounded-full bg-black text-white border border-white/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.4)] hover:bg-white hover:text-black transition"
                      title="换一条情话"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <path d="M12 5v14m-7-7h14" />
                      </svg>
                    </button>
                    <button
                      onClick={() => bgFileInputRef.current?.click()}
                      className="w-10 h-10 rounded-full bg-black text-white border border-white/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.4)] hover:bg-white hover:text-black transition"
                      title="上传背景照片"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
                        <path d="M12 3v12" />
                        <path d="m8 7 4-4 4 4" />
                      </svg>
                    </button>
                  </div>
              </div>
              
              {/* Confirm Button (Floating below) */}
              <div className="absolute bottom-10 left-0 w-full flex justify-center gap-3">
                  <button 
                    onClick={handleRandomPhoto}
                    className={textButtonClass}
                    disabled={false}
                  >
                      随机一张
                  </button>
                  <button 
                    onClick={handleAddCard}
                    className={textButtonClass}
                  >
                      完成签名
                  </button>
              </div>
              <style>{`
                .card-message-editor:empty:before {
                    content: attr(data-placeholder);
                    color: rgba(255,255,255,0.4);
                    pointer-events: none;
                }
              `}</style>
          </div>
      )}

      {/* FOCUSED MEDIA OVERLAY WITH FLY-IN */}
      {focusedEntry && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md"
          onClick={closeFocused}
        >
            {(() => {
                const isImage = !!focusedEntry?.url;
                const start = (() => {
                    if (focusOrigin) {
                        const dx = focusOrigin.x - window.innerWidth / 2;
                        const dy = focusOrigin.y - window.innerHeight / 2;
                        return `translate(${dx}px, ${dy}px) scale(0.25) rotate(-6deg)`;
                    }
                    return `translate(0, 30px) scale(0.25) rotate(-6deg)`;
                })();
                const active = `translate(0, 0) scale(1) rotate(0deg)`;
                const transform = focusActive ? active : start;
                const opacity = focusActive ? 1 : 0;
                return (
                  <div 
                    className="relative bg-white/90 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] p-4 md:p-6 rounded-2xl border border-white/30"
                    style={{ 
                        width: 'min(90vw, 460px)', 
                        aspectRatio: '3 / 4.3',
                        transform,
                        opacity,
                        transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                      <button 
                        onClick={closeFocused}
                        className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-black text-white border border-white/30 flex items-center justify-center hover:bg-white hover:text-black transition"
                        aria-label="关闭"
                      >
                          ×
                      </button>

                      <div className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden shadow-inner">
                          <div 
                            className={`relative flex-1 ${isImage ? 'bg-white' : 'bg-[#1a1a1a]' } overflow-hidden select-none`}
                          >
                            {isImage && focusedEntry.url ? (
                                <DraggableZoomableImage 
                                  src={focusedEntry.url} 
                                  scale={focusScale} 
                                  offset={focusOffset}
                                  onScale={setFocusScale}
                                  onOffset={setFocusOffset}
                                  onReset={resetTransform}
                                  editable={!!focusedEntry.editable}
                                  showInlineControls={false}
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center px-6 text-white text-center font-script text-3xl leading-relaxed whitespace-pre-wrap">
                                    {focusedEntry.message || "我一直都想对你说~"}
                                </div>
                            )}
                            {!isImage && <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/5 to-white/10 pointer-events-none" />}
                          </div>
                          <div className="h-[22%] flex flex-col justify-center px-4 py-3 bg-white border-top border-black/5">
                              {focusedEntry.editable ? (
                                <>
                                  <input
                                    type="text"
                                    value={focusedSignature}
                                    onChange={(e) => setFocusedSignature(e.target.value)}
                                    placeholder="签名..."
                                    className="w-full text-center bg-transparent border border-black/10 rounded-full py-3 px-4 font-script text-2xl md:text-3xl text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-black/30 transition"
                                  />
                                  <div className="flex justify-center mt-2 gap-2 flex-wrap">
                                      <div className="flex items-center gap-2 bg-black/5 rounded-full px-3 py-1">
                                          <button onClick={() => nudgeScale(-0.15)} className="px-2 py-1 text-xs bg-black text-white rounded-full hover:bg-white hover:text-black transition" disabled={!focusedEntry.editable}>-</button>
                                          <span className="text-xs text-black/70 w-16 text-center">×{focusScale.toFixed(2)}</span>
                                          <button onClick={() => nudgeScale(0.15)} className="px-2 py-1 text-xs bg-black text-white rounded-full hover:bg-white hover:text-black transition" disabled={!focusedEntry.editable}>+</button>
                                          <button onClick={resetTransform} className="px-3 py-1 text-xs bg-white text-black border border-black/20 rounded-full hover:bg-black hover:text-white transition">重置</button>
                                      </div>
                                      <button
                                        onClick={handleSaveSignature}
                                        className="px-4 py-2 text-sm bg-black text-white rounded-full border border-white/20 hover:bg-white hover:text-black transition"
                                      >
                                        保存
                                      </button>
                                  </div>
                                </>
                              ) : (
                                <div className="w-full text-center font-script text-3xl md:text-4xl text-[#1a1a1a] opacity-80">
                                  {focusedSignature || ""}
                                </div>
                              )}
                          </div>
                      </div>
                  </div>
                );
            })()}
        </div>
      )}

      {/* TOP RIGHT - CONTROLS */}
      {/* Responsive positioning: Flex Row on Mobile, Flex Col on Desktop */}
      <div className={`absolute top-6 right-6 md:top-10 md:right-10 z-30 pointer-events-auto flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-4 transition-opacity duration-500 ${isSignatureOpen || isProcessing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          
          {/* 0. Audio Toggle */}
          <button 
            onClick={toggleMute}
            className={`${iconButtonClass} ${!isMuted ? 'text-white border-white/60 bg-white/10' : 'text-slate-300'}`}
            title={isMuted ? "开启音乐" : "静音"}
          >
              {isMuted ? (
                  // Muted Icon
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 8.25L5.25 12h-3v0m0 0h3l4.344 3.75M2.25 12v0l5.64-5.64a.75.75 0 011.11.09l2.476 3.168m-9.226 7.382l2.284-2.284m0 0l2.121-2.122m-2.12 2.122L5.25 12m0 0l2.122-2.121m0 0L10.5 6.75m0 0l8.25 8.25m-8.25-8.25L7.371 9.879M19.5 8.25A4.5 4.5 0 0118 16.64" />
                  </svg>
              ) : (
                  // Volume Icon
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 5.25L6 9H3v6h3l5.25 3.75V5.25zm6.428 1.822a6.75 6.75 0 010 9.856M15 9.75a3.75 3.75 0 010 4.5" />
                  </svg>
              )}
          </button>
          
          {/* Volume Slider */}
          <div className="flex items-center gap-2 text-slate-300 text-xs md:text-[10px]">
            <span className="uppercase tracking-widest">Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                ensureAudioStarted();
                setIsMuted(false);
                setVolume(parseFloat(e.target.value));
              }}
              className="w-20 accent-[#d4af37]"
            />
          </div>

          {/* 1. Camera Toggle */}
          <button 
            onClick={() => setShowCamera(prev => !prev)}
            className={`${iconButtonClass} ${showCamera ? 'text-white border-white/60 bg-white/10' : 'text-slate-300'}`}
            title={showCamera ? "隐藏摄像头" : "显示摄像头"}
          >
              {showCamera ? (
                  // Camera On Icon
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
              ) : (
                  // Camera Off Icon (Slash)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-9a2.25 2.25 0 00-2.25-2.25h-9c-.621 0-1.184.252-1.591.659m3.75-3.75l3.75-3.75" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  </svg>
              )}
          </button>

          {/* 2. Upload Photos */}
          <button 
            onClick={handleUploadClick}
            className={iconButtonClass}
            title="上传照片"
          >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
          </button>

          {/* 3. Polaroid Signature */}
          <button 
            onClick={handleSignatureClick}
            className={iconButtonClass}
            title="拍立得签名"
          >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
          </button>

          {/* 4. Disperse/Assemble Toggle */}
          <button 
            onClick={toggleState}
            className={iconButtonClass}
            title={targetMix === 1 ? "散开" : "聚拢"}
          >
            {targetMix === 1 ? (
                // Icon: Disperse (Explosion out)
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
            ) : (
                // Icon: Assemble (Implosion in)
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
            )}
          </button>

          {/* 5. Manage Cache */}
          <button 
            onClick={() => setIsManageOpen(true)}
            className={iconButtonClass}
            title="管理缓存"
          >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15m-15 5.25h15m-15 5.25H12" />
              </svg>
          </button>
      </div>

      {/* Footer Info (Bottom Left) */}
      <div className={`absolute bottom-6 left-6 z-20 pointer-events-none transition-opacity duration-500 ${isSignatureOpen ? 'opacity-0' : 'opacity-100'}`}>
            <div className="text-white/20 text-[10px] uppercase tracking-widest font-luxury">
                <div>一颗美丽的圣诞树</div>
                <div className="text-slate-500">Made by Southpl</div>
            </div>
      </div>

      {/* Logic */}
      <GestureController onGesture={handleGesture} isGuiVisible={showCamera} />
    </div>
  );
};

export default App;
