import { ImageResponse } from "next/og";
import { BRAND_MARK_PATHS } from "@/lib/icons";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2853c7",
        }}
      >
        <svg
          width="150"
          height="150"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f9f8f6"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {BRAND_MARK_PATHS.map((d, index) => (
            <path key={d} d={d} stroke={index < 2 ? "#ffc44a" : "#ffffff"} />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
