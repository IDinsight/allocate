import { useId } from "react";

interface Props {
  text: string;
  rotation?: number;
  fontSize?: number;
  opacity?: number;
  color?: string;
  className?: string;
}

/**
 * Tiled SVG text watermark that fills its nearest positioned ancestor.
 * Tile width is auto-derived from the text length so the repetition density
 * stays consistent regardless of what's being written.
 */
export default function WatermarkBackground({
  text,
  rotation = -45,
  fontSize = 16,
  opacity = 0.04,
  color = "#1a1a1a",
  className = "",
}: Props) {
  const patternId = useId();
  // Rough bold sans-serif advance width — close enough for watermark tiling
  const tileWidth = Math.max(Math.round(text.length * fontSize * 0.5), fontSize);
  const tileHeight = Math.round(fontSize * 1.5);
  const baseline = fontSize;

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width={tileWidth}
          height={tileHeight}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${rotation})`}
        >
          
            <text
              x="0"
              y={baseline}
              fontFamily="system-ui, sans-serif"
              fontSize={fontSize}
              fontWeight="700"
              fill={color}
              fillOpacity={opacity}
            >
              {text}
            </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
