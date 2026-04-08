const UPLOAD_MAX_SIDE = 1920;
const THUMB_MAX_SIDE = 480;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.86;

export const MAX_POST_IMAGES = 6;
export const MAX_POST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export type ProcessedImagePayload = {
  optimizedFile: File;
  thumbFile: File;
  width: number;
  height: number;
};

const sanitizeBaseName = (name: string): string => {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'image';
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen.'));
    };
    image.src = objectUrl;
  });

const resizeDimensions = (width: number, height: number, maxSide: number) => {
  if (width <= maxSide && height <= maxSide) return { width, height };
  const ratio = width / height;
  if (ratio >= 1) {
    return {
      width: maxSide,
      height: Math.max(1, Math.round(maxSide / ratio))
    };
  }
  return {
    width: Math.max(1, Math.round(maxSide * ratio)),
    height: maxSide
  };
};

const canvasToBlob = async (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo convertir la imagen.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
};

const encodeCanvas = async (
  canvas: HTMLCanvasElement,
  baseName: string,
  preferredType: 'image/webp' | 'image/jpeg'
): Promise<File> => {
  const typeCandidates =
    preferredType === 'image/webp'
      ? [
          { type: 'image/webp', quality: WEBP_QUALITY, ext: 'webp' },
          { type: 'image/jpeg', quality: JPEG_QUALITY, ext: 'jpg' }
        ]
      : [
          { type: 'image/jpeg', quality: JPEG_QUALITY, ext: 'jpg' },
          { type: 'image/webp', quality: WEBP_QUALITY, ext: 'webp' }
        ];

  for (const candidate of typeCandidates) {
    try {
      const blob = await canvasToBlob(canvas, candidate.type, candidate.quality);
      return new File([blob], `${baseName}.${candidate.ext}`, {
        type: candidate.type,
        lastModified: Date.now()
      });
    } catch {
      // Try next codec fallback.
    }
  }

  throw new Error('No se pudo codificar la imagen.');
};

const drawResizedCanvas = (
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo inicializar el compresor de imagen.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas;
};

export const validateImageFile = (file: File): string | null => {
  if (!file.type.startsWith('image/')) {
    return `${file.name}: solo se permiten imagenes.`;
  }
  if (file.size > MAX_POST_IMAGE_SIZE_BYTES) {
    return `${file.name}: supera el limite de 5 MB.`;
  }
  return null;
};

export const processImageForPost = async (file: File): Promise<ProcessedImagePayload> => {
  const image = await loadImage(file);
  const safeBaseName = sanitizeBaseName(file.name);
  const optimizedDims = resizeDimensions(image.naturalWidth, image.naturalHeight, UPLOAD_MAX_SIDE);
  const thumbDims = resizeDimensions(image.naturalWidth, image.naturalHeight, THUMB_MAX_SIDE);

  const optimizedCanvas = drawResizedCanvas(image, optimizedDims.width, optimizedDims.height);
  const thumbCanvas = drawResizedCanvas(image, thumbDims.width, thumbDims.height);

  const optimizedFile = await encodeCanvas(optimizedCanvas, `${safeBaseName}-opt`, 'image/webp');
  const thumbFile = await encodeCanvas(thumbCanvas, `${safeBaseName}-thumb`, 'image/webp');

  return {
    optimizedFile,
    thumbFile,
    width: optimizedDims.width,
    height: optimizedDims.height
  };
};
