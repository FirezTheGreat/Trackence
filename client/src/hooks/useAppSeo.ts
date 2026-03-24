import { useHead, useSeoMeta } from "@unhead/react";
import { useLocation } from "react-router-dom";
import { APP_NAME } from "../config/app";

type SEOParams = {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
  isPrivate?: boolean;
  structuredData?: Array<Record<string, unknown>>;
};

const resolveSiteUrl = (): string => {
  const envSite = String(
    import.meta.env.VITE_SITE_URL || import.meta.env.VITE_FRONTEND_URL || ""
  ).trim();

  if (!envSite) return "https://trackence.app";
  return envSite.replace(/\/$/, "");
};

const toAbsoluteUrl = (siteUrl: string, value?: string): string => {
  const input = String(value || "").trim();
  if (!input) return siteUrl;
  if (/^https?:\/\//i.test(input)) return input;
  return `${siteUrl}/${input.replace(/^\//, "")}`;
};

const useAppSeo = ({
  title,
  description,
  image,
  path,
  isPrivate = false,
  structuredData = [],
}: SEOParams) => {
  const location = useLocation();

  const siteUrl = resolveSiteUrl();
  const activePath =
    path !== undefined
      ? path
      : `${location.pathname}${location.search}`;

  const canonicalUrl = toAbsoluteUrl(siteUrl, activePath);

  const defaultTitle = `${APP_NAME} | Attendance Tracker`;
  const defaultDescription =
    String(import.meta.env.VITE_DEFAULT_DESCRIPTION || "").trim() ||
    "Trackence is a secure QR-based attendance platform with real-time session tracking, analytics, and organization-aware access control.";
  const defaultImage =
    String(import.meta.env.VITE_DEFAULT_OG_IMAGE || "").trim() ||
    `${siteUrl}/logo.png`;
  const twitterHandle =
    String(import.meta.env.VITE_TWITTER_HANDLE || "").trim() ||
    "@trackenceapp";
  const themeColor =
    String(import.meta.env.VITE_THEME_COLOR || "").trim() || "#0d0c0c";

  const fullTitle = title || defaultTitle;
  const fullDescription = description || defaultDescription;
  const fullImage = toAbsoluteUrl(siteUrl, image || defaultImage);

  useSeoMeta({
    title: fullTitle,
    description: fullDescription,
    robots: isPrivate ? "noindex,nofollow,noarchive" : "index,follow",
    ...(isPrivate
      ? {}
      : {
          ogTitle: fullTitle,
          ogDescription: fullDescription,
          ogUrl: canonicalUrl,
          ogImage: fullImage,
          ogSiteName: APP_NAME,
          ogLocale: "en_IN",
          ogType: "website",
          twitterCard: "summary_large_image",
          twitterTitle: fullTitle,
          twitterDescription: fullDescription,
          twitterImage: fullImage,
          twitterSite: twitterHandle,
          themeColor,
        }),
  });

  useHead({
    link: isPrivate ? [] : [{ rel: "canonical", href: canonicalUrl }],
    script: structuredData.map((schema, index) => ({
      key: `seo-ld-json-${index}`,
      type: "application/ld+json",
      textContent: JSON.stringify(schema),
    })),
  });
};

export default useAppSeo;
