"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CardCanvas,
  CardStage,
  CARD_RATIOS,
  CARD_TEMPLATES,
  cardSize,
  needsPhoto,
  resolveTemplate,
  type CardRatio,
} from "@/components/CardCanvas";
import { downloadCardPng } from "@/lib/cardExport";
import {
  endpoints,
  type Asset,
  type AssetSource,
  type AssetSuggestion,
  type BrandLanguage,
  type OverlayTheme,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import { IconCheck, IconCopy, IconImage, IconLink, IconSparkles, IconWhatsApp } from "@/lib/icons";
import { toast } from "@/lib/ui";

type OutletKey = "instagram" | "facebook" | "whatsapp" | "tiktok";
type RewriteTone = "direct" | "neighborhood" | "punchy";

const OUTLETS: {
  key: OutletKey;
  label: string;
  badge: string;
  icon: string;
  specs: string;
}[] = [
  {
    key: "instagram",
    label: "אינסטגרם",
    badge: "פיד / רילס (4:5 / 9:16)",
    icon: "📸",
    specs: "תמונה/וידאו בראש הפוסט · קישור בביו · פורמט ויזואלי מוביל",
  },
  {
    key: "facebook",
    label: "פייסבוק",
    badge: "פוסט פיד עם קישור",
    icon: "📘",
    specs: "טקסט בראש הפוסט מעל התמונה · כרטיס קישור לחיץ ישירות · תגובות ושיתופים",
  },
  {
    key: "whatsapp",
    label: "וואטסאפ",
    badge: "הודעת צ'אט / שידור",
    icon: "💬",
    specs: "בועת שיחה אישית/קבוצתית · טקסט מודגש ב-*כוכביות* · קישור מיידי לחיץ",
  },
  {
    key: "tiktok",
    label: "טיקטוק",
    badge: "וידאו 9:16 מסך מלא",
    icon: "🎵",
    specs: "מסך מלא 9:16 אנכי · כפתורי מעורבות בצד · סאונד וטקסט קצר",
  },
];

const CHANGE_OPTIONS: { key: RewriteTone; label: string; description: string }[] = [
  { key: "punchy", label: "קצר יותר", description: "נשמור את המסר ונקצר אותו" },
  { key: "neighborhood", label: "פחות מכירתי", description: "ננסח בטון טבעי וחם יותר" },
  { key: "direct", label: "ברור יותר", description: "נחדד מה הלקוח צריך לעשות" },
];

const FORMAT_LABELS: Record<RoadmapPost["format"], string> = {
  reel: "וידאו קצר (Reel)",
  carousel: "קרוסלה",
  image: "תמונה",
  story: "סטורי",
};

const DESIGN_PRESETS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: "hero_clean", label: "תמונת גיבור נקייה", desc: "ללא כיתוב כלל, מיקוד במוצר ובמרקם", icon: "📸" },
  { key: "corner_badge", label: "מדבקת פינה מעוצבת", desc: "תגית איכות עדינה בפינה העליונה", icon: "🏷️" },
  { key: "announcement_card", label: "כרטיס הודעה אלגנטי", desc: "כרטיס נייר חם במרכז או בתחתית", icon: "📜" },
  { key: "ink_pill", label: "תגית דיו מודרנית", desc: "תג צף שחור יוקרתי עם טיפוגרפיה חדה", icon: "✒️" },
];

const IMAGE_SOURCE_LABELS: Record<string, { text: string; tone: string }> = {
  real_photo: { text: "תמונה אמיתית מהאתר שלכם", tone: "bg-[#e4efe4] text-[#2d5b33] border-[#bcd6bc]" },
  generated: { text: "תמונה שנוצרה ב-AI", tone: "bg-[#fdf1e3] text-[#8a5a1c] border-[#e8cfa8]" },
  asset: { text: "תמונה מהספרייה שלכם", tone: "bg-[#fbf4f0] text-[#7d4436] border-[#e3cec4]" },
  pending: { text: "עדיין אין תמונה — אפשר ליצור אחת", tone: "bg-[#f0efeb] text-[#62635f] border-[#dedcd4]" },
  none: { text: "כרטיס טיפוגרפי — בלי תמונה", tone: "bg-[#f0efeb] text-[#62635f] border-[#dedcd4]" },
};

/** Where each library file came from, in the owner's words — same wording as AssetCard. */
const ASSET_SOURCE_LABELS: Record<AssetSource, string> = {
  upload: "הועלה",
  url: "מקישור",
  site: "מהאתר",
};

/** One thumbnail in the picker. Mirrors AssetCard: the owner's own clip shows a
 *  metadata-only frame, and a file the browser cannot render falls back to a placeholder
 *  rather than a broken-image icon. */
function AssetPickerThumb({ asset, className }: { asset: Asset; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!asset.url || broken) {
    return (
      <span className={`flex items-center justify-center bg-[#f4f3ee] text-[#b3b0a5] ${className}`}>
        <IconImage className="h-4 w-4" />
      </span>
    );
  }
  if (asset.kind === "video") {
    return (
      <video
        src={asset.url}
        muted
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
        // Some browsers only paint metadata-loaded video once told to seek.
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = 0.1;
        }}
        className={`bg-[#f4f3ee] object-cover ${className}`}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy path, not an optimizable remote URL
    <img
      src={asset.url}
      alt={asset.description || "נכס מהספרייה"}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`bg-[#f4f3ee] object-cover ${className}`}
    />
  );
}

const THEME_OPTIONS: { key: OverlayTheme; label: string }[] = CARD_TEMPLATES.map((t) => ({
  key: t.key,
  label: t.label,
}));

/** Host shown in the Facebook/WhatsApp link-preview mockups, derived from the real
 *  tracked URL. This used to be a hardcoded string, so every customer saw another
 *  business's domain on their own post preview. */
function previewHost(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function captionFor(post: RoadmapPost, outlet: OutletKey) {
  if (outlet !== "tiktok" && post.outlet_captions?.[outlet]) {
    return post.outlet_captions[outlet] || post.caption;
  }
  return post.caption;
}

export function PostEditor({
  posts: initialPosts,
  brandLanguage,
  initialIndex = 0,
  onStrategyUpdated,
}: {
  posts: RoadmapPost[];
  brandLanguage?: BrandLanguage | null;
  initialIndex?: number;
  onStrategyUpdated?: (strategy: StrategyPayload) => void;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(initialPosts.length - 1, 0))
  );
  const [outlet, setOutlet] = useState<OutletKey>(
    (initialPosts[initialIndex]?.primary_outlet as OutletKey) || "instagram"
  );
  const [showChanges, setShowChanges] = useState(false);
  const [rewriting, setRewriting] = useState<RewriteTone | null>(null);
  const [approving, setApproving] = useState(false);
  const [imageBusy, setImageBusy] = useState<number | null>(null);
  const [imageError, setImageError] = useState("");
  const [publishUrl, setPublishUrl] = useState(() => initialPosts[initialIndex]?.published_url || "");
  const [publishing, setPublishing] = useState(false);

  // The owner's own library. Loaded when the picker opens, never on render — and never
  // automatically for the ranking, which is a real model call.
  const [showAssets, setShowAssets] = useState(false);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [attachError, setAttachError] = useState("");
  const [assetBusyId, setAssetBusyId] = useState<number | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<AssetSuggestion[] | null>(null);
  const [suggestError, setSuggestError] = useState("");

  // Designer AI State
  const [designerBusy, setDesignerBusy] = useState(false);
  const [customDesignPrompt, setCustomDesignPrompt] = useState("");
  const [showDesignerSettings, setShowDesignerSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportRatio, setExportRatio] = useState<CardRatio | "auto">("auto");
  // Dedicated off-screen canvas at true export size, so the downloaded PNG never
  // includes the mockup chrome (Instagram header, action rail, phone frame).
  const exportRef = useRef<HTMLDivElement>(null);

  /** True while any image operation is in flight. Every image control checks this, so a
   *  library pick, an AI generation and a source switch can never overlap. */
  const imageLocked = imageBusy !== null || designerBusy || assetBusyId !== null;

  const currentPost = posts[selectedIndex];
  const approvedCount = posts.filter((post) => post.approval_status === "approved").length;
  const availableOutlets = useMemo(
    () =>
      OUTLETS.filter((item) =>
        (currentPost?.outlets?.length ? currentPost.outlets : [currentPost?.primary_outlet || "instagram"]).includes(
          item.key
        )
      ),
    [currentPost]
  );

  if (!currentPost) {
    return (
      <div className="rounded-lg border border-[#deddd8] bg-white px-6 py-14 text-center text-sm text-[#62635f]">
        אנחנו עדיין מכינים את הפוסטים לחודש הזה.
      </div>
    );
  }

  // Overlay defaults logic
  const hasOverlay =
    currentPost.has_overlay !== undefined
      ? Boolean(currentPost.has_overlay)
      : Boolean(currentPost.overlay_text && currentPost.overlay_text.trim());
  const overlayHeadline = currentPost.overlay_headline || currentPost.overlay_text || "";
  const overlayBadge = currentPost.overlay_badge || "";
  const overlayTheme = currentPost.overlay_theme || "ink_pill";
  const activeTemplate = resolveTemplate(overlayTheme);
  const exportSize = cardSize(
    currentPost.format,
    exportRatio === "auto" ? undefined : exportRatio,
  );

  async function handleExportCard() {
    const node = exportRef.current;
    if (!node) {
      toast("הכרטיס עוד לא מוכן לייצוא.");
      return;
    }
    if (!currentPost.image_url && needsPhoto(currentPost.overlay_theme)) {
      toast("צרו קודם תמונה, ואז נוכל להוריד את הכרטיס.");
      return;
    }
    setExporting(true);
    const result = await downloadCardPng(node, {
      width: exportSize.w,
      height: exportSize.h,
      title: currentPost.title,
    });
    setExporting(false);
    toast(
      result.ok
        ? `הכרטיס הורד בגודל ${exportSize.w}×${exportSize.h}.`
        : `ייצוא הכרטיס נכשל: ${result.error}`,
    );
  }

  async function prepareImage(index: number, force = false, allowGeneration = true) {
    if (!force && posts[index]?.image_url) return;
    if (imageLocked) return;
    setImageError("");
    setImageBusy(index);
    try {
      const result = await endpoints.generatePostImage(index, {
        force,
        // Browsing the plan must never trigger a paid generation. Only an explicit
        // click on "create image" sets this.
        allow_generation: allowGeneration,
      });
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      // Report what actually happened. The old code always claimed success, so a
      // typographic card (which carries no photo by design) or a skipped regeneration
      // looked like a broken button.
      switch (result.post.image_action) {
        case "no_photo_theme":
          toast("הכרטיס הזה טיפוגרפי — הוא נבנה בלי תמונה, וזה מכוון.");
          break;
        case "kept_existing":
          toast("כבר יש תמונה לפוסט הזה, ולכן לא נוצרה חדשה.");
          break;
        case "real_photo":
          toast("השתמשנו בתמונה שנסרקה מהאתר שלכם.");
          break;
        case "pending":
          toast("לא נוצרה תמונה. אפשר ליצור ב-AI או לבחור תמונה משלכם.");
          break;
        default:
          toast("התמונה נוצרה בהצלחה לפי שפת המותג.");
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "יצירת התמונה נכשלה");
    } finally {
      setImageBusy(null);
    }
  }

  function selectPost(index: number) {
    setSelectedIndex(index);
    setOutlet((posts[index]?.primary_outlet as OutletKey) || "instagram");
    setShowChanges(false);
    setImageError("");
    setPublishUrl(posts[index]?.published_url || "");
    setCustomDesignPrompt("");
    // A ranked answer belongs to the post it was asked about, so it never carries over.
    setSuggestions(null);
    setSuggestError("");
    // Reuse an existing photo (free) or the business's own scraped image. Passing
    // allowGeneration=false means clicking through posts can never cost money.
    void prepareImage(index, false, false);
  }

  /** Switch a card between the business's own photo and a generated one. */
  async function chooseImageSource(source: "real" | "ai") {
    if (imageLocked) return;
    setImageError("");
    setImageBusy(selectedIndex);
    try {
      const result = await endpoints.generatePostImage(selectedIndex, {
        force: true,
        allow_generation: source === "ai",
        image_preference: source,
      });
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      toast(source === "ai" ? "ניצור תמונה חדשה ב-AI." : "נשתמש בתמונה מהאתר שלכם.");
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "החלפת התמונה נכשלה");
    } finally {
      setImageBusy(null);
    }
  }

  /** Fetch the library. Cheap, but it only happens when the picker is opened, so a fresh
   *  upload on /assets shows up here the next time the panel is opened. */
  async function loadAssets() {
    setAssetsLoading(true);
    setAssetsError("");
    try {
      const result = await endpoints.assets();
      setAssets(result.assets);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : "טעינת הנכסים נכשלה");
    } finally {
      setAssetsLoading(false);
    }
  }

  function toggleAssetPicker() {
    const opening = !showAssets;
    setShowAssets(opening);
    setSuggestError("");
    setAttachError("");
    if (!opening) {
      // The ranked answer is per-post and per-mode — reopening should start clean.
      setSuggestions(null);
      return;
    }
    void loadAssets();
  }

  /** Attach one library file to the post being edited, exactly the way preparation does:
   *  the server owns the post, so we take the strategy it sends back. */
  async function attachAsset(asset: Asset) {
    if (imageLocked) return;
    setImageError("");
    setAttachError("");
    setAssetBusyId(asset.id);
    try {
      const result = await endpoints.attachPostAsset(selectedIndex, asset.id);
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      setShowAssets(false);
      setSuggestions(null);
      toast("התמונה מהספרייה שלכם שובצה בפוסט.");
    } catch (err) {
      // Kept apart from `assetsError`: a failed attach must not blank out the grid the
      // owner is choosing from.
      setAttachError(err instanceof Error ? err.message : "בחירת הנכס נכשלה");
    } finally {
      setAssetBusyId(null);
    }
  }

  /** Real model call over the post and the library — several seconds, so it only ever
   *  runs from an explicit click and always shows a busy state. */
  async function suggestAssetsForPost() {
    if (suggesting || imageLocked) return;
    setSuggesting(true);
    setSuggestError("");
    setSuggestions(null);
    try {
      const result = await endpoints.suggestPostAssets(selectedIndex);
      setSuggestions(result.suggestions);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "התאמת הנכסים נכשלה");
    } finally {
      setSuggesting(false);
    }
  }

  async function markPublished() {
    if (!publishUrl.trim()) {
      toast("הדביקו את קישור הפוסט באינסטגרם או בפייסבוק");
      return;
    }
    setPublishing(true);
    try {
      const result = await endpoints.publishPost(selectedIndex, publishUrl.trim());
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      toast("סימנו את הפוסט כפורסם. נמדוד אותו בסנכרון הבא.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "שמירת הקישור נכשלה");
    } finally {
      setPublishing(false);
    }
  }

  async function approveCurrentPost() {
    setApproving(true);
    try {
      const result = await endpoints.approvePost(selectedIndex);
      const updatedPosts = result.strategy.roadmap.posts;
      setPosts(updatedPosts);
      onStrategyUpdated?.(result.strategy);
      toast("הפוסט אושר. אנחנו מטפלים בהמשך.");

      const nextIndex = updatedPosts.findIndex(
        (post, index) => index > selectedIndex && post.approval_status !== "approved"
      );
      if (nextIndex >= 0) selectPost(nextIndex);
    } catch (err) {
      toast(err instanceof Error ? err.message : "אישור הפוסט נכשל");
    } finally {
      setApproving(false);
    }
  }

  async function requestRewrite(tone: RewriteTone) {
    setRewriting(tone);
    try {
      const result = await endpoints.rewritePost(selectedIndex, tone);
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      setShowChanges(false);
      toast("הכנו גרסה חדשה לבדיקה");
    } catch (err) {
      toast(err instanceof Error ? err.message : "הכנת הגרסה החדשה נכשלה");
    } finally {
      setRewriting(null);
    }
  }

  async function handleApplyDesignPreset(vibe: string, generateImage = false) {
    // The buttons are disabled while an image operation runs; this is the same rule for
    // any path that reaches here without going through one of them.
    if (imageLocked) return;
    setDesignerBusy(true);
    setImageError("");
    try {
      const result = await endpoints.designPost(selectedIndex, {
        vibe,
        custom_prompt: customDesignPrompt.trim() || undefined,
        generate_image: generateImage,
      });
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      toast(generateImage ? "המעצב תכנן מחדש ויצר תמונה חדשה!" : "כיוון העיצוב עודכן בהצלחה.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "עיצוב הפוסט נכשל");
    } finally {
      setDesignerBusy(false);
    }
  }

  async function updateDesignField(patch: Partial<RoadmapPost>) {
    const updated = { ...currentPost, ...patch };
    const newPosts = [...posts];
    newPosts[selectedIndex] = updated;
    setPosts(newPosts);

    try {
      const result = await endpoints.savePost(selectedIndex, {
        title: updated.title,
        format: updated.format,
        hook: updated.hook,
        caption: updated.caption,
        cta: updated.cta,
        date_hint: updated.date_hint,
        primary_outlet: updated.primary_outlet,
        outlets: updated.outlets,
        has_overlay: updated.has_overlay,
        overlay_headline: updated.overlay_headline,
        overlay_badge: updated.overlay_badge,
        overlay_position: updated.overlay_position,
        overlay_theme: updated.overlay_theme,
        overlay_text: updated.has_overlay ? updated.overlay_headline : "",
        creative_concept: updated.creative_concept,
        visual_style: updated.visual_style,
        image_prompt: updated.image_prompt,
      });
      onStrategyUpdated?.(result.strategy);
    } catch {
      // quiet save
    }
  }

  const activeCaption = captionFor(currentPost, outlet);
  const businessName = brandLanguage?.business_name || "העסק";
  const isApproved = currentPost.approval_status === "approved";
  const isPreparingImage = imageBusy === selectedIndex;
  const currentOutletMeta = OUTLETS.find((item) => item.key === outlet) || OUTLETS[0];
  const cardNeedsPhoto = needsPhoto(currentPost.overlay_theme);
  // Posts created before provenance tracking have no image_source. Every legacy path
  // generated its image, so "generated" is the accurate label — not "no image yet", which
  // was plainly wrong for a card that visibly had one. A photo-free card is the exception:
  // it draws no photograph at all, so no image provenance may be claimed for it.
  const imageSourceKey = !cardNeedsPhoto
    ? "none"
    : currentPost.image_source || (currentPost.image_url ? "generated" : "pending");
  // The library entry behind the current image, once the library has been opened — it
  // turns the provenance badge into something the owner can actually recognise. Keyed on
  // the label above too: switching to an AI image leaves the old `image_asset_id` behind,
  // and a stale id must never label a generated picture as the owner's own.
  const currentAssetId = imageSourceKey === "asset" ? currentPost.image_asset_id ?? null : null;
  const currentAsset = currentAssetId
    ? (assets ?? []).find((asset) => asset.id === currentAssetId) ?? null
    : null;
  const libraryEmpty = assets !== null && assets.length === 0;
  // Ranked answers arrive as ids; the picker shows them with their thumbnail and tags.
  const rankedSuggestions = (suggestions ?? []).flatMap((suggestion) => {
    const asset = (assets ?? []).find((item) => item.id === suggestion.asset_id);
    return asset ? [{ suggestion, asset }] : [];
  });


  // Visual Image Media Slot — the card itself renders inside CardStage.
  function renderMediaSlot(fill = false) {
    const photoFree = !needsPhoto(currentPost.overlay_theme);
    if (!currentPost.image_url && !photoFree) {
      return (
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 bg-[#f0efeb] px-6 text-center">
          <IconImage className="h-6 w-6 text-[#898a85]" />
          <p className="text-sm font-bold text-[#62635f]">
            {isPreparingImage ? "אנחנו יוצרים את התמונה…" : "התמונה בהכנה"}
          </p>
          {imageError ? (
            <>
              <p className="text-xs leading-5 text-[#8d4539]">{imageError}</p>
              <button
                type="button"
                onClick={() => void prepareImage(selectedIndex, true)}
                className="text-xs font-bold text-[#20211f] underline underline-offset-4"
              >
                לנסות שוב
              </button>
            </>
          ) : null}
        </div>
      );
    }

    return (
      <CardStage
        post={currentPost}
        brand={brandLanguage}
        businessName={businessName}
        fill={fill}
        rounded={!fill}
        ratio={exportRatio === "auto" ? undefined : exportRatio}
      />
    );
  }

  // --- 1. INSTAGRAM FEED / REEL MOCKUP ---
  function renderInstagramMockup() {
    const isReelOrStory = currentPost.format === "reel" || currentPost.format === "story";

    if (isReelOrStory) {
      return (
        <div>
        <div className="overflow-hidden rounded-2xl border border-[#deddd8] bg-black text-white shadow-md">
          {/* Reel Top Info */}
          <div className="flex items-center justify-between px-3.5 py-2.5 text-xs text-white/90">
            <span className="font-bold flex items-center gap-1.5">
              <span>▶</span> Reel
            </span>
            <span className="text-white/60 text-[11px]">אינסטגרם רילס</span>
          </div>

          {/* 9:16 Frame */}
          <div className="relative aspect-[9/16] w-full overflow-hidden bg-neutral-900">
            {renderMediaSlot(true)}

            {/* Right Side Action Rail */}
            <div className="absolute bottom-16 left-3 flex flex-col items-center gap-4 text-white z-10">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">❤️</span>
                <span className="text-[10px] font-bold">—</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">💬</span>
                <span className="text-[10px] font-bold">—</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">↗️</span>
                <span className="text-[10px] font-bold">—</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">🔖</span>
              </div>
              <div className="mt-1 h-7 w-7 rounded-full border-2 border-white/80 bg-neutral-800 flex items-center justify-center text-[10px] animate-spin">
                🎵
              </div>
            </div>

            {/* Bottom Gradient and Caption Overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 text-right pr-4 pl-14">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-black text-[10px] font-black">
                  {businessName[0]}
                </span>
                <span className="text-xs font-bold text-white">{businessName}</span>
                <button
                  type="button"
                  className="rounded-full border border-white/60 px-2 py-0.5 text-[10px] font-bold text-white"
                >
                  מעקב +
                </button>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-white/95">
                {activeCaption}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-white/80">
                <span>🎵</span>
                <span className="truncate">צליל מקורי · {businessName}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Numbers shown inside a phone frame would otherwise look like real metrics. */}
        <p className="mt-1.5 text-[11px] text-[#8b8e84]">
          תצוגת מבנה בלבד — מספרי מעורבות יוצגו רק לאחר חיבור חשבון אינסטגרם.
        </p>
        </div>
      );
    }

    // Standard Instagram Feed Post (4:5 / 1:1)
    return (
      <div className="overflow-hidden rounded-xl border border-[#deddd8] bg-white shadow-sm">
        {/* Instagram Header */}
        <div className="flex items-center justify-between border-b border-[#f0efeb] px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-[#20211f]">
                {businessName[0]}
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#20211f]">{businessName}</p>
              <p className="text-[10px] text-[#898a85]">פוסט פיד · אינסטגרם</p>
            </div>
          </div>
          <span className="text-xs text-[#898a85]">•••</span>
        </div>

        {/* Media (Photo First) */}
        {renderMediaSlot()}

        {/* Action Row */}
        <div className="px-3.5 pt-3 pb-2">
          <div className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-3 text-[#20211f]">
              <span className="cursor-pointer hover:opacity-75">🤍</span>
              <span className="cursor-pointer hover:opacity-75">💬</span>
              <span className="cursor-pointer hover:opacity-75">↗️</span>
            </div>
            <span className="cursor-pointer text-[#20211f] hover:opacity-75">🔖</span>
          </div>

          <p className="mt-2 text-xs font-bold text-[#20211f]">
            242 סימוני ״אהבתי״
          </p>

          {/* Caption Below Media */}
          <div className="mt-1.5 text-xs leading-5 text-[#20211f]">
            <span className="font-bold ml-1.5">{businessName}</span>
            <span className="whitespace-pre-line text-[#343632]">{activeCaption}</span>
          </div>

          {currentPost.cta ? (
            <p className="mt-2 text-xs font-bold text-[#191b18]">
              {currentPost.cta}
            </p>
          ) : null}

          {/* Link in bio cue */}
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#f0efeb] pt-2 text-[11px] text-[#00376b] font-medium">
            <IconLink className="h-3 w-3" />
            <span>קישור ישיר להזמנה בביו של הפרופיל 🌿</span>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. FACEBOOK FEED MOCKUP ---
  function renderFacebookMockup() {
    return (
      <div className="overflow-hidden rounded-xl border border-[#deddd8] bg-white shadow-sm text-right">
        {/* Facebook Header */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877f2] text-sm font-black text-white shadow-sm">
              {businessName[0]}
            </span>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-xs font-bold text-[#050505]">{businessName}</p>
                <span className="text-[#1877f2] text-[10px]">✔</span>
              </div>
              <p className="text-[11px] text-[#65676b] flex items-center gap-1">
                <span>{currentPost.date_hint || "היום"}</span>
                <span>·</span>
                <span>🌐 ציבורי</span>
              </p>
            </div>
          </div>
          <span className="text-xs text-[#65676b] cursor-pointer">•••</span>
        </div>

        {/* Facebook Copy IS ON TOP OF MEDIA */}
        <div className="px-3.5 pb-3">
          <p className="whitespace-pre-line text-sm leading-6 text-[#050505]">
            {activeCaption}
          </p>
          {currentPost.cta ? (
            <p className="mt-2 text-xs font-bold text-[#1877f2]">
              {currentPost.cta}
            </p>
          ) : null}
        </div>

        {/* Media Container */}
        {renderMediaSlot()}

        {/* Facebook Link Preview Snippet (OpenGraph Card) */}
        {currentPost.tracking_url || currentPost.cta ? (
          <div className="border-t border-[#ced0d4] bg-[#f0f2f5] p-3 text-right">
            <span className="block text-[10px] uppercase tracking-wider text-[#65676b] font-bold">
              {previewHost(currentPost.tracking_url).toUpperCase()}
            </span>
            <p className="mt-0.5 text-xs font-bold text-[#050505] line-clamp-1">
              {currentPost.title}
            </p>
            <p className="mt-0.5 text-[11px] text-[#65676b] line-clamp-1">
              {currentPost.hook || "הזמנה ישירה ומשלוחים לעסקים"}
            </p>
          </div>
        ) : null}

        {/* Facebook Social Proof & Action Row */}
        <div className="px-3.5 py-2 border-t border-[#f0f2f5]">
          <div className="flex items-center justify-between text-xs text-[#65676b] pb-2 border-b border-[#e4e6eb]">
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#1877f2] text-[9px] text-white">
                👍
              </span>
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#fa3e3e] text-[9px] text-white -mr-1">
                ❤️
              </span>
              <span className="mr-1 text-[11px]">86</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span>14 תגובות</span>
              <span>5 שיתופים</span>
            </div>
          </div>

          <div className="grid grid-cols-3 pt-1.5 text-center text-xs font-bold text-[#65676b]">
            <button type="button" className="py-1.5 rounded-md hover:bg-[#f0f2f5] flex items-center justify-center gap-1.5">
              <span>👍</span> לייק
            </button>
            <button type="button" className="py-1.5 rounded-md hover:bg-[#f0f2f5] flex items-center justify-center gap-1.5">
              <span>💬</span> תגובה
            </button>
            <button type="button" className="py-1.5 rounded-md hover:bg-[#f0f2f5] flex items-center justify-center gap-1.5">
              <span>↗️</span> שיתוף
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 3. WHATSAPP CHAT MESSAGE MOCKUP ---
  function renderWhatsAppMockup() {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#deddd8] bg-[#efeae2] shadow-sm text-right">
        {/* WhatsApp App Bar */}
        <div className="flex items-center justify-between bg-[#075e54] px-3.5 py-2.5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold">←</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#128c7e] text-xs font-black text-white">
              {businessName[0]}
            </span>
            <div>
              <p className="text-xs font-bold leading-tight">{businessName} · VIP</p>
              <p className="text-[10px] text-white/80">מחובר/ת כעת</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm opacity-90">
            <span>📹</span>
            <span>📞</span>
            <span>⋮</span>
          </div>
        </div>

        {/* WhatsApp Chat Canvas */}
        <div className="p-3.5 space-y-3 min-h-[380px] flex flex-col justify-end bg-[#e5ddd5]/60">
          <div className="flex justify-center">
            <span className="rounded-md bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-[#54656f] shadow-xs">
              היום, 09:41
            </span>
          </div>

          {/* Message Bubble */}
          <div className="mr-auto max-w-[92%] rounded-2xl rounded-tr-none bg-white p-2 text-right shadow-sm border border-[#e2dcd4]">
            {/* Nested Media inside Bubble */}
            <div className="overflow-hidden rounded-xl mb-2">
              {renderMediaSlot()}
            </div>

            {/* Bubble Copy */}
            <div className="px-1 text-xs leading-6 text-[#111b21] space-y-1.5">
              <p className="font-bold text-sm text-[#075e54]">
                *{currentPost.title}*
              </p>
              <p className="whitespace-pre-line text-[#111b21]">
                {activeCaption}
              </p>
              {currentPost.cta ? (
                <p className="pt-1 font-bold text-[#008069]">
                  *{currentPost.cta}*
                </p>
              ) : null}

              {/* In-Bubble Link Card */}
              {currentPost.tracking_url ? (
                <div className="mt-2 rounded-lg border border-[#e9edef] bg-[#f0f2f5] p-2 text-right">
                  <span className="block text-[10px] font-bold text-[#008069]">
                    {previewHost(currentPost.tracking_url)}
                  </span>
                  <span className="block text-[11px] font-medium text-[#111b21] truncate">
                    להזמנה ישירה ונעילת מקום לחג
                  </span>
                </div>
              ) : null}

              {/* Message Time and Blue Read Ticks */}
              <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-[#667781]">
                <span>09:42</span>
                <span className="text-[#53bdeb] font-bold">✓✓</span>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Action Footer */}
        <div className="flex items-center justify-between border-t border-[#dedcd4] bg-[#f0f2f5] px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(
                `*${currentPost.title}*\n\n${activeCaption}\n\n${currentPost.cta || ""}\n${currentPost.tracking_url || ""}`
              );
              toast("נוסח הוואטסאפ הועתק במלואו לשליחה מיידית!");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#20ba5a]"
          >
            <IconWhatsApp className="h-4 w-4" />
            העתק הודעה מעוצבת לוואטסאפ
          </button>
          <span className="text-[11px] text-[#667781]">
            נשלח בצ&apos;אט ישיר / בקבוצת שידור
          </span>
        </div>
      </div>
    );
  }

  // --- 4. TIKTOK VIDEO FEED MOCKUP ---
  function renderTikTokMockup() {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#deddd8] bg-black text-white shadow-md">
        <div className="flex items-center justify-between px-3.5 py-2 text-xs text-white/90">
          <span className="font-bold flex items-center gap-1.5">
            <span>🎵</span> TikTok
          </span>
          <span className="text-white/60 text-[11px]">וידאו 9:16 אנכי</span>
        </div>

        <div className="relative aspect-[9/16] w-full overflow-hidden bg-neutral-900">
          {renderMediaSlot(true)}

          {/* Right Rail */}
          <div className="absolute bottom-16 left-3 flex flex-col items-center gap-4 text-white z-10">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xl">❤️</span>
              <span className="text-[10px] font-bold">—</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xl">💬</span>
              <span className="text-[10px] font-bold">—</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xl">⭐️</span>
              <span className="text-[10px] font-bold">—</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xl">↗️</span>
              <span className="text-[10px] font-bold">—</span>
            </div>
            <div className="h-7 w-7 rounded-full border-2 border-white/80 bg-neutral-800 flex items-center justify-center text-[10px] animate-spin">
              🎵
            </div>
          </div>

          {/* Bottom Info */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 text-right pr-4 pl-14">
            <p className="text-xs font-bold text-white mb-1">
              @{businessName.replace(/\s+/g, "_")}
            </p>
            <p className="line-clamp-2 text-xs leading-5 text-white/90">
              {activeCaption}
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-white/80">
              <span>🎵</span>
              <span className="truncate">צליל מקורי · {businessName}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-[#deddd8] pb-4">
        <div>
          <p className="text-sm font-bold text-[#20211f]">
            {approvedCount} מתוך {posts.length} אושרו
          </p>
          <p className="mt-0.5 text-xs text-[#747570]">
            התאמה מלאה לכל ערוץ: עיצוב הפוסט, מיקום הטקסט, כרטיס הקישור ופורמט המדיה
          </p>
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e9e8e3] sm:w-40">
          <div
            className="h-full rounded-full bg-[#343632] transition-all"
            style={{ width: `${posts.length ? (approvedCount / posts.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="mb-5 lg:hidden">
        <label htmlFor="mobile-post-select" className="mb-1.5 block text-xs font-bold text-[#62635f]">
          איזה פוסט בודקים?
        </label>
        <select
          id="mobile-post-select"
          value={selectedIndex}
          disabled={imageLocked}
          onChange={(event) => selectPost(Number(event.target.value))}
          className="h-11 w-full rounded-md border border-[#cecdc7] bg-white px-3 text-sm font-bold text-[#20211f]"
        >
          {posts.map((post, index) => (
            <option key={`${post.title}-${index}`} value={index}>
              {post.approval_status === "approved" ? "✓ " : ""}
              פוסט {index + 1}: {post.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* Post Navigation Sidebar */}
        <aside className="sticky top-6 hidden space-y-1 lg:block">
          <p className="mb-3 text-xs font-bold text-[#747570]">הפוסטים החודש</p>
          {posts.map((post, index) => (
            <button
              key={`${post.title}-${index}`}
              type="button"
              disabled={imageLocked}
              onClick={() => selectPost(index)}
              className={`flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-right transition-colors ${
                selectedIndex === index ? "bg-[#e9e8e3] text-[#20211f]" : "text-[#62635f] hover:bg-white"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  post.approval_status === "approved"
                    ? "border-[#343632] bg-[#343632] text-white"
                    : "border-[#bab9b3]"
                }`}
              >
                {post.approval_status === "approved" ? "✓" : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold leading-5">{post.title}</span>
                <span className="block text-[11px] text-[#898a85]">{post.date_hint}</span>
              </span>
            </button>
          ))}
        </aside>

        {/* Main Editor */}
        <main className="min-w-0">
          <div className="mb-4">
            <p className="text-xs font-bold text-[#747570]">
              פוסט {selectedIndex + 1} · {currentPost.date_hint} · {FORMAT_LABELS[currentPost.format]}
            </p>
            <h1 className="mt-1 text-2xl font-black leading-tight text-[#20211f]">{currentPost.title}</h1>
            {currentPost.why_now ? (
              <p className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-3 py-2 text-sm leading-6 text-[#191b18]">
                <span className="font-bold">למה עכשיו: </span>
                {currentPost.why_now}
              </p>
            ) : currentPost.calendar_tie || currentPost.goal_fit ? (
              <p className="mt-3 text-sm leading-6 text-[#5e6159]">
                {currentPost.calendar_tie ? `${currentPost.calendar_tie}. ` : ""}
                {currentPost.goal_fit}
              </p>
            ) : null}
          </div>

          {/* CHANNEL TABS SELECTOR */}
          <div className="mb-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#deddd8] pb-3">
              <span className="text-xs font-bold text-[#747570] ml-2">תצוגת ערוץ:</span>
              {availableOutlets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setOutlet(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                    outlet === item.key
                      ? "bg-[#20211f] text-white shadow-sm"
                      : "bg-white border border-[#dedcd4] text-[#62635f] hover:bg-[#faf8f5] hover:text-[#20211f]"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  <span
                    className={`text-[10px] rounded px-1.5 py-0.5 ${
                      outlet === item.key ? "bg-white/20 text-white" : "bg-[#f0efeb] text-[#747570]"
                    }`}
                  >
                    {item.badge}
                  </span>
                </button>
              ))}
            </div>

            {/* CHANNEL FORMAT SPECS EXPLANATION */}
            <div className="mt-2.5 rounded-md bg-[#faf8f5] border border-[#e8e6df] px-3 py-1.5 text-xs text-[#5e6159] flex items-center justify-between">
              <p>
                <span className="font-bold text-[#191b18]">פורמט {currentOutletMeta.label}: </span>
                {currentOutletMeta.specs}
              </p>
            </div>
          </div>

          {/* Two-Column Workspace: Left/Center is the Native Platform Mockup, Right is Controls */}
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(340px,1.15fr)_minmax(0,0.85fr)]">
            {/* Visual Column: NATIVE Channel Mockup + Designer AI Panel */}
            <div className="space-y-4">
              {/* Dynamic Platform Mockup */}
              {outlet === "facebook"
                ? renderFacebookMockup()
                : outlet === "whatsapp"
                ? renderWhatsAppMockup()
                : outlet === "tiktok"
                ? renderTikTokMockup()
                : renderInstagramMockup()}

              {/* AI Designer Studio Panel */}
              <section className="rounded-lg border border-[#deddd8] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#e9e8e3]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#20211f] text-white">
                      <IconSparkles className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#20211f]">
                      מעצב ה-AI של הפוסט
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDesignerSettings((open) => !open)}
                    className="text-[11px] font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
                  >
                    {showDesignerSettings ? "סגור התאמה ידנית" : "התאמה ידנית"}
                  </button>
                </div>

                {/* Concept and Art Direction */}
                {currentPost.creative_concept || currentPost.visual_style ? (
                  <div className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] p-2.5 text-xs text-[#191b18]">
                    {currentPost.creative_concept ? (
                      <p className="leading-5">
                        <span className="font-bold">קונספט המעצב: </span>
                        {currentPost.creative_concept}
                      </p>
                    ) : null}
                    {currentPost.visual_style ? (
                      <p className="mt-1 text-[11px] text-[#6b6961]">
                        <span className="font-bold">סגנון ארט: </span>
                        {currentPost.visual_style}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Quick Presets */}
                <div className="mt-3">
                  <p className="text-[11px] font-bold text-[#747570] mb-2">כיוון עיצובי מהיר בלחיצה:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DESIGN_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        disabled={imageLocked}
                        onClick={() => void handleApplyDesignPreset(preset.key, false)}
                        className="rounded-md border border-[#cecdc7] bg-[#faf8f5] p-2 text-right transition-colors hover:bg-white hover:border-[#191b18] disabled:opacity-50"
                      >
                        <span className="block text-xs font-bold text-[#20211f]">
                          {preset.icon} {preset.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-3 text-[#747570]">
                          {preset.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Direction Input */}
                <div className="mt-3 border-t border-[#e9e8e3] pt-3">
                  <p className="text-[11px] font-bold text-[#747570] mb-1.5">הנחיה חופשית למעצב ה-AI:</p>
                  <div className="flex gap-1.5">
                    <input
                      value={customDesignPrompt}
                      onChange={(e) => setCustomDesignPrompt(e.target.value)}
                      placeholder="למשל: תקריב על הידיים לשות בצק, שולחן חג עשיר..."
                      disabled={imageLocked}
                      className="flex-1 rounded-md border border-[#dedcd4] px-2.5 py-1.5 text-xs text-[#20211f]"
                    />
                    <button
                      type="button"
                      disabled={imageLocked || !customDesignPrompt.trim()}
                      onClick={() => void handleApplyDesignPreset("custom", false)}
                      className="rounded-md border border-[#20211f] bg-[#20211f] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                    >
                      {designerBusy ? "מתכנן…" : "עדכן"}
                    </button>
                  </div>
                </div>

                {/* Manual Fine-Tuning Settings (Toggleable) */}
                {showDesignerSettings ? (
                  <div className="mt-3 space-y-3 rounded-md border border-[#dedcd4] bg-[#f9f8f6] p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#20211f]">שילוב כיתוב מעוצב על התמונה</span>
                      <button
                        type="button"
                        onClick={() => void updateDesignField({ has_overlay: !hasOverlay })}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                          hasOverlay ? "bg-[#20211f] text-white" : "bg-[#e9e8e3] text-[#62635f]"
                        }`}
                      >
                        {hasOverlay ? "כן, שלב כיתוב" : "לא, צילום נקי"}
                      </button>
                    </div>

                    {hasOverlay ? (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-[#62635f] mb-1">
                            כותרת על התמונה (2-5 מילים)
                          </label>
                          <input
                            value={overlayHeadline}
                            onChange={(e) =>
                              void updateDesignField({
                                overlay_headline: e.target.value,
                                overlay_text: e.target.value,
                              })
                            }
                            className="w-full rounded border border-[#cecdc7] bg-white px-2.5 py-1.5 text-xs"
                            placeholder="החלות החמות של שישי..."
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#62635f] mb-1">
                            תגית עליונה / קיקר (אופציונלי)
                          </label>
                          <input
                            value={overlayBadge}
                            onChange={(e) => void updateDesignField({ overlay_badge: e.target.value })}
                            className="w-full rounded border border-[#cecdc7] bg-white px-2.5 py-1.5 text-xs"
                            placeholder="מהדורת חג / בשישי בלבד..."
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#62635f] mb-1">
                            תבנית הכרטיס
                          </label>
                          <div className="grid grid-cols-2 gap-1">
                            {THEME_OPTIONS.map((theme) => (
                              <button
                                key={theme.key}
                                type="button"
                                onClick={() => void updateDesignField({ overlay_theme: theme.key })}
                                className={`rounded border px-2 py-1.5 text-[11px] font-bold ${
                                  activeTemplate === theme.key
                                    ? "border-[#20211f] bg-[#20211f] text-white"
                                    : "border-[#dedcd4] bg-white text-[#62635f]"
                                }`}
                              >
                                {theme.label}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1.5 text-[10px] leading-4 text-[#898a85]">
                            {CARD_TEMPLATES.find((t) => t.key === activeTemplate)?.desc}
                          </p>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {/* Image provenance + source switch */}
                <div className="mt-3 pt-3 border-t border-[#e9e8e3] space-y-2">
                  {(() => {
                    const meta = IMAGE_SOURCE_LABELS[imageSourceKey];
                    if (!meta) return null;
                    return (
                      <div className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold ${meta.tone}`}>
                        {meta.text}
                      </div>
                    );
                  })()}
                  {currentAssetId ? (
                    <p className="rounded-md border border-[#e3cec4] bg-[#fbf4f0] px-2.5 py-1.5 text-[10px] leading-4 text-[#7d4436]">
                      {currentAsset
                        ? `מהספרייה שלכם: ${currentAsset.description || "נכס ללא תיאור"}`
                        : "התמונה הזו נבחרה מהספרייה שלכם."}
                    </p>
                  ) : null}
                  {needsPhoto(currentPost.overlay_theme) ? (
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        disabled={imageLocked}
                        onClick={() => void chooseImageSource("real")}
                        className="rounded border border-[#dedcd4] bg-white px-2 py-1.5 text-[11px] font-bold text-[#62635f] disabled:opacity-40"
                      >
                        התמונה שלי מהאתר
                      </button>
                      <button
                        type="button"
                        disabled={imageLocked}
                        onClick={() => void chooseImageSource("ai")}
                        className="rounded border border-[#dedcd4] bg-white px-2 py-1.5 text-[11px] font-bold text-[#62635f] disabled:opacity-40"
                      >
                        ליצור תמונה ב-AI
                      </button>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={imageLocked}
                    onClick={() => void prepareImage(selectedIndex, true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#191b18] bg-[#faf8f5] px-3 py-2 text-xs font-bold text-[#191b18] hover:bg-white disabled:opacity-40"
                  >
                    <IconImage className="h-3.5 w-3.5" />
                    {isPreparingImage ? "יוצר תמונה חדשה ע״י AI…" : "יצירת תמונה חדשה לפי העיצוב"}
                  </button>

                  {/* The owner's own photographs — the fastest route to a real picture of
                      the business instead of another generated one. */}
                  <button
                    type="button"
                    disabled={imageLocked}
                    onClick={toggleAssetPicker}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#e3cec4] bg-[#fbf4f0] px-3 py-2 text-xs font-bold text-[#7d4436] hover:bg-white disabled:opacity-40"
                  >
                    <IconImage className="h-3.5 w-3.5" />
                    {showAssets ? "סגירת הספרייה" : "בחירה מהנכסים שלי"}
                  </button>

                  {showAssets ? (
                    <div className="rounded-md border border-[#e3cec4] bg-[#fdfbf9] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[#7d4436]">
                          הנכסים שלי{assets ? ` · ${assets.length}` : ""}
                        </p>
                        <span className="flex items-center gap-2 text-[10px]">
                          <button
                            type="button"
                            disabled={assetsLoading || imageLocked}
                            onClick={() => void loadAssets()}
                            className="font-bold text-[#747570] underline underline-offset-2 hover:text-[#20211f] disabled:opacity-40"
                          >
                            רענון
                          </button>
                          <Link
                            href="/assets"
                            className="font-bold text-[#7d4436] underline underline-offset-2"
                          >
                            ניהול הספרייה
                          </Link>
                        </span>
                      </div>

                      {attachError ? (
                        <p className="mt-3 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-2.5 py-1.5 text-[11px] leading-5 text-[#9f4330]">
                          {attachError}
                        </p>
                      ) : null}

                      {!cardNeedsPhoto ? (
                        <p className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-2.5 py-1.5 text-[11px] leading-5 text-[#6b6961]">
                          הכרטיס הזה טיפוגרפי ובלי תמונה, אז הנכס שתבחרו לא יוצג עליו. אפשר לבחור
                          תבנית אחרת ב״התאמה ידנית״ כדי שהתמונה תופיע.
                        </p>
                      ) : null}

                      {assetsLoading && !assets ? (
                        <p className="mt-3 text-[11px] text-[#747570]">טוענים את הספרייה…</p>
                      ) : assetsError ? (
                        <p className="mt-3 text-[11px] leading-5 text-[#9f4330]">{assetsError}</p>
                      ) : libraryEmpty ? (
                        <div className="mt-3 rounded-md border border-[#e3cec4] bg-white px-3 py-4 text-center">
                          <p className="text-[11px] font-bold text-[#20211f]">הספרייה שלכם עוד ריקה</p>
                          <p className="mx-auto mt-1 max-w-xs text-[11px] leading-5 text-[#747570]">
                            כדי לשבץ תמונה משלכם צריך קודם שיהיה מה לבחור: מעלים תמונה או סרטון,
                            מייבאים מקישור, או מריצים סריקה של האתר.
                          </p>
                          <Link
                            href="/assets"
                            className="mt-2.5 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[#7d4436] px-3 text-[11px] font-bold text-white"
                          >
                            <IconImage className="h-3.5 w-3.5" />
                            להוספת נכסים לספרייה
                          </Link>
                        </div>
                      ) : (
                        <>
                          <div className="mt-3 rounded-md border border-[#e3cec4] bg-white p-2.5">
                            <button
                              type="button"
                              disabled={suggesting || imageLocked}
                              onClick={() => void suggestAssetsForPost()}
                              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#7d4436] bg-[#fbf4f0] px-3 py-2 text-[11px] font-bold text-[#7d4436] hover:bg-white disabled:opacity-50"
                            >
                              <IconSparkles className="h-3.5 w-3.5" />
                              {suggesting ? "מחפשים מה מתאים…" : "מה מתאים לפוסט הזה?"}
                            </button>

                            {suggesting ? (
                              <p className="mt-2 text-[11px] leading-5 text-[#747570]">
                                ה-AI עובר על הנכסים שלכם ומשווה אותם לנושא הפוסט. זה יכול לקחת כמה
                                שניות — אפשר להשאיר את החלון פתוח.
                              </p>
                            ) : null}

                            {!suggesting && suggestError ? (
                              <p className="mt-2 text-[11px] leading-5 text-[#9f4330]">{suggestError}</p>
                            ) : null}

                            {!suggesting && suggestions && !rankedSuggestions.length ? (
                              <p className="mt-2 text-[11px] leading-5 text-[#747570]">
                                ה-AI לא מצא נכס שמתאים לפוסט הזה, ולכן הוא לא מציע אחד בכוח. אפשר לבחור
                                ידנית מהספרייה שלמטה.
                              </p>
                            ) : null}

                            {rankedSuggestions.length ? (
                              <>
                                <p className="mt-2.5 text-[10px] font-bold text-[#747570]">
                                  הכי מתאים לפוסט הזה, לפי סדר:
                                </p>
                                <ul className="mt-1.5 space-y-1.5">
                                  {rankedSuggestions.map(({ suggestion, asset }, rank) => (
                                    <li key={asset.id}>
                                      <button
                                        type="button"
                                        disabled={imageLocked}
                                        onClick={() => void attachAsset(asset)}
                                        className="flex w-full items-start gap-2 rounded-md border border-[#e3cec4] bg-[#fdfbf9] p-2 text-right hover:border-[#7d4436] disabled:opacity-50"
                                      >
                                        <AssetPickerThumb asset={asset} className="h-11 w-11 shrink-0 rounded" />
                                        <span className="min-w-0 flex-1">
                                          <span className="flex items-start gap-1.5">
                                            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#7d4436] text-[9px] font-bold text-white">
                                              {rank + 1}
                                            </span>
                                            <span className="line-clamp-2 text-[11px] font-bold leading-4 text-[#20211f]">
                                              {asset.description || "נכס ללא תיאור"}
                                            </span>
                                          </span>
                                          <span className="mt-1 block text-[11px] leading-5 text-[#7d4436]">
                                            {suggestion.reason}
                                          </span>
                                          <span className="mt-0.5 block text-[10px] font-bold text-[#747570]">
                                            {assetBusyId === asset.id
                                              ? "משבצים בפוסט…"
                                              : "לחצו כדי לשבץ את הנכס בפוסט"}
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : null}
                          </div>

                          <p className="mt-3 text-[10px] font-bold text-[#747570]">
                            כל הנכסים בספרייה — לחיצה משבצת את הנכס בפוסט:
                          </p>
                          <ul className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {(assets ?? []).map((asset) => {
                              const inPost = currentAssetId === asset.id;
                              return (
                                <li key={asset.id}>
                                  <button
                                    type="button"
                                    disabled={imageLocked}
                                    onClick={() => void attachAsset(asset)}
                                    className={`flex w-full flex-col overflow-hidden rounded-md border bg-white text-right disabled:opacity-50 ${
                                      inPost ? "border-[#7d4436]" : "border-[#dedcd4] hover:border-[#7d4436]"
                                    }`}
                                  >
                                    <AssetPickerThumb asset={asset} className="h-20 w-full" />
                                    <span className="block w-full p-1.5">
                                      <span className="line-clamp-2 block text-[10px] leading-4 text-[#3c3e3a]">
                                        {asset.description || "נכס ללא תיאור"}
                                      </span>
                                      {asset.tags.length ? (
                                        <span className="mt-1 flex flex-wrap gap-1">
                                          {asset.tags.slice(0, 2).map((tag) => (
                                            <span
                                              key={tag}
                                              className="rounded-full border border-[#e3cec4] bg-[#fbf4f0] px-1.5 text-[9px] text-[#7d4436]"
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        </span>
                                      ) : null}
                                      <span className="mt-1 flex items-center justify-between gap-1 text-[9px] text-[#8b8e84]">
                                        <span>
                                          {ASSET_SOURCE_LABELS[asset.source]}
                                          {asset.kind === "video" ? " · וידאו" : ""}
                                        </span>
                                        <span className="font-bold text-[#7d4436]">
                                          {assetBusyId === asset.id
                                            ? "משבצים…"
                                            : inPost
                                              ? "בפוסט הזה ✓"
                                              : "שיבוץ"}
                                        </span>
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-[11px] font-bold text-[#62635f] mb-1">
                      יחס ייצוא
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {([{ key: "auto" as const, label: "לפי פורמט" }, ...CARD_RATIOS]).map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => setExportRatio(r.key)}
                          className={`rounded border px-2 py-1 text-[11px] font-bold ${
                            exportRatio === r.key
                              ? "border-[#20211f] bg-[#20211f] text-white"
                              : "border-[#dedcd4] bg-white text-[#62635f]"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={exporting || (!currentPost.image_url && needsPhoto(currentPost.overlay_theme))}
                    onClick={() => void handleExportCard()}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#20211f] bg-[#20211f] px-3 py-2 text-xs font-bold text-white hover:bg-[#33352f] disabled:opacity-40"
                  >
                    <IconImage className="h-3.5 w-3.5" />
                    {exporting
                      ? "מייצא כרטיס…"
                      : `הורדת הכרטיס (${exportSize.w}×${exportSize.h})`}
                  </button>
                </div>
              </section>
            </div>

            {/* Copywriting & Actions Column */}
            <section className="min-w-0 space-y-4">
              <div className="rounded-lg border border-[#deddd8] bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#e9e8e3]">
                  <span className="text-xs font-bold text-[#747570]">
                    נוסח מותאם ל-{currentOutletMeta.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(activeCaption);
                      toast(`נוסח ה-${currentOutletMeta.label} הועתק.`);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#191b18] hover:underline"
                  >
                    <IconCopy className="h-3 w-3" />
                    העתק נוסח
                  </button>
                </div>

                <p className="mt-3.5 whitespace-pre-line text-sm leading-7 text-[#20211f]">
                  {activeCaption}
                </p>

                {currentPost.cta ? (
                  <p className="mt-4 border-t border-[#e9e8e3] pt-3.5 text-xs font-bold text-[#20211f]">
                    {currentPost.cta}
                  </p>
                ) : null}
              </div>

              {/* Tracking Link */}
              {currentPost.tracking_url ? (
                <div className="rounded-md border border-[#e6e4dc] bg-[#faf8f5] p-3 text-xs">
                  <p className="font-bold text-[#191b18]">קישור מעקב לקמפיין</p>
                  <p className="mt-1 break-all font-mono text-[#5e6159]">{currentPost.tracking_url}</p>
                  <button
                    type="button"
                    className="mt-2 font-bold text-[#191b18] underline inline-flex items-center gap-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(currentPost.tracking_url || "");
                      toast("הקישור הועתק.");
                    }}
                  >
                    <IconLink className="h-3 w-3" />
                    העתיקו קישור
                  </button>
                </div>
              ) : null}

              {/* Published URL Input */}
              <div className="rounded-md border border-[#e6e4dc] p-3 bg-white">
                <p className="text-xs font-bold text-[#191b18]">אחרי שפרסמתם ב-{currentOutletMeta.label}</p>
                <p className="mt-1 text-xs text-[#5e6159]">
                  הדביקו את קישור הפוסט החי כדי שנמדוד אותו בתוצאות.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={publishUrl}
                    onChange={(event) => setPublishUrl(event.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-md border border-[#dedcd4] px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={() => void markPublished()}
                    className="rounded-md border border-[#191b18] px-3 py-2 text-xs font-bold text-[#191b18]"
                  >
                    {currentPost.published_url ? "עדכון קישור" : "סימון כפורסם"}
                  </button>
                </div>
              </div>

              {/* Text Rewrite Options */}
              {showChanges ? (
                <div className="rounded-lg border border-[#cecdc7] bg-[#f4f3f0] p-4">
                  <p className="text-sm font-bold text-[#20211f]">מה לא מרגיש נכון בנוסח?</p>
                  <p className="mt-1 text-xs text-[#747570]">בחרו כיוון ואנחנו נכין גרסה חדשה.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {CHANGE_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        disabled={rewriting !== null}
                        onClick={() => void requestRewrite(option.key)}
                        className="rounded-md border border-[#cecdc7] bg-white p-3 text-right disabled:opacity-50"
                      >
                        <span className="block text-xs font-bold text-[#20211f]">
                          {rewriting === option.key ? "מכינים…" : option.label}
                        </span>
                        <span className="mt-1 block text-[11px] leading-4 text-[#747570]">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="flex flex-col-reverse gap-3 border-t border-[#deddd8] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setShowChanges((open) => !open)}
                  className="min-h-11 px-3 text-sm font-bold text-[#62635f] underline-offset-4 hover:underline"
                >
                  {showChanges ? "ביטול" : "שכתוב נוסח"}
                </button>
                <button
                  type="button"
                  disabled={
                    approving ||
                    isApproved ||
                    !currentPost.image_url ||
                    imageLocked ||
                    Boolean(imageError)
                  }
                  onClick={() => void approveCurrentPost()}
                  className="scroll-mb-24 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white disabled:bg-[#c7c6c0] sm:min-w-44"
                >
                  <IconCheck className="h-4 w-4" />
                  {approving ? "מאשרים…" : isApproved ? "הפוסט אושר" : "מאשרים וממשיכים"}
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Off-screen card at true export size, so the PNG matches the preview exactly.
          It must NOT be display:none (that prevents rasterising) and must NOT be pushed
          off-canvas with a negative offset or a translation — both enlarge the document's
          scrollWidth and give the page thousands of pixels of phantom horizontal scroll
          on touch devices. A zero-sized, overflow-hidden, fixed container clips it out of
          the layout entirely while the node keeps its real 1080px box for html-to-image. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        <CardCanvas
          post={currentPost}
          brand={brandLanguage}
          businessName={businessName}
          size={exportSize}
          canvasRef={exportRef}
        />
      </div>
    </div>
  );
}
