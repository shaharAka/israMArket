import { ImageResponse } from "next/og";
import { IDENTITY_GLYPHS, IDENTITY_COMPACT } from "@/lib/identity";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#192a35" }}>
      <svg width="180" height="180" viewBox="0 0 256 256" fill="#ffffff">
        <g transform="translate(28 49) scale(1.8)">{IDENTITY_COMPACT.map(([letter, x]) => <path key={`${letter}-${x}`} d={IDENTITY_GLYPHS[letter]} transform={`translate(${x} 0)`} fillRule="evenodd" />)}</g>
      </svg>
    </div>, size,
  );
}
