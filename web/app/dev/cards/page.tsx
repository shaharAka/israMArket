"use client";

/**
 * Internal design preview for the card system.
 *
 * Renders every template against a real generated plate and the demo brand, so the
 * card design can be reviewed (and screenshotted) without running the AI pipeline or
 * clicking through onboarding. Not linked from the app UI.
 */

import { useRef, useState } from "react";
import {
  CardCanvas,
  CardStage,
  CARD_RATIOS,
  CARD_TEMPLATES,
  cardSize,
  type CardRatio,
  type CardTemplate,
} from "@/components/CardCanvas";
import { downloadCardPng } from "@/lib/cardExport";
import { DEMO_BRAND, type RoadmapPost } from "@/lib/api";

const PLATE = "/dev-preview/plate.jpg";

const basePost: RoadmapPost = {
  week: 1,
  date_hint: "2026-09-04",
  format: "image",
  title: "החלות החמות של שישי",
  angle: "טריות",
  hook: "החלות נגמרות לפני הצהריים",
  caption: "אופים כל בוקר, בלי מלאי מאתמול.",
  cta: "להזמנת חלות בוואטסאפ",
  calendar_tie: "שישי",
  goal_fit: "מכירות",
  image_url: PLATE,
  overlay_headline: "החלות החמות של שישי",
  overlay_badge: "מהדורת חג",
  overlay_position: "bottom_pill",
  overlay_theme: "lower_editorial",
  has_overlay: true,
  stat_highlight: "מהתנור ב-07:00",
};

function Sample({
  template,
  format,
  ratio,
  post: overrides,
}: {
  template: CardTemplate;
  format: RoadmapPost["format"];
  ratio?: CardRatio;
  post?: Partial<RoadmapPost>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const size = cardSize(format, ratio);
  const post: RoadmapPost = { ...basePost, overlay_theme: template, format, ...overrides };

  async function onExport() {
    if (!ref.current) return;
    setBusy(true);
    const res = await downloadCardPng(ref.current, {
      width: size.w,
      height: size.h,
      title: `${template}-${format}${ratio ? `-${ratio.replace(":", "x")}` : ""}`,
    });
    setBusy(false);
    if (!res.ok) window.alert(res.error);
  }

  const meta = CARD_TEMPLATES.find((t) => t.key === template);

  return (
    <div className="rounded-lg border border-[#deddd8] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-[#20211f]">{meta?.label}</p>
          <p className="text-[10px] text-[#898a85]">
            {template} · {size.w}×{size.h}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={busy}
          className="rounded border border-[#20211f] px-2 py-1 text-[10px] font-bold text-[#20211f] disabled:opacity-40"
        >
          {busy ? "…" : "PNG"}
        </button>
      </div>
      <CardStage
        post={post}
        brand={DEMO_BRAND}
        businessName={DEMO_BRAND.business_name}
        ratio={ratio}
      />

      {/* Off-screen true-size canvas used as the export source. Clipped by a zero-sized
          container so it never contributes to the document's scrollWidth. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <CardCanvas
          post={post}
          brand={DEMO_BRAND}
          businessName={DEMO_BRAND.business_name}
          size={size}
          canvasRef={ref}
        />
      </div>
    </div>
  );
}

export default function DevCardsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6" dir="rtl">
      <header>
        <h1 className="text-lg font-black text-[#20211f]">תצוגת תבניות כרטיס</h1>
        <p className="text-xs text-[#62635f]">
          עמוד פנימי לבדיקת עיצוב. תמונת רקע: Nano Banana Pro ב-2K.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-bold text-[#20211f]">כל התבניות — פיד 4:5</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARD_TEMPLATES.map((t) => (
            <Sample key={t.key} template={t.key} format="image" />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-[#20211f]">
          יחסי ייצוא — אותה תבנית (lower_editorial)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CARD_RATIOS.map((r) => (
            <Sample key={r.key} template="lower_editorial" format="image" ratio={r.key} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-[#20211f]">
          טיפוגרפיה בלבד — בלי תמונה בכלל
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Sample
            template="type_hero"
            format="image"
            post={{ image_url: "", stat_highlight: "100 חלות כל שישי", cta: "לשריון בוואטסאפ" }}
          />
          <Sample
            template="type_hero"
            format="image"
            ratio="1:1"
            post={{
              image_url: "",
              overlay_headline: "סוגרים הזמנות לראש השנה",
              overlay_badge: "עד רביעי",
              stat_highlight: "",
              cta: "להזמנה בוואטסאפ",
            }}
          />
          <Sample
            template="type_hero"
            format="image"
            ratio="9:16"
            post={{ image_url: "", overlay_headline: "החלות נגמרות לפני הצהריים", stat_highlight: "" }}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-[#20211f]">
          תמונה אמיתית של העסק + כיתוב מעוצב (ברירת המחדל החדשה)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Sample
            template="lower_editorial"
            format="image"
            post={{ image_url: "/dev-preview/real-photo.webp", overlay_headline: "לחם מחמצת אמיתי", overlay_badge: "נאפה היום", stat_highlight: "" }}
          />
          <Sample
            template="split_panel"
            format="image"
            post={{ image_url: "/dev-preview/real-photo.webp", overlay_headline: "מהתנור אל השולחן", overlay_badge: "", stat_highlight: "" }}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-[#20211f]">רילס 9:16</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Sample template="lower_editorial" format="reel" />
          <Sample template="split_panel" format="reel" />
          <Sample template="cover_type" format="reel" />
        </div>
      </section>
    </main>
  );
}
