import type { ReactNode, SVGProps } from "react";

/**
 * Bespoke entity glyphs — the identity layer of the app: room marks plus
 * the folder/document pair. Drawn on a 24 grid, 1.5 stroke, butt caps,
 * squared geometry — a drafting-table hand, deliberately not lucide's
 * rounded consumer one. Duotone is baked in per shape (closed silhouettes
 * carry a 10% self-fill, detail strokes stay open), so callers only set
 * `text-*` color. Functional icons (menu verbs, chrome) stay lucide; these
 * carry WHAT a thing is, not what a control does.
 */

export type Glyph = React.ComponentType<SVGProps<SVGSVGElement>>;

const FILL = { fill: "currentColor", fillOpacity: 0.1 } as const;

function createGlyph(displayName: string, children: ReactNode): Glyph {
  function GlyphComponent(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={24}
        height={24}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  }
  GlyphComponent.displayName = displayName;
  return GlyphComponent;
}

/** Registry cabinet — the default dataroom mark (a room of records, not a
 * folder: table folders keep the folder silhouette, so the two never blend). */
export const CabinetGlyph = createGlyph(
  "CabinetGlyph",
  <>
    <rect x="4.75" y="3.75" width="14.5" height="16.5" rx="1.5" {...FILL} />
    <path fill="none" d="M4.75 12H19.25" />
    <path fill="none" d="M10.25 7.9H13.75M10.25 16.1H13.75" />
  </>,
);

export const BriefcaseGlyph = createGlyph(
  "BriefcaseGlyph",
  <>
    <rect x="3.75" y="7.25" width="16.5" height="12" rx="1.5" {...FILL} />
    <path
      fill="none"
      d="M9.25 7.25V6.5c0-.97.78-1.75 1.75-1.75h2c.97 0 1.75.78 1.75 1.75v.75"
    />
    <path fill="none" d="M3.75 12.4h16.5" />
  </>,
);

export const BuildingGlyph = createGlyph(
  "BuildingGlyph",
  <>
    <rect x="6.25" y="3.75" width="11.5" height="16.5" rx="0.75" {...FILL} />
    <path fill="none" d="M3.75 20.25h16.5" />
    <path fill="none" d="M9.25 7.75h1.5M13.25 7.75h1.5M9.25 11.5h1.5M13.25 11.5h1.5M9.25 15.25h1.5M13.25 15.25h1.5" />
    <path fill="none" d="M10.75 20.25v-3h2.5v3" />
  </>,
);

export const ScaleGlyph = createGlyph(
  "ScaleGlyph",
  <>
    <path fill="none" d="M5.25 7h13.5" />
    <path fill="none" d="M12 7v12.25" />
    <circle cx="12" cy="5.1" r="1.15" fill="none" />
    <path fill="none" d="M8.75 19.25h6.5" />
    <path fill="none" d="M6.75 7.2 4.5 11.5M6.75 7.2 9 11.5" />
    <path fill="none" d="M4.15 11.5a2.6 2.6 0 0 0 5.2 0" />
    <path fill="none" d="M17.25 7.2 15 11.5M17.25 7.2 19.5 11.5" />
    <path fill="none" d="M14.65 11.5a2.6 2.6 0 0 0 5.2 0" />
  </>,
);

export const GavelGlyph = createGlyph(
  "GavelGlyph",
  <>
    <path d="M11.04 6.01 13.51 3.54 18.46 8.49 15.99 10.96Z" {...FILL} />
    {/* Handle as a closed slab welded into the head — the set's one stroke
        weight everywhere; a fat 2.75 line read marker-pen at 16px. */}
    <path d="M12.1 8 14 9.9 6.6 17.3 4.7 15.4Z" {...FILL} />
    <path fill="none" d="M3.75 20.25h9" />
  </>,
);

export const LandmarkGlyph = createGlyph(
  "LandmarkGlyph",
  <>
    <path d="M12 3.9 19.75 8.1H4.25Z" {...FILL} />
    <path fill="none" d="M5.25 10.4h13.5" />
    <path fill="none" d="M6.9 10.4v6.85M10.3 10.4v6.85M13.7 10.4v6.85M17.1 10.4v6.85" />
    <path fill="none" d="M5.25 17.25h13.5" />
    <path fill="none" d="M3.75 20.25h16.5" />
  </>,
);

export const BanknoteGlyph = createGlyph(
  "BanknoteGlyph",
  <>
    <rect x="3.75" y="7" width="16.5" height="10" rx="1.5" {...FILL} />
    <circle cx="12" cy="12" r="2.5" fill="none" />
    <path fill="none" d="M7 10.5v3M17 10.5v3" />
  </>,
);

export const ChartGlyph = createGlyph(
  "ChartGlyph",
  <>
    <path fill="none" d="M4.75 4.5v14.75H20.25" />
    <path fill="none" d="M7.75 15.5 11.25 11.5l2.5 2.5L18 8.85" />
    <path fill="none" d="M15.4 8.85H18v2.6" />
  </>,
);

export const ShieldGlyph = createGlyph(
  "ShieldGlyph",
  <>
    <path
      d="M12 3.9c2.2 1.3 4.6 2.05 7.1 2.25V12.7c0 4.2-2.9 6.65-7.1 7.65-4.2-1-7.1-3.45-7.1-7.65V6.15C7.4 5.95 9.8 5.2 12 3.9Z"
      {...FILL}
    />
    <path fill="none" d="M9.2 12.4l2.1 2.1 3.7-4.4" />
  </>,
);

export const UsersGlyph = createGlyph(
  "UsersGlyph",
  <>
    <circle cx="9" cy="8.3" r="2.9" {...FILL} />
    <path fill="none" d="M3.9 19.5c0-3.4 2.1-5.4 5.1-5.4s5.1 2 5.1 5.4" />
    <path fill="none" d="M14.6 5.9a2.6 2.6 0 0 1 0 5.15" />
    <path fill="none" d="M16.1 14.35c2.6.4 4.15 2.2 4.15 5.15" />
  </>,
);

export const GlobeGlyph = createGlyph(
  "GlobeGlyph",
  <>
    <circle cx="12" cy="12" r="8.25" {...FILL} />
    <path fill="none" d="M3.75 12h16.5" />
    <path fill="none" d="M12 3.75c3.4 4.1 3.4 12.4 0 16.5M12 3.75c-3.4 4.1-3.4 12.4 0 16.5" />
  </>,
);

export const ArchiveGlyph = createGlyph(
  "ArchiveGlyph",
  <>
    <rect x="3.75" y="4.5" width="16.5" height="3.75" rx="0.75" {...FILL} />
    <path
      d="M5.5 8.25v10.15c0 1.03.82 1.85 1.85 1.85h9.3c1.03 0 1.85-.82 1.85-1.85V8.25"
      {...FILL}
    />
    <rect x="10" y="11.4" width="4" height="1.6" rx="0.75" fill="none" />
  </>,
);

/** Table/list folder — squared tab silhouette, navy in context. */
export const FolderGlyph = createGlyph(
  "FolderGlyph",
  <path
    d="M3.75 17.6V6.4c0-.8.65-1.45 1.45-1.45h4.1c.45 0 .87.2 1.15.55l1.45 1.8h6.9c.8 0 1.45.65 1.45 1.45v8.85c0 .8-.65 1.45-1.45 1.45H5.2c-.8 0-1.45-.65-1.45-1.45Z"
    {...FILL}
  />,
);

/** Table/list document — folded corner + ruled lines, graphite in context. */
export const FileGlyph = createGlyph(
  "FileGlyph",
  <>
    <path
      d="M13.9 3.75H7.7c-.8 0-1.45.65-1.45 1.45v13.6c0 .8.65 1.45 1.45 1.45h8.6c.8 0 1.45-.65 1.45-1.45V7.6Z"
      {...FILL}
    />
    <path fill="none" d="M13.9 3.75v2.4c0 .8.65 1.45 1.45 1.45h2.4" />
    <path fill="none" d="M9.25 12.5h5.5M9.25 15.5h3.75" />
  </>,
);
