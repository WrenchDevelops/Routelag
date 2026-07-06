export const PROFILE_AVATAR_KEY = "routelag.profileAvatar";

const MAX_EDGE = 256;
const JPEG_QUALITY = 0.86;

export function loadProfileAvatar(): string | null {
  try {
    const value = window.localStorage.getItem(PROFILE_AVATAR_KEY);
    return value && value.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

export function saveProfileAvatar(dataUrl: string | null) {
  if (!dataUrl) {
    window.localStorage.removeItem(PROFILE_AVATAR_KEY);
    return;
  }
  window.localStorage.setItem(PROFILE_AVATAR_KEY, dataUrl);
}

export async function readImageFileAsAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }

  const source = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process that image.");
  }
  context.drawImage(source, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > 900_000) {
    throw new Error("That image is still too large after resizing.");
  }
  return dataUrl;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}
