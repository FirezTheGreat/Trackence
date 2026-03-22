const rawAppName = import.meta.env.VITE_APP_NAME || import.meta.env.VITE_WEBSITE_NAME || "Trackence";

const deriveShortName = (name: string) => {
  const splitCamel = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  const initials = splitCamel
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || name.slice(0, 3).toUpperCase();
};

export const APP_NAME = rawAppName;
export const APP_SHORT_NAME = deriveShortName(rawAppName);
