
import React, { useState } from 'react';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShare: () => Promise<string | null>; // Returns the generated URL or null on failure
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, onShare }) => {
    const [status, setStatus] = useState<'idle' | 'compressing' | 'uploading' | 'done' | 'error'>('idle');
    const [shareUrl, setShareUrl] = useState<string>('');
    const [errorMsg, setErrorMsg] = useState<string>('');

    if (!isOpen) return null;

    const handleStartShare = async () => {
        try {
            setStatus('compressing');
            const url = await onShare();
            if (url) {
                setShareUrl(url);
                setStatus('done');
            } else {
                setStatus('error');
                setErrorMsg('生成链接失败，请稍后重试');
            }
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err.message || '未知错误');
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            // Could show toast here, but for now simple alert or button change
            alert('已复制到剪贴板');
        });
    };

    const handleClose = () => {
        setStatus('idle');
        setShareUrl('');
        setErrorMsg('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-md bg-white/10 text-white p-8 rounded-2xl border border-white/15 backdrop-blur-xl shadow-2xl">
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-white/50 hover:text-white transition"
                >
                    ✕
                </button>

                <h2 className="text-2xl font-luxury text-center mb-6 text-[#d4af37] tracking-widest">
                    {status === 'done' ? '您的专属圣诞树' : '分享您的圣诞树'}
                </h2>

                <div className="flex flex-col items-center justify-center space-y-6 min-h-[160px]">
                    {status === 'idle' && (
                        <>
                            <p className="text-center text-white/70 text-sm leading-relaxed">
                                我们将为您生成一个专属链接。<br />
                                您的朋友将看到这棵独一无二的圣诞树，<br />
                                并聆听这段美好的旋律。
                            </p>
                            <button
                                onClick={handleStartShare}
                                className="px-8 py-3 bg-[#d4af37]/80 hover:bg-[#d4af37] text-white font-bold rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:shadow-[0_0_30px_rgba(212,175,55,0.5)]"
                            >
                                生成链接
                            </button>
                        </>
                    )}

                    {(status === 'compressing' || status === 'uploading') && (
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 border-2 border-white/20 border-t-[#d4af37] rounded-full animate-spin mb-4"></div>
                            <span className="text-xs tracking-widest uppercase text-[#d4af37] animate-pulse">
                                {status === 'compressing' ? '正在压缩美好回忆...' : '正在上传至云端...'}
                            </span>
                        </div>
                    )}

                    {status === 'done' && (
                        <div className="w-full space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="p-3 bg-black/40 rounded-lg border border-white/10 flex items-center justify-between gap-2">
                                <span className="text-xs text-white/60 truncate flex-1">{shareUrl}</span>
                                <button
                                    onClick={copyToClipboard}
                                    className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition text-[#d4af37]"
                                >
                                    复制
                                </button>
                            </div>
                            <div className="flex gap-2 justify-center">
                                <a
                                    href={shareUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm transition"
                                >
                                    预览
                                </a>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="text-center space-y-4">
                            <p className="text-red-400 text-sm">{errorMsg}</p>
                            <button
                                onClick={handleStartShare}
                                className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-sm transition"
                            >
                                重试
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
