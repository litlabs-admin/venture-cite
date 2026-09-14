import type { ReactNode } from "react";
import type { V2IconName } from "@/v2/contracts/icons";

function iconShape(name: V2IconName): ReactNode {
  switch (name) {
    case "today":
      return (
        <>
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </>
      );
    case "vis":
      return (
        <>
          <circle cx="12" cy="12" r="2.6" />
          <path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3M5.8 5.8l2.1 2.1M16.1 16.1l2.1 2.1M18.2 5.8l-2.1 2.1M7.9 16.1l-2.1 2.1" />
        </>
      );
    case "work":
      return (
        <>
          <path d="M14 3.2H7a2 2 0 0 0-2 2v13.6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.2z" />
          <path d="M14 3.2v5h5M8.5 13h7M8.5 16.5h4.5" />
        </>
      );
    case "facts":
      return (
        <>
          <circle cx="12" cy="12" r="8.8" />
          <path d="M8.4 12.2l2.5 2.5 4.7-5" />
        </>
      );
    case "learn":
      return (
        <>
          <path d="M3.2 5.4h6.3a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2H3.2z" />
          <path d="M20.8 5.4h-6.3a2.5 2.5 0 0 0-2.5 2.5v11a2 2 0 0 1 2-2h6.8z" />
        </>
      );
    case "diag":
      return <path d="M2.8 12h4l2.2-6.3 4 12.6 2.3-6.3h5.9" />;
    case "geo":
      return (
        <>
          <path d="M12 3.4l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" />
          <path d="M18.6 3.2v3M20.1 4.7h-3" />
        </>
      );
    case "cog":
      return (
        <>
          <circle cx="12" cy="12" r="2.9" />
          <path d="M19.1 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z" />
        </>
      );
    case "chev":
      return <path d="M9 5.5l7 6.5-7 6.5" />;
    case "cdown":
      return <path d="M5.5 9l6.5 6.5L18.5 9" />;
    case "bell":
      return (
        <>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </>
      );
    case "mail":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </>
      );
    case "moon":
      return <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />;
    case "slack":
      return (
        <>
          <rect x="3" y="10" width="11" height="4" rx="2" />
          <rect x="10" y="3" width="4" height="11" rx="2" />
          <rect x="10" y="10" width="11" height="4" rx="2" />
          <rect x="10" y="10" width="4" height="11" rx="2" />
        </>
      );
    case "warn":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.6v5M12 15.9v.1" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="8.8" />
          <path d="M12 6.9V12l3.3 2" />
        </>
      );
    case "check":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.2 12.3l2.6 2.6 4.9-5.3" />
        </>
      );
    case "doc":
      return (
        <>
          <path d="M13.6 3.4H7.4a2 2 0 0 0-2 2v13.2a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2V8.4z" />
          <path d="M13.6 3.4v5h5" />
        </>
      );
    case "chart":
      return <path d="M5.5 19.5V11M12 19.5V5.5M18.5 19.5v-5.5" />;
    case "map":
      return (
        <>
          <path d="M3.4 6.3l5.8-2.1 5.6 2.1 5.8-2.1v13.5l-5.8 2.1-5.6-2.1-5.8 2.1z" />
          <path d="M9.2 4.2v15.6M14.8 6.3v15.6" />
        </>
      );
    case "globe":
      return (
        <>
          <circle cx="12" cy="12" r="8.8" />
          <path d="M3.4 12h17.2M12 3.2a14 14 0 0 1 0 17.6 14 14 0 0 1 0-17.6" />
        </>
      );
    case "eye":
      return (
        <>
          <path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12" />
          <circle cx="12" cy="12" r="2.7" />
        </>
      );
    case "star":
      return (
        <path d="M12 3.6l2.65 5.36 5.92.87-4.28 4.17 1.01 5.9L12 17.1l-5.3 2.79 1.01-5.9L3.43 9.83l5.92-.87z" />
      );
    case "link":
      return (
        <>
          <path d="M10.2 13.8a3.6 3.6 0 0 0 5.4.4l2.7-2.7a3.6 3.6 0 1 0-5.1-5.1l-1.5 1.5" />
          <path d="M13.8 10.2a3.6 3.6 0 0 0-5.4-.4l-2.7 2.7a3.6 3.6 0 1 0 5.1 5.1l1.5-1.5" />
        </>
      );
    case "q":
      return (
        <>
          <circle cx="12" cy="12" r="8.8" />
          <path d="M9.7 9.6a2.4 2.4 0 1 1 3.2 2.3c-.6.2-.9.8-.9 1.4v.4M12 16.6v.1" />
        </>
      );
    case "srch":
      return (
        <>
          <circle cx="11" cy="11" r="6.6" />
          <path d="M16.1 16.1l4.3 4.3" />
        </>
      );
    case "dl":
      return <path d="M12 3.8v10.4M7.8 10.4L12 14.6l4.2-4.2M4.6 18.4h14.8" />;
    case "shield":
      return (
        <>
          <path d="M12 3.2l7 2.6v5.4c0 4.3-2.9 7.7-7 9.6-4.1-1.9-7-5.3-7-9.6V5.8z" />
          <path d="M9 12.1l2.2 2.2 4-4.2" />
        </>
      );
    case "scale":
      return (
        <path d="M12 4.2v15.6M6.4 19.8h11.2M4 9.4h16M4 9.4L1.8 14.4h4.4zM20 9.4l2.2 5h-4.4z" />
      );
    case "arrow":
      return <path d="M4.5 12h15M13.5 6l6 6-6 6" />;
    case "cal":
      return (
        <>
          <rect x="3.4" y="5" width="17.2" height="15.4" rx="2.3" />
          <path d="M3.4 9.6h17.2M8.2 3v4M15.8 3v4" />
        </>
      );
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export function V2Icon(props: {
  name: V2IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  title?: string;
}) {
  const { name, size = 17, className, strokeWidth = 1.7, title } = props;
  const hasTitle = title !== undefined;

  return (
    <svg
      aria-hidden={hasTitle ? undefined : true}
      className={className}
      fill="none"
      height={size}
      role={hasTitle ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {hasTitle ? <title>{title}</title> : null}
      {iconShape(name)}
    </svg>
  );
}
