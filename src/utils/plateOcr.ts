export type PlateOcrResult = {
  plate: string | null;
  text: string;
  source: "ocr" | "known-fuzzy" | "ambiguous" | null;
  matchDistance?: number;
  cropName?: string;
  candidates: string[];
};

type LoadedImageSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

type CropSpec = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  psms: Array<"line" | "block" | "sparse">;
};

type OcrAttempt = {
  cropName: string;
  dataUrl: string;
  inverted: boolean;
  psms: Array<"line" | "block" | "sparse">;
};

type KnownPlateMatch = {
  plate: string;
  source: "ocr" | "known-fuzzy";
  distance: number;
  ambiguous: boolean;
};

const OCR_ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";
const OLD_PLATE_PATTERN = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const OCR_TIMEOUT_MS = 12_000;
const MAX_OCR_WIDTH = 1700;
const MAX_OCR_HEIGHT = 1200;
const MAX_OCR_PIXELS = 1_600_000;

const DIGIT_TO_LETTER: Record<string, string> = {
  "0": "O",
  "1": "I",
  "5": "S",
  "6": "G",
  "8": "B",
};

const LETTER_TO_DIGIT: Record<string, string> = {
  B: "8",
  G: "6",
  I: "1",
  O: "0",
  S: "5",
};

function normalizeOcrText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizePlateValue(value: string) {
  return normalizeOcrText(value).replace(/[^A-Z0-9]/g, "");
}

function isValidPlate(value: string) {
  return OLD_PLATE_PATTERN.test(value) || MERCOSUL_PLATE_PATTERN.test(value);
}

function formatPlateCandidate(value: string) {
  const compact = normalizePlateValue(value);
  if (OLD_PLATE_PATTERN.test(compact)) return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  if (MERCOSUL_PLATE_PATTERN.test(compact)) return compact;
  return null;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function letterOptions(char: string) {
  if (/^[A-Z]$/.test(char)) return [char];
  const mapped = DIGIT_TO_LETTER[char];
  return mapped ? [mapped] : [];
}

function numberOptions(char: string) {
  if (/^[0-9]$/.test(char)) return [char];
  const mapped = LETTER_TO_DIGIT[char];
  return mapped ? [mapped] : [];
}

function combineOptions(options: string[][]) {
  if (options.some((items) => items.length === 0)) return [];
  return options.reduce<string[]>((current, next) => current.flatMap((prefix) => next.map((item) => `${prefix}${item}`)), [""]);
}

function generatePositionCorrectedCandidates(rawValue: string) {
  const compact = normalizePlateValue(rawValue);
  if (compact.length !== 7) return [];

  const direct = isValidPlate(compact) ? [compact] : [];
  const oldPlateOptions = combineOptions([
    letterOptions(compact[0]),
    letterOptions(compact[1]),
    letterOptions(compact[2]),
    numberOptions(compact[3]),
    numberOptions(compact[4]),
    numberOptions(compact[5]),
    numberOptions(compact[6]),
  ]);
  const mercosulOptions = combineOptions([
    letterOptions(compact[0]),
    letterOptions(compact[1]),
    letterOptions(compact[2]),
    numberOptions(compact[3]),
    letterOptions(compact[4]),
    numberOptions(compact[5]),
    numberOptions(compact[6]),
  ]);

  return uniqueValues([
    compact,
    ...direct,
    ...oldPlateOptions.filter((candidate) => OLD_PLATE_PATTERN.test(candidate)),
    ...mercosulOptions.filter((candidate) => MERCOSUL_PLATE_PATTERN.test(candidate)),
  ]);
}

export function extractPlateCandidatesFromText(text: string) {
  const normalized = normalizeOcrText(text).replace(/[^A-Z0-9\s-]/g, " ");
  const candidates: string[] = [];

  for (const match of normalized.matchAll(/[A-Z0-9]{3}[-\s]?[A-Z0-9][-\s]?[A-Z0-9][-\s]?[A-Z0-9]{2}/g)) {
    candidates.push(...generatePositionCorrectedCandidates(match[0]));
  }

  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  for (let index = 0; index <= compact.length - 7; index += 1) {
    candidates.push(...generatePositionCorrectedCandidates(compact.slice(index, index + 7)));
  }

  return uniqueValues(candidates);
}

export function extractPlateCandidateFromText(text: string) {
  const candidate = extractPlateCandidatesFromText(text).find((item) => isValidPlate(item));
  return candidate ? formatPlateCandidate(candidate) : null;
}

function levenshteinDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  const current = new Array<number>(second.length + 1);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    current[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const cost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[second.length];
}

function matchAgainstKnownPlates(candidates: string[], knownPlates: string[]): KnownPlateMatch | null {
  const known = uniqueValues(knownPlates.map(normalizePlateValue).filter((plate) => plate.length === 7));
  const normalizedCandidates = uniqueValues(candidates.map(normalizePlateValue).filter((plate) => plate.length === 7));
  if (known.length === 0 || normalizedCandidates.length === 0) return null;

  const exactMatch = normalizedCandidates.find((candidate) => known.includes(candidate));
  if (exactMatch) return { plate: exactMatch, source: "ocr", distance: 0, ambiguous: false };

  let bestDistance = Number.POSITIVE_INFINITY;
  const bestPlates = new Set<string>();

  for (const knownPlate of known) {
    const distance = Math.min(...normalizedCandidates.map((candidate) => levenshteinDistance(candidate, knownPlate)));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPlates.clear();
      bestPlates.add(knownPlate);
    } else if (distance === bestDistance) {
      bestPlates.add(knownPlate);
    }
  }

  if (bestDistance === 1) {
    return bestPlates.size === 1
      ? { plate: [...bestPlates][0], source: "known-fuzzy", distance: bestDistance, ambiguous: false }
      : { plate: "", source: "known-fuzzy", distance: bestDistance, ambiguous: true };
  }

  if (bestDistance === 2) {
    const closeMatches = known.filter((knownPlate) =>
      normalizedCandidates.some((candidate) => levenshteinDistance(candidate, knownPlate) <= 2),
    );
    const hasStrongPlateCandidate = normalizedCandidates.some((candidate) => isValidPlate(candidate));

    if (bestPlates.size === 1 && closeMatches.length === 1 && hasStrongPlateCandidate) {
      return { plate: [...bestPlates][0], source: "known-fuzzy", distance: bestDistance, ambiguous: false };
    }

    if (closeMatches.length > 1 || bestPlates.size > 1) {
      return { plate: "", source: "known-fuzzy", distance: bestDistance, ambiguous: true };
    }
  }

  return null;
}

function dataUrlToBlob(photoData: string) {
  return fetch(photoData).then((response) => response.blob());
}

async function loadImageFromDataUrl(photoData: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel preparar a imagem para OCR."));
    image.src = photoData;
  });
}

async function loadOrientedImageSource(photoData: string): Promise<LoadedImageSource> {
  if ("createImageBitmap" in window) {
    try {
      const blob = await dataUrlToBlob(photoData);
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fallback abaixo mantém o OCR manual disponível em navegadores sem suporte completo.
    }
  }

  const image = await loadImageFromDataUrl(photoData);
  return { source: image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

function clampCrop(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function buildCropSpecs(width: number, height: number): CropSpec[] {
  const crop = (name: string, x: number, y: number, cropWidth: number, cropHeight: number, scale: number, psms: CropSpec["psms"]): CropSpec => {
    const left = clampCrop(Math.round(x * width), width - 1);
    const top = clampCrop(Math.round(y * height), height - 1);
    const right = clampCrop(Math.round((x + cropWidth) * width), width);
    const bottom = clampCrop(Math.round((y + cropHeight) * height), height);
    return {
      name,
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      scale,
      psms,
    };
  };

  return [
    crop("centro-inferior", 0.08, 0.45, 0.84, 0.4, 3, ["line", "block"]),
    crop("inferior-50", 0, 0.5, 1, 0.5, 2.5, ["line", "block"]),
    crop("inferior-65", 0, 0.35, 1, 0.65, 2.2, ["line", "block"]),
    crop("faixa-central", 0.04, 0.32, 0.92, 0.36, 2.4, ["line", "block"]),
    crop("inferior-central-agressivo", 0.18, 0.52, 0.64, 0.25, 3, ["line", "block"]),
    crop("imagem-inteira", 0, 0, 1, 1, 1.4, ["block", "sparse"]),
  ];
}

function calculateSafeTargetSize(crop: CropSpec) {
  const desiredScale = Math.max(1, crop.scale);
  const widthScale = MAX_OCR_WIDTH / crop.width;
  const heightScale = MAX_OCR_HEIGHT / crop.height;
  const pixelScale = Math.sqrt(MAX_OCR_PIXELS / (crop.width * crop.height));
  const scale = Math.max(1, Math.min(desiredScale, widthScale, heightScale, pixelScale));
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

function otsuThreshold(grayscale: Uint8ClampedArray) {
  const histogram = new Array<number>(256).fill(0);
  for (let index = 0; index < grayscale.length; index += 1) histogram[grayscale[index]] += 1;

  const total = grayscale.length;
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = 0;
  let threshold = 128;

  for (let index = 0; index < 256; index += 1) {
    weightBackground += histogram[index];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = index;
    }
  }

  return threshold;
}

function preprocessCrop(source: LoadedImageSource, crop: CropSpec, inverted: boolean) {
  const target = calculateSafeTargetSize(crop);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.imageSmoothingEnabled = true;
  context.drawImage(source.source, crop.x, crop.y, crop.width, crop.height, 0, 0, target.width, target.height);

  const imageData = context.getImageData(0, 0, target.width, target.height);
  const grayscale = new Uint8ClampedArray(target.width * target.height);
  const contrast = 1.55;

  for (let pixel = 0, grayIndex = 0; pixel < imageData.data.length; pixel += 4, grayIndex += 1) {
    const red = imageData.data[pixel];
    const green = imageData.data[pixel + 1];
    const blue = imageData.data[pixel + 2];
    const gray = red * 0.299 + green * 0.587 + blue * 0.114;
    grayscale[grayIndex] = Math.max(0, Math.min(255, Math.round((gray - 128) * contrast + 128)));
  }

  const threshold = otsuThreshold(grayscale);
  for (let pixel = 0, grayIndex = 0; pixel < imageData.data.length; pixel += 4, grayIndex += 1) {
    const binary = grayscale[grayIndex] > threshold ? 255 : 0;
    const value = inverted ? 255 - binary : binary;
    imageData.data[pixel] = value;
    imageData.data[pixel + 1] = value;
    imageData.data[pixel + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function buildOcrAttempts(photoData: string) {
  const source = await loadOrientedImageSource(photoData);
  try {
    const attempts: OcrAttempt[] = [];
    for (const crop of buildCropSpecs(source.width, source.height)) {
      for (const inverted of [false, true]) {
        const dataUrl = preprocessCrop(source, crop, inverted);
        if (dataUrl) attempts.push({ cropName: crop.name, dataUrl, inverted, psms: crop.psms });
      }
    }
    return attempts;
  } finally {
    source.close?.();
  }
}

function runWithTimeout<T>(promise: Promise<T>, deadline: number) {
  const remaining = Math.max(1, deadline - Date.now());
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("OCR_TIMEOUT")), remaining);
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function isDevelopmentMode() {
  return Boolean((import.meta.env as ImportMetaEnv & { DEV?: boolean }).DEV);
}

function debugOcr(payload: Record<string, unknown>) {
  if (isDevelopmentMode()) console.debug("[plate-ocr]", payload);
}

export async function recognizePlateFromPhoto(photoData: string, knownPlates: string[] = []): Promise<PlateOcrResult> {
  const deadline = Date.now() + OCR_TIMEOUT_MS;
  const attempts = await runWithTimeout(buildOcrAttempts(photoData), deadline);
  const tesseractModule = await import("tesseract.js/dist/tesseract.esm.min.js");
  const { createWorker, PSM } = tesseractModule.default;
  const worker = await createWorker("eng");
  const texts: string[] = [];
  const allCandidates = new Set<string>();
  let bestKnownMatch: KnownPlateMatch | null = null;
  let ambiguous = false;
  let directCandidate: string | null = null;
  let selectedCrop = "";
  let bestKnownCrop = "";

  const psmValues = {
    line: PSM.SINGLE_LINE,
    block: PSM.SINGLE_BLOCK,
    sparse: PSM.SPARSE_TEXT,
  };

  try {
    for (const attempt of attempts) {
      for (const psm of attempt.psms) {
        if (Date.now() >= deadline) throw new Error("OCR_TIMEOUT");

        await runWithTimeout(worker.setParameters({
          tessedit_char_whitelist: OCR_ALLOWED_CHARS,
          tessedit_pageseg_mode: psmValues[psm],
        }), deadline);

        const result = await runWithTimeout(worker.recognize(attempt.dataUrl), deadline);
        const text = result.data.text || "";
        const candidates = extractPlateCandidatesFromText(text);
        texts.push(text);
        candidates.forEach((candidate) => allCandidates.add(candidate));

        const knownMatch = matchAgainstKnownPlates(candidates, knownPlates);
        const validCandidate = candidates.find((candidate) => isValidPlate(candidate));
        if (!directCandidate && validCandidate) directCandidate = validCandidate;

        debugOcr({
          crop: attempt.cropName,
          inverted: attempt.inverted,
          psm,
          text,
          candidates,
          knownMatch,
        });

        if (knownMatch?.ambiguous) {
          ambiguous = true;
          continue;
        }

        if (knownMatch) {
          selectedCrop = attempt.cropName;
          if (knownMatch.distance === 0) {
            return {
              plate: formatPlateCandidate(knownMatch.plate),
              text: texts.join("\n"),
              source: "ocr",
              matchDistance: 0,
              cropName: selectedCrop,
              candidates: uniqueValues([...allCandidates]),
            };
          }
          if (!bestKnownMatch || knownMatch.distance < bestKnownMatch.distance) {
            bestKnownMatch = knownMatch;
            bestKnownCrop = attempt.cropName;
          }
        }
      }
    }

    if (bestKnownMatch && !bestKnownMatch.ambiguous) {
      debugOcr({ selected: bestKnownMatch.plate, distance: bestKnownMatch.distance, crop: bestKnownCrop });
      return {
        plate: formatPlateCandidate(bestKnownMatch.plate),
        text: texts.join("\n"),
        source: "known-fuzzy",
        matchDistance: bestKnownMatch.distance,
        cropName: bestKnownCrop,
        candidates: uniqueValues([...allCandidates]),
      };
    }

    if (ambiguous) {
      return {
        plate: null,
        text: texts.join("\n"),
        source: "ambiguous",
        candidates: uniqueValues([...allCandidates]),
      };
    }

    return {
      plate: directCandidate ? formatPlateCandidate(directCandidate) : null,
      text: texts.join("\n"),
      source: directCandidate ? "ocr" : null,
      candidates: uniqueValues([...allCandidates]),
    };
  } catch (error) {
    debugOcr({ error: error instanceof Error ? error.message : String(error), candidates: [...allCandidates] });
    return {
      plate: bestKnownMatch && !bestKnownMatch.ambiguous ? formatPlateCandidate(bestKnownMatch.plate) : null,
      text: texts.join("\n"),
      source: bestKnownMatch && !bestKnownMatch.ambiguous ? "known-fuzzy" : null,
      matchDistance: bestKnownMatch?.distance,
      cropName: bestKnownCrop || selectedCrop,
      candidates: uniqueValues([...allCandidates]),
    };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
