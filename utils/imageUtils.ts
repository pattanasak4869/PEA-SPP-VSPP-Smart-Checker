
/**
 * Utility to compress base64 images to stay within localStorage limits
 */
export const compressBase64Image = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    // If not an image or already small, return as is
    if (!base64Str.startsWith('data:image/') || base64Str.length < 50 * 1024) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Compress
      const isPng = base64Str.includes('image/png');
      const format = isPng ? 'image/png' : 'image/jpeg';
      const compressedBase64 = canvas.toDataURL(format, isPng ? undefined : quality);
      
      // Only use compressed if it's actually smaller
      resolve(compressedBase64.length < base64Str.length ? compressedBase64 : base64Str);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};
