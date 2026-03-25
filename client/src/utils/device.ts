export const isIOSUserAgent = (userAgent: string): boolean => /iP(hone|ad|od)/i.test(userAgent);

export const isAndroidUserAgent = (userAgent: string): boolean => /Android/i.test(userAgent);

export const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return isIOSUserAgent(navigator.userAgent || "");
};

export const isAndroidDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return isAndroidUserAgent(navigator.userAgent || "");
};

export const isCoarsePointerDevice = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
};

export const isSmallViewport = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 900px)").matches;
};

export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export const isLowPowerDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;

  const cpuCores = navigator.hardwareConcurrency;
  const memoryInGb = "deviceMemory" in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;

  const lowCpu = typeof cpuCores === "number" && cpuCores > 0 && cpuCores <= 4;
  const lowMemory = typeof memoryInGb === "number" && memoryInGb > 0 && memoryInGb <= 4;

  return lowCpu || lowMemory;
};

export const shouldEnableIOSPerfMode = (): boolean => {
  return isIOSDevice() && (isCoarsePointerDevice() || isSmallViewport());
};

export const shouldEnableReducedEffectsMode = (): boolean => {
  if (shouldEnableIOSPerfMode()) return true;
  if (prefersReducedMotion()) return true;

  const mobileTouch = isCoarsePointerDevice() && isSmallViewport();
  if (mobileTouch) return true;

  return isLowPowerDevice() || (isAndroidDevice() && isCoarsePointerDevice());
};
