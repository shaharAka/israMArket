"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
import { PublishPanel } from "@/components/PublishPanel";
import {
  endpoints,
  type Asset,
  type AssetSource,
  type AssetSuggestion,
  type Audience,
  type BrandLanguage,
  type OverlayTheme,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import { IconCheck, IconCopy, IconImage, IconLink, IconSparkles, IconUsers, IconWhatsApp } from "@/lib/icons";
import { toast } from "@/lib/ui";

type OutletKey = "instagram" | "facebook" | "whatsapp" | "tiktok";
type RewriteTone = "direct" | "neighborhood" | "punchy";

/**
 * The outlet control is a picker of channels: its options are the icon alone, and the
 * mockup below is the format spec that each old badge and spec line used to repeat.
 * `label` is still what the copy column and the publish row call the outlet.
 */
const OUTLETS: { key: OutletKey; label: string; icon: string }[] = [
  { key: "instagram", label: "אינסטגרם", icon: "📸" },
  { key: "facebook", label: "פייסבוק", icon: "📘" },
  { key: "whatsapp", label: "וואטסאפ", icon: "💬" },
  { key: "tiktok", label: "טיקטוק", icon: "🎵" },
];

const CHANGE_OPTIONS: { key: RewriteTone; label: string; description: string }[] = [
  { key: "punchy", label: "קצר יותר", description: "נשמור את המסר ונקצר אותו" },
  { key: "neighborhood", label: "פחות מכירתי", description: "ננסח בטון טבעי וחם יותר" },
  { key: "direct", label: "ברור יותר", description: "נחדד מה הלקוח צריך לעשות" },
];

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

/**
 * Whether React is running in a browser. The off-screen export card is portalled into
 * `document.body`, which has no server equivalent, so the server snapshot is `false` and
 * React swaps it to `true` right after hydration. Nothing writes this value, so the
 * subscription is a no-op — the same pattern the demo flag uses on `/assets`.
 */
function subscribeClient() {
  return () => {};
}
function clientSnapshot() {
  return true;
}
function serverSnapshot() {
  return false;
}

/**
 * A mockup is a visual preview of how the post looks, so it shows only the opening of
 * the caption. The full text lives in the editable box beside it — drawing it twice
 * cost roughly 25 words on the face and told the owner nothing extra.
 *
 * 60 characters is the one line the mockup actually reads as a caption. Measured against
 * the real account the longer preview was the single largest block of counted text on
 * this page, and every one of those words was already on the screen in full, two columns
 * over (UI-RULES rule 7).
 */
function previewCaption(caption: string, max = 60): string {
  const clean = (caption || "").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
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

  // Everything below the post is a control the owner occasionally needs, not a call to
  // action. Each group stays collapsed behind one quiet affordance so the screen reads as
  // "the post, and the one thing to do about it" (UI-RULES rule 1 + 2).
  const [showImageTools, setShowImageTools] = useState(false);
  const [showDesigner, setShowDesigner] = useState(false);
  const [showRatios, setShowRatios] = useState(false);
  // The picker of audiences: a long list of names the owner reads only when changing the
  // assignment, so it opens on demand like the groups above it.
  const [showAudience, setShowAudience] = useState(false);
  // The handoff kit, the date and the capability note. Collapsed like the two groups above
  // it: the page already has its one dark button, and none of this is a call to action.
  const [showPublish, setShowPublish] = useState(false);

  // Who the post is for. The picker is an ordinary list read; the write is only ever a
  // deliberate change of the selection.
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(true);
  const [audiencesError, setAudiencesError] = useState("");
  const [audienceBusy, setAudienceBusy] = useState(false);

  // Dedicated off-screen canvas at true export size, so the downloaded PNG never
  // includes the mockup chrome (Instagram header, action rail, phone frame).
  const exportRef = useRef<HTMLDivElement>(null);

  /** See `clientSnapshot` below: false on the server, true once React runs in a browser. */
  const exportCanvasReady = useSyncExternalStore(
    subscribeClient,
    clientSnapshot,
    serverSnapshot,
  );

  /** One cheap list read on mount, so the control can say "אין קהלים" rather than guess. */
  useEffect(() => {
    let cancelled = false;
    endpoints
      .audiences()
      .then((res) => {
        if (cancelled) return;
        setAudiences(res.audiences ?? []);
        setAudiencesError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setAudiencesError(err instanceof Error ? err.message : "טעינת הקהלים נכשלה");
      })
      .finally(() => {
        if (!cancelled) setAudiencesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /** Point the post at the segment it serves. Same plumbing as attaching an asset: the
   *  server owns the post, so the whole strategy it returns is taken as the truth. */
  async function changeAudience(audienceId: number | null) {
    if (audienceBusy) return;
    setAudienceBusy(true);
    setAudiencesError("");
    try {
      const result = await endpoints.setPostAudience(selectedIndex, audienceId);
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      const name = audienceId === null ? "" : audiences.find((item) => item.id === audienceId)?.name || "";
      toast(name ? `הפוסט משויך עכשיו לקהל: ${name}.` : "השיוך לקהל הוסר מהפוסט.");
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "שיוך הקהל נכשל");
    } finally {
      setAudienceBusy(false);
    }
  }

  /** Every write returns the whole strategy, so the editor takes the server's version of
   *  the month rather than patching its own copy — the same rule the handlers below follow. */
  function applyStrategy(strategy: StrategyPayload) {
    setPosts(strategy.roadmap.posts);
    onStrategyUpdated?.(strategy);
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
  // The post carries the audience it serves. `audience_name` is what the plan wrote;
  // when a post arrived without one, the loaded list still knows the name of the id, so
  // the control never shows a raw number.
  const currentAudienceId = currentPost.audience_id ?? null;
  const currentAudienceName =
    currentPost.audience_name ||
    audiences.find((audience) => audience.id === currentAudienceId)?.name ||
    "";
  // Ranked answers arrive as ids; the picker shows them with their thumbnail and tags.
  const rankedSuggestions = (suggestions ?? []).flatMap((suggestion) => {
    const asset = (assets ?? []).find((item) => item.id === suggestion.asset_id);
    return asset ? [{ suggestion, asset }] : [];
  });
  // The design-instruction apply button is only meaningful once the owner has typed
  // something to apply — a permanently visible dark button that does nothing is noise.
  const customDesignDirty = customDesignPrompt.trim().length > 0;


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
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-white/95">
                {previewCaption(activeCaption)}
              </p>
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

          {/* No invented engagement counts. A number inside a phone frame reads as a real
              metric, which is the exact thing this product refuses to fake. The reel path
              already drops them; the feed must not be the exception. */}
          <p className="mt-2 text-xs font-bold text-[#20211f]">סימוני ״אהבתי״</p>

          {/* Caption Below Media */}
          <div className="mt-1.5 text-xs leading-5 text-[#20211f]">
            <span className="font-bold ml-1.5">{businessName}</span>
            <span className="whitespace-pre-line text-[#343632]">{previewCaption(activeCaption)}</span>
          </div>

          {/* The post's own call to action used to be printed here as well. It is part of
              the caption — drawn in full in the copy column and inside the card's own
              design — so this third copy was pure repetition (UI-RULES rule 7). */}

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
            {previewCaption(activeCaption)}
          </p>
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
              <span className="mr-1 text-[11px]">—</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span>תגובות</span>
              <span>שיתופים</span>
            </div>
          </div>

          {/* Facebook's own action row — part of the mockup, so it is drawn, not clickable. */}
          <div aria-hidden className="grid grid-cols-3 pt-1.5 text-center text-xs font-bold text-[#65676b]">
            <span className="py-1.5 flex items-center justify-center gap-1.5">
              <span>👍</span> לייק
            </span>
            <span className="py-1.5 flex items-center justify-center gap-1.5">
              <span>💬</span> תגובה
            </span>
            <span className="py-1.5 flex items-center justify-center gap-1.5">
              <span>↗️</span> שיתוף
            </span>
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
                {previewCaption(activeCaption)}
              </p>

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
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#25d366] bg-white px-3 py-1.5 text-xs font-bold text-[#0b7a3d] hover:bg-[#f1fbf5]"
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
              {previewCaption(activeCaption)}
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

  /* ------------------------------------------------------------------ *
   * The screen has exactly one dark filled button: approving the post. *
   * Everything else below is a link, a quiet outline button, or one    *
   * collapsed affordance per group (UI-RULES rule 1 + 3).              *
   * ------------------------------------------------------------------ */

  /** The owner's own photographs, the AI generation paths and the source switch — all of
   *  them are the same question ("which picture?"), so they share one panel. */
  function renderImageTools() {
    return (
      <div className="mt-3 border-t border-[#e9e8e3] pt-3">
        <p className="text-[11px] font-bold text-[#62635f]">התמונה של הפוסט</p>
        <p className="mt-1 text-[11px] leading-5 text-[#62635f]">
          {IMAGE_SOURCE_LABELS[imageSourceKey]?.text}
          {currentAsset ? ` · ${currentAsset.description || "נכס ללא תיאור"}` : ""}
        </p>

        {needsPhoto(currentPost.overlay_theme) ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={imageLocked}
              onClick={() => void chooseImageSource("real")}
              className="min-h-9 rounded-md border border-[#cecdc7] bg-white px-3 text-[11px] font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
            >
              התמונה שלי מהאתר
            </button>
            <button
              type="button"
              disabled={imageLocked}
              onClick={() => void chooseImageSource("ai")}
              className="min-h-9 rounded-md border border-[#cecdc7] bg-white px-3 text-[11px] font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
            >
              ליצור תמונה ב-AI
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={imageLocked}
            onClick={() => void prepareImage(selectedIndex, true)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 text-xs font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
          >
            <IconImage className="h-3.5 w-3.5" />
            {isPreparingImage
              ? "יוצר תמונה חדשה ע״י AI…"
              : currentPost.image_url
                ? "יצירת תמונה חדשה לפי העיצוב"
                : "יצירת תמונה לפוסט"}
          </button>
          <button
            type="button"
            disabled={imageLocked}
            onClick={toggleAssetPicker}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 text-xs font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
          >
            <IconImage className="h-3.5 w-3.5" />
            {showAssets ? "סגירת הספרייה" : "בחירה מהנכסים שלי"}
          </button>
        </div>

        {showAssets ? (
          <div className="mt-3 rounded-md border border-[#e3cec4] bg-[#fdfbf9] p-3">
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
                הכרטיס הזה טיפוגרפי ובלי תמונה, אז הנכס שתבחרו לא יוצג עליו. אפשר לבחור תבנית
                אחרת ב״התאמה ידנית״ כדי שהתמונה תופיע.
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
                  כדי לשבץ תמונה משלכם צריך קודם שיהיה מה לבחור: מעלים תמונה או סרטון, מייבאים
                  מקישור, או מריצים סריקה של האתר.
                </p>
                <Link
                  href="/assets"
                  className="mt-2.5 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#c7c4b8] bg-transparent px-3 text-[11px] font-bold text-[#1e201d]"
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
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 py-2 text-[11px] font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-50"
                  >
                    <IconSparkles className="h-3.5 w-3.5" />
                    {suggesting ? "מחפשים מה מתאים…" : "מה מתאים לפוסט הזה?"}
                  </button>

                  {suggesting ? (
                    <p className="mt-2 text-[11px] leading-5 text-[#747570]">
                      ה-AI עובר על הנכסים שלכם ומשווה אותם לנושא הפוסט. זה יכול לקחת כמה שניות —
                      אפשר להשאיר את החלון פתוח.
                    </p>
                  ) : null}

                  {!suggesting && suggestError ? (
                    <p className="mt-2 text-[11px] leading-5 text-[#9f4330]">{suggestError}</p>
                  ) : null}

                  {!suggesting && suggestions && !rankedSuggestions.length ? (
                    <p className="mt-2 text-[11px] leading-5 text-[#747570]">
                      ה-AI לא מצא נכס שמתאים לפוסט הזה, ולכן הוא לא מציע אחד בכוח. אפשר לבחור ידנית
                      מהספרייה שלמטה.
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
      </div>
    );
  }

  /** Design directions, the free-text instruction and the manual fine-tuning — one panel,
   *  opened on demand, instead of four always-visible tiles and a dark apply button. */
  function renderDesignerPanel() {
    return (
      <div className="mt-3 border-t border-[#e9e8e3] pt-3">
        {currentPost.creative_concept || currentPost.visual_style ? (
          <div className="rounded-md border border-[#e2d7c3] bg-[#fcf9f2] p-2.5 text-xs text-[#191b18]">
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

        <p className="mt-3 text-[11px] font-bold text-[#747570]">כיוון עיצובי מהיר בלחיצה:</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {DESIGN_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={imageLocked}
              onClick={() => void handleApplyDesignPreset(preset.key, false)}
              className="rounded-md border border-[#cecdc7] bg-white p-2 text-right transition-colors hover:border-[#191b18] disabled:opacity-50"
            >
              <span className="block text-xs font-bold text-[#20211f]">
                {preset.icon} {preset.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-3 text-[#747570]">{preset.desc}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-[#e9e8e3] pt-3">
          <label
            htmlFor="custom-design-prompt"
            className="mb-1.5 block text-[11px] font-bold text-[#747570]"
          >
            הנחיה חופשית למעצב ה-AI:
          </label>
          <div className="flex gap-1.5">
            <input
              id="custom-design-prompt"
              value={customDesignPrompt}
              onChange={(e) => setCustomDesignPrompt(e.target.value)}
              placeholder="למשל: תקריב על הידיים לשות בצק, שולחן חג עשיר..."
              disabled={imageLocked}
              className="flex-1 rounded-md border border-[#dedcd4] px-2.5 py-1.5 text-xs text-[#20211f]"
            />
            {/* Only meaningful once something was typed — otherwise it is a dark button
                that does nothing sitting in the middle of the screen. */}
            {customDesignDirty ? (
              <button
                type="button"
                disabled={imageLocked || designerBusy}
                onClick={() => void handleApplyDesignPreset("custom", false)}
                className="rounded-md border border-[#cecdc7] bg-white px-3 py-1.5 text-xs font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
              >
                {designerBusy ? "מתכנן…" : "החלת ההנחיה"}
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDesignerSettings((open) => !open)}
          className="mt-3 text-[11px] font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
        >
          {showDesignerSettings ? "סגור התאמה ידנית" : "התאמה ידנית"}
        </button>

        {showDesignerSettings ? (
          <div className="mt-3 space-y-3 rounded-md border border-[#dedcd4] bg-[#f9f8f6] p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20211f]">שילוב כיתוב מעוצב על התמונה</span>
              <button
                type="button"
                onClick={() => void updateDesignField({ has_overlay: !hasOverlay })}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  hasOverlay
                    ? "border-[#20211f] bg-[#20211f] text-white"
                    : "border-[#cecdc7] bg-white text-[#62635f]"
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
                  <span className="block text-[11px] font-bold text-[#62635f] mb-1">תבנית הכרטיס</span>
                  <div className="grid grid-cols-2 gap-1">
                    {THEME_OPTIONS.map((theme) => (
                      <button
                        key={theme.key}
                        type="button"
                        onClick={() => void updateDesignField({ overlay_theme: theme.key })}
                        className={`rounded border px-2 py-1.5 text-[11px] font-bold ${
                          activeTemplate === theme.key
                            ? "border-[#20211f] bg-white text-[#20211f] ring-1 ring-[#20211f]"
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
      </div>
    );
  }

  const downloadDisabled =
    exporting || (!currentPost.image_url && needsPhoto(currentPost.overlay_theme));

  return (
    <div className="mx-auto max-w-5xl">
      {/* Where the month stands + which post is being looked at. One quiet control
          replaces the always-visible column of seven post buttons. */}
      <div className="mb-5 flex flex-col gap-3 border-b border-[#deddd8] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#20211f]">
            {approvedCount} מתוך {posts.length} אושרו
          </p>
          <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-[#e9e8e3] sm:w-40">
            <div
              className="h-full rounded-full bg-[#343632] transition-all"
              style={{ width: `${posts.length ? (approvedCount / posts.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        {/* The picker lists posts, so the option text is the number only: the title of the
            selected post is already the heading right below it, at full size. */}
        <label className="text-xs font-bold text-[#62635f] sm:min-w-64">
          <span className="mb-1.5 block">פוסט</span>
          <select
            aria-label="איזה פוסט בודקים?"
            value={selectedIndex}
            disabled={imageLocked}
            onChange={(event) => selectPost(Number(event.target.value))}
            className="h-11 w-full rounded-md border border-[#cecdc7] bg-white px-3 text-sm font-bold text-[#20211f]"
          >
            {posts.map((post, index) => (
              <option key={`${post.title}-${index}`} value={index}>
                {/* The check is a marker attached to the number, not a word beside it: with
                    a space, a closed select still reported two words per post, so simply
                    listing eight posts cost sixteen of the page's budget for eight digits
                    (UI-RULES rule 7 counts `main.innerText`). */}
                {`${post.approval_status === "approved" ? "✓" : ""}${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <main className="min-w-0">
        {/* The whole frame in one glance: which post this is, and THE one thing we are
            asking for. Everything else on this screen is a control or a utility. */}
        <div className="mb-5 flex flex-col gap-4 border-b border-[#e9e8e3] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#747570]">{currentPost.date_hint}</p>
            <h1 className="mt-1 text-2xl font-black leading-tight text-[#20211f]">{currentPost.title}</h1>
            {currentPost.why_now ? (
              <details className="mt-2 max-w-2xl">
                <summary className="cursor-pointer text-xs font-bold text-[#62635f]">למה עכשיו</summary>
                <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">{currentPost.why_now}</p>
              </details>
            ) : currentPost.calendar_tie || currentPost.goal_fit ? (
              <details className="mt-2 max-w-2xl">
                <summary className="cursor-pointer text-xs font-bold text-[#62635f]">
                  למה התכנון בחר את הפוסט הזה
                </summary>
                <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">
                  {currentPost.calendar_tie ? `${currentPost.calendar_tie}. ` : ""}
                  {currentPost.goal_fit}
                </p>
              </details>
            ) : null}
          </div>

          {/* THE one primary action on this page — the step the flow is waiting on. */}
          <div className="shrink-0 sm:w-64">
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
              className="scroll-mb-24 w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white disabled:bg-[#c7c6c0]"
            >
              <IconCheck className="h-4 w-4" />
              {approving ? "מאשרים…" : isApproved ? "הפוסט אושר" : "מאשרים וממשיכים"}
            </button>
          </div>
        </div>

        {/* CHANNEL SELECTOR — a control, not a call to action: one select, no filled tabs.
            Options carry the channel's name as well as its glyph: an emoji standing in for
            a brand is a guess for a non-technical owner, and the mockup below is the spec. */}
        <div className="mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold text-[#747570]">
              <span className="mb-1.5 block">ערוץ</span>
              <select
                aria-label="לאיזה ערוץ להסתכל?"
                value={outlet}
                disabled={imageLocked}
                onChange={(event) => setOutlet(event.target.value as OutletKey)}
                className="h-10 min-w-52 rounded-md border border-[#cecdc7] bg-white px-3 text-sm font-bold text-[#20211f]"
              >
                {availableOutlets.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.icon} {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Two-Column Workspace: preview on one side, copy and the one action on the other */}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(340px,1.15fr)_minmax(0,0.85fr)]">
          {/* Visual Column: NATIVE Channel Mockup + quiet utility rows underneath it */}
          <div className="space-y-3">
            {/* Dynamic Platform Mockup */}
            {outlet === "facebook"
              ? renderFacebookMockup()
              : outlet === "whatsapp"
              ? renderWhatsAppMockup()
              : outlet === "tiktok"
              ? renderTikTokMockup()
              : renderInstagramMockup()}

            {/* Export is a utility: it lives next to the preview it exports, as a quiet
                outline button rather than a second dark primary. */}
            <div className="border-t border-[#e9e8e3] pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={downloadDisabled}
                  onClick={() => void handleExportCard()}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#c7c4b8] bg-transparent px-3 text-xs font-bold text-[#1e201d] hover:bg-[#f4f3ee] disabled:opacity-40"
                >
                  <IconImage className="h-3.5 w-3.5" />
                  {exporting ? "מייצא כרטיס…" : "הורדת הכרטיס"}
                </button>
                <button
                  type="button"
                  aria-expanded={showRatios}
                  onClick={() => setShowRatios((open) => !open)}
                  className="min-h-10 px-2 text-xs font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
                >
                  {showRatios ? "סגירה" : "יחס"}
                </button>
              </div>
              {showRatios ? (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {([{ key: "auto" as const, label: "לפי פורמט" }, ...CARD_RATIOS]).map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={exportRatio === r.key}
                      onClick={() => setExportRatio(r.key)}
                      className={`rounded border px-2 py-1.5 text-[11px] font-bold ${
                        exportRatio === r.key
                          ? "border-[#20211f] bg-white text-[#20211f] ring-1 ring-[#20211f]"
                          : "border-[#dedcd4] bg-white text-[#62635f]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Who the post is for. A group like the three below it: the row keeps the
                answer on the face — this post's audience — while the picker itself is one
                quiet tap down. Open, the list of audiences is the longest text on the
                screen and it is a list of names to choose from, not something to read
                (UI-RULES rule 2). */}
            <div className="border-t border-[#e9e8e3]">
              <button
                type="button"
                aria-expanded={showAudience}
                onClick={() => setShowAudience((open) => !open)}
                className="flex min-h-11 w-full items-center justify-between px-1 text-right text-xs font-bold text-[#20211f]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <IconUsers className="h-3.5 w-3.5" />
                  קהל
                  {!audiencesLoading && !audiencesError && audiences.length ? (
                    <span className="font-bold text-[#62635f]">
                      ·{" "}
                      {currentAudienceId === null
                        ? "עוד לא הוחלט"
                        : currentAudienceName || "קהל שהוגדר קודם"}
                      {currentAudienceId !== null &&
                      audiences.find(
                        (audience) => audience.id === currentAudienceId && audience.is_primary,
                      )
                        ? " (הקהל המוביל)"
                        : ""}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-bold text-[#62635f]">
                  {showAudience ? "סגירה" : "פתיחה"}
                </span>
              </button>

              {/* A load in flight, a failed read and "no audiences yet" are all things the
                  owner has to know without asking, so they stay on the face whether the
                  picker is open or closed. Only the picker itself is one tap down. */}
              {audiencesLoading ? (
                <p className="px-1 pb-3 text-[11px] text-[#747570]">טוענים את הקהלים…</p>
              ) : audiencesError ? (
                <p className="px-1 pb-3 text-[11px] leading-5 text-[#9f4330]">{audiencesError}</p>
              ) : !audiences.length ? (
                <p className="px-1 pb-3 text-[11px] leading-5 text-[#747570]">
                  עוד לא הוגדרו קהלי יעד, ולכן אין למי לשייך את הפוסט.{" "}
                  <Link
                    href="/decisions#audiences"
                    className="font-bold text-[#7d4436] underline underline-offset-2"
                  >
                    להגדרת קהלים בהחלטות
                  </Link>
                </p>
              ) : showAudience ? (
                <div className="px-1 pb-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href="/decisions#audiences"
                      className="text-[10px] font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
                    >
                      ניהול
                    </Link>
                  </div>
                  <select
                    id="post-audience-select"
                    aria-label="למי הפוסט מיועד?"
                    value={currentAudienceId === null ? "" : String(currentAudienceId)}
                    // An image operation rewrites the same post on the server; the
                    // audience write waits rather than racing it.
                    disabled={imageLocked || audienceBusy}
                    onChange={(event) =>
                      void changeAudience(event.target.value === "" ? null : Number(event.target.value))
                    }
                    className="mt-2 h-9 w-full rounded-md border border-[#cecdc7] bg-white px-2 text-[11px] font-bold text-[#20211f] disabled:opacity-40"
                  >
                    <option value="" dir="rtl" lang="he">לא הוחלט — בלי שיוך לקהל</option>
                    {audiences.map((audience) => (
                      <option key={audience.id} value={audience.id} dir="rtl" lang="he">
                        {audience.name}
                      </option>
                    ))}
                  </select>
                  {audienceBusy ? (
                    <p className="mt-1 text-[10px] text-[#747570]">מעדכנים את השיוך…</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* The two panels that used to be a permanent wall of buttons. */}
            <div className="space-y-px border-t border-[#e9e8e3] pt-1">
              <div>
                <button
                  type="button"
                  aria-expanded={showImageTools}
                  disabled={imageLocked}
                  onClick={() => setShowImageTools((open) => !open)}
                  className="flex min-h-11 w-full items-center justify-between px-1 text-right text-xs font-bold text-[#20211f] disabled:opacity-40"
                >
                  <span>תמונה</span>
                  <span className="text-[11px] font-bold text-[#62635f]">
                    {showImageTools ? "סגירה" : "פתיחה"}
                  </span>
                </button>
                {showImageTools ? renderImageTools() : null}
              </div>
              <div className="border-t border-[#f0efeb]">
                <button
                  type="button"
                  aria-expanded={showDesigner}
                  disabled={imageLocked}
                  onClick={() => setShowDesigner((open) => !open)}
                  className="flex min-h-11 w-full items-center justify-between px-1 text-right text-xs font-bold text-[#20211f] disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <IconSparkles className="h-3.5 w-3.5" />
                    מעצב ה-AI
                  </span>
                  <span className="text-[11px] font-bold text-[#62635f]">
                    {showDesigner ? "סגירה" : "פתיחה"}
                  </span>
                </button>
                {showDesigner ? renderDesignerPanel() : null}
              </div>
              <div className="border-t border-[#f0efeb]">
                <button
                  type="button"
                  aria-expanded={showPublish}
                  disabled={imageLocked}
                  onClick={() => setShowPublish((open) => !open)}
                  className="flex min-h-11 w-full items-center justify-between px-1 text-right text-xs font-bold text-[#20211f] disabled:opacity-40"
                >
                  {/* "ידני" is the honest one-word answer to "can this publish for me?".
                      It is a state, not a promise, and the panel behind it says why. */}
                  <span>פרסום · ידני</span>
                  <span className="text-[11px] font-bold text-[#62635f]">
                    {showPublish ? "סגירה" : "פתיחה"}
                  </span>
                </button>
                {showPublish ? (
                  <PublishPanel
                    key={selectedIndex}
                    post={currentPost}
                    postIndex={selectedIndex}
                    outlet={outlet}
                    outletLabel={currentOutletMeta.label}
                    caption={activeCaption}
                    imageLocked={imageLocked}
                    onStrategy={applyStrategy}
                    onExportCard={() => void handleExportCard()}
                    exporting={exporting}
                    exportDisabled={downloadDisabled}
                    publishUrl={publishUrl}
                    onPublishUrlChange={setPublishUrl}
                    publishing={publishing}
                    onMarkPublished={() => void markPublished()}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* Copy Column + the single page action */}
          <section className="min-w-0 space-y-4">
            <div className="rounded-lg border border-[#deddd8] bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#e9e8e3]">
                <span className="text-xs font-bold text-[#747570]">הנוסח</span>
                <span className="flex items-center gap-3">
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
                  <button
                    type="button"
                    onClick={() => setShowChanges((open) => !open)}
                    className="text-[11px] font-bold text-[#62635f] underline-offset-4 hover:underline"
                  >
                    {showChanges ? "ביטול" : "שכתוב נוסח"}
                  </button>
                </span>
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

            {/* The tracked link and the "after you posted" flow used to sit here as two
                always-visible rows. Both are the publishing handoff, so they moved into
                the collapsed publishing group — one tap away, and off the page's face. */}
          </section>
        </div>
      </main>

      {/* Off-screen card at true export size, so the PNG matches the preview exactly.
          It must NOT be display:none (that prevents rasterising) and must NOT be pushed
          off-canvas with a negative offset or a translation — both enlarge the document's
          scrollWidth and give the page thousands of pixels of phantom horizontal scroll
          on touch devices. A zero-sized, overflow-hidden, fixed container clips it out of
          the layout entirely while the node keeps its real 1080px box for html-to-image.

          It is portalled to `document.body` because it is not page content: it is the
          source html-to-image rasterises. Inside the app's <main> it was still read as
          text — an invisible second copy of the card's badge, headline and call to action,
          counted against the page's word budget even though the owner can never see it.
          `body` carries the same dir, font and colours the app sets on <html>, so the
          exported PNG is unchanged. */}
      {exportCanvasReady
        ? createPortal(
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
