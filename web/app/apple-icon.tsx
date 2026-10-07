import { ImageResponse } from "next/og";
import { IDENTITY_GLYPHS, IDENTITY_FIRST, IDENTITY_SECOND } from "@/lib/identity";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#192a35" }}>
      <svg width="154" height="79" viewBox="0 0 343 176" fill="#ffffff">
        <g>{IDENTITY_FIRST.map(([letter, x]) => <path key={`${letter}-${x}`} d={IDENTITY_GLYPHS[letter]} transform={`translate(${x} 0)`} fillRule="evenodd" />)}</g>
        <g transform="translate(0 94)">{IDENTITY_SECOND.map(([letter, x]) => <path key={`${letter}-${x}`} d={IDENTITY_GLYPHS[letter]} transform={`translate(${x} 0)`} fillRule="evenodd" />)}</g>
      </svg>
    </div>, size,
  );
}
