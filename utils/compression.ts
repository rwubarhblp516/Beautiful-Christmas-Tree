
import imageCompression from 'browser-image-compression';

export async function compressImageForShare(file: File | Blob): Promise<string> {
    const options = {
        maxSizeMB: 0.15, // Aim for ~150KB per image
        maxWidthOrHeight: 1280,
        useWebWorker: true,
    };

    try {
        const compressedFile = await imageCompression(file instanceof File ? file : new File([file], "image.jpg"), options);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(compressedFile);
        });
    } catch (error) {
        console.error("Compression failed:", error);
        throw error;
    }
}

export async function urlToBlob(url: string): Promise<Blob> {
    const res = await fetch(url);
    return await res.blob();
}
