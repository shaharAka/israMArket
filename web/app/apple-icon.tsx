import { ImageResponse } from "next/og";
import { IDENTITY_GLYPHS, IDENTITY_ICON_VIEWBOX } from "@/lib/identity";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      <svg width="180" height="180" viewBox={IDENTITY_ICON_VIEWBOX} fill="#192a35">
        <path d={IDENTITY_GLYPHS.m} fillRule="evenodd" />
      </svg>
    </div>, size,
  );
}
