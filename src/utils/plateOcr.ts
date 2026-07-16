export type PlateOcrResult = {
  plate: string | null;
  text: string;
};

const OCR_ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const OLD_PLATE_PATTERN = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

function normalizeOcrText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function formatPlateCandidate(value: string) {
  const compact = normalizeOcrText(value).replace(/[^A-Z0-9]/g, "");
  if (OLD_PLATE_PATTERN.test(compact)) return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  if (MERCOSUL_PLATE_PATTERN.test(compact)) return compact;
  return null;
}

export function extractPlateCandidateFromText(text: string) {
  const normalized = normalizeOcrText(text).replace(/[^A-Z0-9\s-]/g, " ");
  const separatedMatches = [
    ...normalized.matchAll(/[A-Z]{3}[-\s]?[0-9]{4}/g),
    ...normalized.matchAll(/[A-Z]{3}[-\s]?[0-9][A-Z][0-9]{2}/g),
  ];

  for (const match of separatedMatches) {
    const plate = formatPlateCandidate(match[0]);
    if (plate) return plate;
  }

  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  for (let index = 0; index <= compact.length - 7; index += 1) {
    const plate = formatPlateCandidate(compact.slice(index, index + 7));
    if (plate) return plate;
  }

  return null;
}

async function loadImageFromDataUrl(photoData: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível preparar a imagem para OCR."));
    image.src = photoData;
  });
}

async function prepareImageForPlateOcr(photoData: string) {
  const image = await loadImageFromDataUrl(photoData);
  const maxWidth = 1400;
  const maxHeight = 1000;
  const downscale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * downscale));
  const height = Math.max(1, Math.round(image.height * downscale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return photoData;

  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const contrast = 1.35;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const grayscale = red * 0.299 + green * 0.587 + blue * 0.114;
    const adjusted = Math.max(0, Math.min(255, (grayscale - 128) * contrast + 128));
    imageData.data[index] = adjusted;
    imageData.data[index + 1] = adjusted;
    imageData.data[index + 2] = adjusted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function recognizePlateFromPhoto(photoData: string): Promise<PlateOcrResult> {
  const preparedImage = await prepareImageForPlateOcr(photoData);
  const tesseractModule = await import("tesseract.js/dist/tesseract.esm.min.js");
  const { createWorker, PSM } = tesseractModule.default;
  const worker = await createWorker("eng");

  try {
    await worker.setParameters({
      tessedit_char_whitelist: OCR_ALLOWED_CHARS,
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const result = await worker.recognize(preparedImage);
    const text = result.data.text || "";
    return { plate: extractPlateCandidateFromText(text), text };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
