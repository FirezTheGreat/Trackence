export const isIOSUserAgent = (userAgent: string): boolean => /iP(hone|ad|od)/i.test(userAgent);

export const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return isIOSUserAgent(navigator.userAgent || "");
};

export const isCoarsePointerDevice = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
};

export const isSmallViewport = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 900px)").matches;
};

export const shouldEnableIOSPerfMode = (): boolean => {
  return isIOSDevice() && (isCoarsePointerDevice() || isSmallViewport());
};
