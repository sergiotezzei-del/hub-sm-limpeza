import type { ReactNode } from "react";

export type AppIconName =
  | "cleaning"
  | "coffee"
  | "water"
  | "security"
  | "guards"
  | "parking"
  | "vehicle"
  | "search"
  | "camera"
  | "edit"
  | "save"
  | "back"
  | "warning"
  | "success"
  | "blocked"
  | "stock"
  | "users"
  | "reports"
  | "qr"
  | "payment"
  | "settings"
  | "map";

type AppIconSize = "sm" | "md" | "lg" | "xl" | number;

type AppIconProps = {
  name: AppIconName;
  size?: AppIconSize;
  className?: string;
  title?: string;
};

const iconSizes: Record<Exclude<AppIconSize, number>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

const iconPaths: Record<AppIconName, ReactNode> = {
  cleaning: (
    <>
      <path d="M7 10h10l-1 9H8l-1-9Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      <path d="M5 19h14" />
      <path d="m15 3 5 5" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
      <path d="M16 10h2a2 2 0 0 1 0 4h-2" />
      <path d="M7 21h10" />
      <path d="M8 3v2" />
      <path d="M12 3v2" />
      <path d="M16 3v2" />
    </>
  ),
  water: (
    <>
      <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z" />
      <path d="M9.5 15.5A3 3 0 0 0 13 18" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  guards: (
    <>
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M3.5 20a4.5 4.5 0 0 1 9 0" />
      <path d="M17 8 14 9.2v3.1c0 2 1.2 3.7 3 4.7 1.8-1 3-2.7 3-4.7V9.2L17 8Z" />
    </>
  ),
  parking: (
    <>
      <path d="M6 21V3h7a5 5 0 0 1 0 10H9" />
      <path d="M9 13V6h4" />
    </>
  ),
  vehicle: (
    <>
      <path d="M4 13 6 7h12l2 6" />
      <path d="M5 13h14v5H5v-5Z" />
      <path d="M7 18v2" />
      <path d="M17 18v2" />
      <path d="M8 16h.01" />
      <path d="M16 16h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h4l1.5-2h5L16 8h4v11H4V8Z" />
      <circle cx="12" cy="13.5" r="3" />
    </>
  ),
  edit: (
    <>
      <path d="M5 19h4l10-10a2.1 2.1 0 0 0-3-3L6 16l-1 3Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v6h7V4" />
      <path d="M8 20v-6h8v6" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  blocked: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m7.5 7.5 9 9" />
    </>
  ),
  stock: (
    <>
      <path d="M4 8h7v11H4V8Z" />
      <path d="M13 5h7v14h-7V5Z" />
      <path d="M7 11h1" />
      <path d="M16 9h1" />
      <path d="M16 13h1" />
    </>
  ),
  users: (
    <>
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 11a2.5 2.5 0 1 0 0-5" />
      <path d="M17 14c2.2.3 3.5 1.8 3.5 4" />
    </>
  ),
  reports: (
    <>
      <path d="M6 3h9l3 3v15H6V3Z" />
      <path d="M15 3v4h4" />
      <path d="M9 17v-4" />
      <path d="M12 17v-7" />
      <path d="M15 17v-2" />
    </>
  ),
  qr: (
    <>
      <path d="M4 4h6v6H4V4Z" />
      <path d="M14 4h6v6h-6V4Z" />
      <path d="M4 14h6v6H4v-6Z" />
      <path d="M14 14h2" />
      <path d="M20 14v2" />
      <path d="M16 16h4v4h-6v-2" />
    </>
  ),
  payment: (
    <>
      <path d="M3 7h18v11H3V7Z" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
      <path d="M15 15h2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1" />
      <path d="m16.3 16.3 2.1 2.1" />
      <path d="m18.4 5.6-2.1 2.1" />
      <path d="m7.7 16.3-2.1 2.1" />
    </>
  ),
  map: (
    <>
      <path d="M4 6.5 9 4l6 2.5 5-2.5v13.5L15 20l-6-2.5L4 20V6.5Z" />
      <path d="M9 4v13.5" />
      <path d="M15 6.5V20" />
      <path d="M6.8 8.8h.01" />
      <path d="M12 10.5h.01" />
      <path d="M17.2 9h.01" />
    </>
  ),
};

export function AppIcon({ name, size = "md", className = "", title }: AppIconProps) {
  const pixelSize = typeof size === "number" ? size : iconSizes[size];

  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={`app-icon ${className}`.trim()}
      fill="none"
      height={pixelSize}
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={pixelSize}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      {iconPaths[name]}
    </svg>
  );
}
