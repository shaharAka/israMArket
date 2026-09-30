"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { BottomSheet, useIsDesktop } from "@/components/posts/BottomSheet";
import { InspirationLine } from "@/components/posts/InspirationLine";
import {
  STATUS_LABEL,
  STATUS_TONE,
  nextPendingIndex,
  postDateLabel,
  postStatus,
} from "@/components/posts/postMeta";
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
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconImage,
  IconMegaphone,
  IconPen,
  IconSparkles,
  IconUsers,
} from "@/lib/icons";
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
  { key: "direct", label: "ברור יותר", description: "נגיד ללקוח בדיוק מה לעשות" },
];

/**
 * Everything the owner can do to a post besides approving it. On a phone each one opens a
 * bottom sheet over the preview; from 768px up they fill a side panel next to it. Either way
 * the screen itself holds only the post and the one thing we are asking for.
 */
type Section = "text" | "tone" | "photo" | "download" | "publish";

function IconDownload({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />
    </svg>
  );
}

const SECTIONS: { key: Section; label: string; title: string; Icon: (props: { className?: string }) => React.ReactNode }[] = [
  { key: "text", label: "טקסט", title: "הטקסט של הפוסט", Icon: IconPen },
  { key: "tone", label: "טון", title: "לשנות את הטון", Icon: IconSparkles },
  { key: "photo", label: "תמונה", title: "התמונה והעיצוב", Icon: IconImage },
  { key: "download", label: "הורדה", title: "הורדת הכרטיס", Icon: IconDownload },
  { key: "publish", label: "פרסום", title: "פרסום ידני", Icon: IconMegaphone },
];

const DESIGN_PRESETS:{ key: string; label: string; desc: string; icon: string }[] = [
  { key: "hero_clean", label: "צילום נקי", desc: "בלי שום כיתוב, רק המוצר והמרקם", icon: "📸" },
  { key: "corner_badge", label: "מדבקה בפינה", desc: "תגית קטנה ועדינה בפינה העליונה", icon: "🏷️" },
  { key: "announcement_card", label: "כרטיס הודעה", desc: "כרטיס נייר חם, באמצע או למטה", icon: "📜" },
  { key: "ink_pill", label: "תגית שחורה", desc: "תגית שחורה צפה, עם אותיות חדות", icon: "✒️" },
];

const IMAGE_SOURCE_LABELS: Record<string, { text: string; tone: string }> = {
  real_photo: { text: "תמונה אמיתית מהאתר שלכם", tone: "bg-[#e4efe4] text-[#2d5b33] border-[#bcd6bc]" },
  generated: { text: "תמונה שנוצרה ב-AI", tone: "bg-[#fdf1e3] text-[#8a5a1c] border-[#e8cfa8]" },
  asset: { text: "אחת מהתמונות שלכם", tone: "bg-[#fbf4f0] text-[#7d4436] border-[#e3cec4]" },
  pending: { text: "עוד אין תמונה. אפשר ליצור אחת", tone: "bg-[#f0efeb] text-[#62635f] border-[#dedcd4]" },
  none: { text: "כרטיס של טקסט בלבד, בלי תמונה", tone: "bg-[#f0efeb] text-[#62635f] border-[#dedcd4]" },
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
      alt={asset.description || "אחת מהתמונות שלכם"}
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

function primaryOutletOf(post: RoadmapPost): OutletKey {
  return (post.primary_outlet as OutletKey) || "instagram";
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
  onNavigate,
  onClose,
}: {
  posts: RoadmapPost[];
  brandLanguage?: BrandLanguage | null;
  initialIndex?: number;
  onStrategyUpdated?: (strategy: StrategyPayload) => void;
  /** Move the page to another post (after an approval). Without it the editor switches
   *  internally, the way it did when it had its own post picker. */
  onNavigate?: (index: number) => void;
  /** Back to the month's feed. */
  onClose?: () => void;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(initialPosts.length - 1, 0))
  );
  const [outlet, setOutlet] = useState<OutletKey>(
    (initialPosts[initialIndex]?.primary_outlet as OutletKey) || "instagram"
  );
  // Which secondary section is open. `null` on a phone means none (the sheet is closed); on a
  // desktop the side panel falls back to the text, which is what the owner reads to approve.
  const [active, setActive] = useState<Section | null>(null);
  const isDesktop = useIsDesktop();
  const shownSection: Section | null = active ?? (isDesktop ? "text" : null);
  const closeSection = useCallback(() => setActive(null), []);
  // An unsaved edit of the caption; `null` when the box shows what is stored.
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const [savingCaption, setSavingCaption] = useState(false);
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

  // Inside the photo section, the AI designer is a second, rarer question than "which
  // picture?", so it stays folded until asked for.
  const [showDesigner, setShowDesigner] = useState(false);

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
        setAudiencesError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הקהלים");
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
        עוד מכינים את הפוסטים של החודש.
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
      toast("הכרטיס עוד לא מוכן להורדה.");
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
        : `לא הצלחנו להוריד את הכרטיס: ${result.error}`,
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
          toast("הכרטיס הזה בנוי מטקסט בלבד, בלי תמונה. ככה תכננו אותו.");
          break;
        case "kept_existing":
          toast("לפוסט הזה כבר יש תמונה, אז לא יצרנו חדשה.");
          break;
        case "real_photo":
          toast("לקחנו תמונה מהאתר שלכם.");
          break;
        case "pending":
          toast("לא נוצרה תמונה. אפשר ליצור תמונה חדשה או לבחור אחת מהתמונות שלכם.");
          break;
        default:
          toast("התמונה מוכנה, בצבעים ובסגנון של העסק.");
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "לא הצלחנו ליצור את התמונה");
    } finally {
      setImageBusy(null);
    }
  }

  function selectPost(index: number) {
    setSelectedIndex(index);
    setOutlet((posts[index]?.primary_outlet as OutletKey) || "instagram");
    setActive(null);
    setCaptionDraft(null);
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
      setImageError(err instanceof Error ? err.message : "לא הצלחנו להחליף את התמונה");
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
      setAssetsError(err instanceof Error ? err.message : "לא הצלחנו לטעון את התמונות שלכם");
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
      toast("התמונה שלכם נכנסה לפוסט.");
    } catch (err) {
      // Kept apart from `assetsError`: a failed attach must not blank out the grid the
      // owner is choosing from.
      setAttachError(err instanceof Error ? err.message : "לא הצלחנו להכניס את התמונה לפוסט");
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
      setSuggestError(err instanceof Error ? err.message : "לא הצלחנו לבדוק אילו תמונות מתאימות");
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
      toast(name ? `הפוסט מיועד עכשיו לקהל: ${name}.` : "הפוסט כבר לא מיועד לקהל מסוים.");
    } catch (err) {
      setAudiencesError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הקהל");
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
      toast("הדביקו את הקישור לפוסט באינסטגרם או בפייסבוק");
      return;
    }
    setPublishing(true);
    try {
      const result = await endpoints.publishPost(selectedIndex, publishUrl.trim());
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      toast("סימנו שהפוסט פורסם. נמדוד אותו בעדכון הנתונים הבא.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו לשמור את הקישור");
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
      // The flow moves on by itself: the next post still waiting (wrapping round to one
      // that was skipped earlier), and back to the feed once the month is done.
      const nextIndex = nextPendingIndex(updatedPosts, selectedIndex);
      if (nextIndex >= 0) {
        toast("הפוסט אושר. הנה הבא בתור.");
        goTo(nextIndex);
      } else {
        toast("הפוסט אושר. כל הפוסטים של החודש אושרו.");
        onClose?.();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו לאשר את הפוסט");
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
      // Show the new version: the side panel's text on a desktop, the preview on a phone.
      setActive(isDesktop ? "text" : null);
      setCaptionDraft(null);
      toast("הכנו גרסה חדשה");
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו להכין גרסה חדשה");
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
      toast(generateImage ? "עיצבנו מחדש ויצרנו תמונה חדשה." : "העיצוב עודכן.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו לעצב את הפוסט");
    } finally {
      setDesignerBusy(false);
    }
  }

  /**
   * The whole post as the save endpoint expects it.
   *
   * The server writes `caption` into the primary outlet's own caption as well as the base
   * one, so what is sent here is that outlet's caption — sending the base caption instead
   * quietly replaced the tailored Instagram text every time a design field was touched.
   */
  function savePayload(updated: RoadmapPost, caption = captionFor(updated, primaryOutletOf(updated))) {
    return {
        title: updated.title,
        format: updated.format,
        hook: updated.hook,
        caption,
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
    };
  }

  async function updateDesignField(patch: Partial<RoadmapPost>) {
    const updated = { ...currentPost, ...patch };
    const newPosts = [...posts];
    newPosts[selectedIndex] = updated;
    setPosts(newPosts);

    try {
      const result = await endpoints.savePost(selectedIndex, savePayload(updated));
      onStrategyUpdated?.(result.strategy);
    } catch {
      // quiet save
    }
  }

  /** The owner's own wording for the primary outlet. A saved edit sends the post back to
   *  review on the server, so the toast says so rather than leaving a stale "approved". */
  async function saveCaption() {
    if (captionDraft === null || savingCaption) return;
    const wasApproved = currentPost.approval_status === "approved";
    setSavingCaption(true);
    try {
      const result = await endpoints.savePost(selectedIndex, savePayload(currentPost, captionDraft));
      applyStrategy(result.strategy);
      setCaptionDraft(null);
      toast(wasApproved ? "הנוסח נשמר. צריך לאשר את הפוסט שוב." : "הנוסח נשמר.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו לשמור את הנוסח");
    } finally {
      setSavingCaption(false);
    }
  }

  /** Another post, through the page when it owns the URL. */
  function goTo(index: number) {
    if (onNavigate) onNavigate(index);
    else selectPost(index);
  }

  const activeCaption = captionFor(currentPost, outlet);
  const businessName = brandLanguage?.business_name || "העסק";
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


  const previewSize = cardSize(
    currentPost.format,
    exportRatio === "auto" ? undefined : exportRatio,
  );
  const primaryOutlet = primaryOutletOf(currentPost);
  const primaryOutletLabel = OUTLETS.find((item) => item.key === primaryOutlet)?.label || "";
  const status = postStatus(currentPost);

  // Visual Image Media Slot — the card itself renders inside CardStage.
  function renderMediaSlot() {
    const photoFree = !needsPhoto(currentPost.overlay_theme);
    if (!currentPost.image_url && !photoFree) {
      return (
        <div
          style={{ aspectRatio: `${previewSize.w} / ${previewSize.h}` }}
          className="flex w-full flex-col items-center justify-center gap-3 bg-[#f0efeb] px-6 text-center"
        >
          <IconImage className="h-6 w-6 text-[#898a85]" />
          <p className="text-sm font-bold text-[#62635f]">
            {isPreparingImage ? "יוצרים את התמונה…" : "התמונה בהכנה"}
          </p>
          {imageError ? (
            <>
              <p className="text-xs leading-5 text-[#8d4539]">{imageError}</p>
              <button
                type="button"
                onClick={() => void prepareImage(selectedIndex, true)}
                className="min-h-11 text-sm font-bold text-[#20211f] underline underline-offset-4"
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
        rounded={false}
        ratio={exportRatio === "auto" ? undefined : exportRatio}
      />
    );
  }

  /**
   * The preview: the card exactly as it will be exported, and one line of the channel's
   * caption where that channel puts it (above the picture on Facebook, below it elsewhere).
   *
   * Nothing is drawn ON the card. The old phone mockups laid a gradient, the business name
   * and the caption over the bottom of a 9:16 card — the same strip where the card draws its
   * own headline — and next to a fake action rail. Together with a demo photo that had the
   * headline baked into it, the owner saw the headline three times. The card is the only
   * thing that draws the headline now.
   *
   * Sized to fit the screen, not the column: the width is whatever lets the whole card, the
   * approve button and the action row fit in one phone screen (`--reserve` is the height of
   * everything else), so a 9:16 reel no longer pushes the one action below the fold.
   */
  function renderPreview() {
    const captionLine = (
      <button
        type="button"
        onClick={() => setActive("text")}
        aria-label="לקרוא את הטקסט המלא"
        className="block w-full px-3 py-2.5 text-right text-[13px] leading-5 text-[#343632] transition-colors hover:bg-[#faf9f6]"
      >
        <span className="line-clamp-2">
          <span className="ml-1.5 font-bold text-[#20211f]">{businessName}</span>{" "}
          {previewCaption(activeCaption)}
        </span>
      </button>
    );
    return (
      <div
        className={`mx-auto ${
          currentPost.inspiration?.sources?.length
            ? "[--reserve:518px] md:[--reserve:422px]"
            : "[--reserve:476px] md:[--reserve:380px]"
        }`}
        style={{
          // The floor gives a little when the "why this post" line is shown, so a 9:16 reel
          // does not push the approve row under the tab bar on a 390x844 phone.
          width: `min(100%, max(${currentPost.inspiration?.sources?.length ? 176 : 200}px, calc((100dvh - var(--reserve)) * ${previewSize.w / previewSize.h})))`,
        }}
      >
        <div className="overflow-hidden rounded-xl border border-[#deddd8] bg-white shadow-sm">
          {outlet === "facebook" ? captionLine : null}
          {renderMediaSlot()}
          {outlet !== "facebook" ? captionLine : null}
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
      <div>
        <p className="text-sm leading-6 text-[#62635f]">
          {IMAGE_SOURCE_LABELS[imageSourceKey]?.text}
          {currentAsset ? ` · ${currentAsset.description || "תמונה בלי תיאור"}` : ""}
        </p>

        {needsPhoto(currentPost.overlay_theme) ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={imageLocked}
              onClick={() => void chooseImageSource("real")}
              className="min-h-9 rounded-md border border-[#cecdc7] bg-white px-3 text-[13px] font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
            >
              להשתמש בתמונה מהאתר
            </button>
            <button
              type="button"
              disabled={imageLocked}
              onClick={() => void chooseImageSource("ai")}
              className="min-h-9 rounded-md border border-[#cecdc7] bg-white px-3 text-[13px] font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
            >
              ליצור ב-AI
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
              ? "יוצרים תמונה חדשה…"
              : currentPost.image_url
                ? "ליצור תמונה חדשה לפי העיצוב"
                : "ליצור תמונה לפוסט"}
          </button>
          <button
            type="button"
            disabled={imageLocked}
            onClick={toggleAssetPicker}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 text-xs font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
          >
            <IconImage className="h-3.5 w-3.5" />
            {showAssets ? "לסגור את התמונות שלי" : "לבחור מהתמונות שלי"}
          </button>
        </div>

        {showAssets ? (
          <div className="mt-3 rounded-md border border-[#e3cec4] bg-[#fdfbf9] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-[#7d4436]">
                התמונות שלי{assets ? ` · ${assets.length}` : ""}
              </p>
              <span className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  disabled={assetsLoading || imageLocked}
                  onClick={() => void loadAssets()}
                  className="font-bold text-[#747570] underline underline-offset-2 hover:text-[#20211f] disabled:opacity-40"
                >
                  לרענן
                </button>
                <Link
                  href="/assets"
                  className="font-bold text-[#7d4436] underline underline-offset-2"
                >
                  לכל התמונות
                </Link>
              </span>
            </div>

            {attachError ? (
              <p className="mt-3 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-2.5 py-1.5 text-[13px] leading-5 text-[#9f4330]">
                {attachError}
              </p>
            ) : null}

            {!cardNeedsPhoto ? (
              <p className="mt-3 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] px-2.5 py-1.5 text-[13px] leading-5 text-[#6b6961]">
                הכרטיס הזה בנוי מטקסט בלבד, אז התמונה שתבחרו לא תופיע עליו. כדי שתופיע, בחרו
                תבנית אחרת ב״התאמה ידנית״.
              </p>
            ) : null}

            {assetsLoading && !assets ? (
              <p className="mt-3 text-[13px] text-[#747570]">טוענים את התמונות…</p>
            ) : assetsError ? (
              <p className="mt-3 text-[13px] leading-5 text-[#9f4330]">{assetsError}</p>
            ) : libraryEmpty ? (
              <div className="mt-3 rounded-md border border-[#e3cec4] bg-white px-3 py-4 text-center">
                <p className="text-[13px] font-bold text-[#20211f]">עוד אין לכם כאן תמונות</p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] leading-5 text-[#747570]">
                  כדי לבחור תמונה משלכם, קודם הוסיפו אותה: העלו תמונה או סרטון, הוסיפו מקישור,
                  או תנו לנו לקרוא את האתר.
                </p>
                <Link
                  href="/assets"
                  className="mt-2.5 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#c7c4b8] bg-transparent px-3 text-[13px] font-bold text-[#1e201d]"
                >
                  <IconImage className="h-3.5 w-3.5" />
                  להוסיף תמונות
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-3 rounded-md border border-[#e3cec4] bg-white p-2.5">
                  <button
                    type="button"
                    disabled={suggesting || imageLocked}
                    onClick={() => void suggestAssetsForPost()}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 py-2 text-[13px] font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-50"
                  >
                    <IconSparkles className="h-3.5 w-3.5" />
                    {suggesting ? "מחפשים מה מתאים…" : "למצוא תמונה שמתאימה לפוסט"}
                  </button>

                  {suggesting ? (
                    <p className="mt-2 text-[13px] leading-5 text-[#747570]">
                      עוברים על התמונות שלכם ובודקים מה מתאים לנושא הפוסט. זה לוקח כמה שניות,
                      השאירו את החלון פתוח.
                    </p>
                  ) : null}

                  {!suggesting && suggestError ? (
                    <p className="mt-2 text-[13px] leading-5 text-[#9f4330]">{suggestError}</p>
                  ) : null}

                  {!suggesting && suggestions && !rankedSuggestions.length ? (
                    <p className="mt-2 text-[13px] leading-5 text-[#747570]">
                      לא מצאנו תמונה שמתאימה לפוסט הזה, ולא נציע אחת בכוח. אפשר לבחור בעצמכם
                      מהתמונות למטה.
                    </p>
                  ) : null}

                  {rankedSuggestions.length ? (
                    <>
                      <p className="mt-2.5 text-xs font-bold text-[#747570]">
                        מה הכי מתאים, לפי הסדר:
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
                                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#7d4436] text-[11px] font-bold text-white">
                                    {rank + 1}
                                  </span>
                                  <span className="line-clamp-2 text-[13px] font-bold leading-4 text-[#20211f]">
                                    {asset.description || "תמונה בלי תיאור"}
                                  </span>
                                </span>
                                <span className="mt-1 block text-[13px] leading-5 text-[#7d4436]">
                                  {suggestion.reason}
                                </span>
                                <span className="mt-0.5 block text-xs font-bold text-[#747570]">
                                  {assetBusyId === asset.id
                                    ? "מכניסים לפוסט…"
                                    : "לחצו כדי להכניס לפוסט"}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>

                <p className="mt-3 text-xs font-bold text-[#747570]">
                  כל התמונות שלכם. לחיצה מכניסה את התמונה לפוסט:
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
                            <span className="line-clamp-2 block text-xs leading-4 text-[#3c3e3a]">
                              {asset.description || "תמונה בלי תיאור"}
                            </span>
                            {asset.tags.length ? (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {asset.tags.slice(0, 2).map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-[#e3cec4] bg-[#fbf4f0] px-1.5 text-[11px] text-[#7d4436]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <span className="mt-1 flex items-center justify-between gap-1 text-[11px] text-[#8b8e84]">
                              <span>
                                {ASSET_SOURCE_LABELS[asset.source]}
                                {asset.kind === "video" ? " · סרטון" : ""}
                              </span>
                              <span className="font-bold text-[#7d4436]">
                                {assetBusyId === asset.id
                                  ? "מכניסים…"
                                  : inPost
                                    ? "בפוסט הזה ✓"
                                    : "לבחור"}
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
                <span className="font-bold">הרעיון: </span>
                {currentPost.creative_concept}
              </p>
            ) : null}
            {currentPost.visual_style ? (
              <p className="mt-1 text-[13px] text-[#6b6961]">
                <span className="font-bold">הסגנון: </span>
                {currentPost.visual_style}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-3 text-[13px] font-bold text-[#747570]">עיצוב מהיר, בלחיצה אחת:</p>
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
              <span className="mt-0.5 block text-xs leading-3 text-[#747570]">{preset.desc}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-[#e9e8e3] pt-3">
          <label
            htmlFor="custom-design-prompt"
            className="mb-1.5 block text-[13px] font-bold text-[#747570]"
          >
            או תארו במילים שלכם:
          </label>
          <div className="flex gap-1.5">
            <input
              id="custom-design-prompt"
              value={customDesignPrompt}
              onChange={(e) => setCustomDesignPrompt(e.target.value)}
              placeholder="למשל: ידיים לשות בצק מקרוב, שולחן חג עמוס"
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
                {designerBusy ? "מעצבים…" : "לעצב לפי זה"}
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDesignerSettings((open) => !open)}
          className="mt-3 text-[13px] font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
        >
          {showDesignerSettings ? "לסגור את ההתאמה הידנית" : "התאמה ידנית"}
        </button>

        {showDesignerSettings ? (
          <div className="mt-3 space-y-3 rounded-md border border-[#dedcd4] bg-[#f9f8f6] p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20211f]">כיתוב על התמונה</span>
              <button
                type="button"
                onClick={() => void updateDesignField({ has_overlay: !hasOverlay })}
                aria-pressed={hasOverlay}
                // Outlined even when on: a filled toggle here was a second dark button.
                className={`min-h-10 rounded-full border px-3 text-xs font-bold transition-colors ${
                  hasOverlay
                    ? "border-[#20211f] bg-white text-[#20211f] ring-1 ring-[#20211f]"
                    : "border-[#cecdc7] bg-white text-[#62635f]"
                }`}
              >
                {hasOverlay ? "כן, עם כיתוב" : "לא, צילום נקי"}
              </button>
            </div>

            {hasOverlay ? (
              <>
                {/* The headline and the badge themselves are edited under "טקסט", with
                    the rest of the post's words. */}
                <div>
                  <span className="block text-[13px] font-bold text-[#62635f] mb-1">תבנית הכרטיס</span>
                  <div className="grid grid-cols-2 gap-1">
                    {THEME_OPTIONS.map((theme) => (
                      <button
                        key={theme.key}
                        type="button"
                        onClick={() => void updateDesignField({ overlay_theme: theme.key })}
                        className={`rounded border px-2 py-1.5 text-[13px] font-bold ${
                          activeTemplate === theme.key
                            ? "border-[#20211f] bg-white text-[#20211f] ring-1 ring-[#20211f]"
                            : "border-[#dedcd4] bg-white text-[#62635f]"
                        }`}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs leading-4 text-[#898a85]">
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

  /* ------------------------------------------------------------------ *
   * The sections behind the action row. Each is what used to be one   *
   * of the collapsed rows under the preview, moved as-is: the same     *
   * handlers, the same states, now one tap away in a sheet or panel.   *
   * ------------------------------------------------------------------ */

  function copyCaption() {
    // WhatsApp gets the whole formatted message (bold title, caption, call to action and
    // link), which is what the WhatsApp mockup's copy button used to hand over.
    const text =
      outlet === "whatsapp"
        ? `*${currentPost.title}*\n\n${activeCaption}\n\n${currentPost.cta || ""}\n${currentPost.tracking_url || ""}`.trim()
        : activeCaption;
    void navigator.clipboard.writeText(text);
    toast(`נוסח ה${currentOutletMeta.label} הועתק.`);
  }

  function renderTextSection() {
    // The server stores one editable caption per post: the primary outlet's. The other
    // channels' versions are written by the plan and stay read-only here.
    const editable = outlet === primaryOutlet;
    const draft = captionDraft ?? activeCaption;
    const dirty = captionDraft !== null && captionDraft !== activeCaption;
    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="post-caption" className="text-sm font-bold text-[#20211f]">
              הנוסח ל{currentOutletMeta.label}
            </label>
            <button
              type="button"
              onClick={copyCaption}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#20211f] underline underline-offset-4"
            >
              <IconCopy className="h-3.5 w-3.5" />
              להעתיק
            </button>
          </div>
          {editable ? (
            <textarea
              id="post-caption"
              value={draft}
              rows={5}
              disabled={savingCaption}
              onChange={(event) => setCaptionDraft(event.target.value)}
              className="mt-1 w-full resize-y rounded-lg border border-[#cecdc7] bg-white px-3 py-2 text-[15px] leading-7 text-[#20211f] disabled:opacity-60"
            />
          ) : (
            <p id="post-caption" className="mt-1 whitespace-pre-line text-[15px] leading-7 text-[#20211f]">
              {activeCaption}
            </p>
          )}
          {dirty ? (
            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                disabled={savingCaption}
                onClick={() => void saveCaption()}
                className="min-h-11 rounded-lg border border-[#20211f] bg-white px-4 text-sm font-bold text-[#20211f] disabled:opacity-50"
              >
                {savingCaption ? "שומרים…" : "לשמור את הנוסח"}
              </button>
              <button
                type="button"
                disabled={savingCaption}
                onClick={() => setCaptionDraft(null)}
                className="min-h-11 text-sm font-bold text-[#62635f] underline underline-offset-4"
              >
                לבטל
              </button>
            </div>
          ) : null}
          {!editable && primaryOutletLabel ? (
            <p className="mt-1 text-xs text-[#6b6c66]">אפשר לערוך רק את הנוסח ל{primaryOutletLabel}.</p>
          ) : null}
        </div>

        {currentPost.cta ? (
          <p className="border-t border-[#eeede8] pt-3 text-sm font-bold text-[#20211f]">{currentPost.cta}</p>
        ) : null}

        {/* The words drawn on the card itself — the one place the headline lives. */}
        {hasOverlay ? (
          <div className="space-y-3 border-t border-[#eeede8] pt-3">
            <div>
              <label htmlFor="post-overlay-headline" className="mb-1 block text-sm font-bold text-[#20211f]">
                הכותרת על התמונה
              </label>
              <input
                id="post-overlay-headline"
                value={overlayHeadline}
                onChange={(e) =>
                  void updateDesignField({
                    overlay_headline: e.target.value,
                    overlay_text: e.target.value,
                  })
                }
                className="h-11 w-full rounded-lg border border-[#cecdc7] bg-white px-3 text-sm"
                placeholder="2–5 מילים"
              />
            </div>
            <div>
              <label htmlFor="post-overlay-badge" className="mb-1 block text-sm font-bold text-[#20211f]">
                תגית
              </label>
              <input
                id="post-overlay-badge"
                value={overlayBadge}
                onChange={(e) => void updateDesignField({ overlay_badge: e.target.value })}
                className="h-11 w-full rounded-lg border border-[#cecdc7] bg-white px-3 text-sm"
                placeholder="למשל: מיוחד לחג / רק בשישי"
              />
            </div>
          </div>
        ) : null}

        {currentPost.why_now ? (
          <details className="border-t border-[#eeede8] pt-3">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-[#62635f]">למה עכשיו</summary>
            <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">{currentPost.why_now}</p>
          </details>
        ) : currentPost.calendar_tie || currentPost.goal_fit ? (
          <details className="border-t border-[#eeede8] pt-3">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-[#62635f]">
              למה הפוסט הזה
            </summary>
            <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">
              {currentPost.calendar_tie ? `${currentPost.calendar_tie}. ` : ""}
              {currentPost.goal_fit}
            </p>
          </details>
        ) : null}
      </div>
    );
  }

  function renderToneSection() {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[#62635f]">בחרו כיוון, ונכין גרסה חדשה.</p>
        {CHANGE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={rewriting !== null}
            onClick={() => void requestRewrite(option.key)}
            className="flex min-h-14 w-full flex-col justify-center rounded-lg border border-[#dedcd4] bg-white px-3 py-2 text-right hover:border-[#20211f] disabled:opacity-50"
          >
            <span className="text-sm font-bold text-[#20211f]">
              {rewriting === option.key ? "מכינים…" : option.label}
            </span>
            <span className="mt-0.5 text-xs leading-5 text-[#6b6c66]">{option.description}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderPhotoSection() {
    return (
      <div>
        {renderImageTools()}
        <div className="mt-4 border-t border-[#eeede8] pt-1">
          <button
            type="button"
            aria-expanded={showDesigner}
            disabled={imageLocked}
            onClick={() => setShowDesigner((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between text-right text-sm font-bold text-[#20211f] disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1.5">
              <IconSparkles className="h-4 w-4" />
              לשנות עיצוב
            </span>
            <span className="text-xs font-bold text-[#62635f]">{showDesigner ? "לסגור" : "לפתוח"}</span>
          </button>
          {showDesigner ? renderDesignerPanel() : null}
        </div>
      </div>
    );
  }

  function renderDownloadSection() {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold text-[#20211f]">גודל</p>
        <div className="grid grid-cols-2 gap-2">
          {([{ key: "auto" as const, label: "אוטומטי" }, ...CARD_RATIOS]).map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={exportRatio === r.key}
              onClick={() => setExportRatio(r.key)}
              className={`min-h-11 rounded-lg border px-2 text-sm font-bold ${
                exportRatio === r.key
                  ? "border-[#20211f] bg-white text-[#20211f] ring-1 ring-[#20211f]"
                  : "border-[#dedcd4] bg-white text-[#62635f]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={downloadDisabled}
          onClick={() => void handleExportCard()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#20211f] bg-white px-4 text-sm font-bold text-[#20211f] hover:bg-[#f4f3ee] disabled:opacity-40"
        >
          <IconDownload className="h-4 w-4" />
          {exporting ? "מורידים את הכרטיס…" : `להוריד את הכרטיס · ${exportSize.w}×${exportSize.h}`}
        </button>
      </div>
    );
  }

  /** Who the post is for — the choice the old collapsed "קהל" row held. */
  function renderAudience() {
    return (
      <div className="mb-4 border-b border-[#eeede8] pb-4">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="post-audience-select" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#20211f]">
            <IconUsers className="h-4 w-4" />
            למי הפוסט
          </label>
          <Link
            href="/decisions#audiences"
            className="min-h-11 content-center text-xs font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
          >
            לכל הקהלים
          </Link>
        </div>
        {/* A load in flight, a failed read and "no audiences yet" are all things the owner
            has to know without asking. */}
        {audiencesLoading ? (
          <p className="text-xs text-[#747570]">טוענים את הקהלים…</p>
        ) : audiencesError ? (
          <p className="text-xs leading-5 text-[#9f4330]">{audiencesError}</p>
        ) : !audiences.length ? (
          <p className="text-xs leading-5 text-[#747570]">
            עוד לא הגדרתם קהלים, אז אי אפשר לבחור למי הפוסט פונה.
          </p>
        ) : (
          <>
            <select
              id="post-audience-select"
              value={currentAudienceId === null ? "" : String(currentAudienceId)}
              // An image operation rewrites the same post on the server; the audience write
              // waits rather than racing it.
              disabled={imageLocked || audienceBusy}
              onChange={(event) =>
                void changeAudience(event.target.value === "" ? null : Number(event.target.value))
              }
              className="h-11 w-full rounded-lg border border-[#cecdc7] bg-white px-2 text-sm font-bold text-[#20211f] disabled:opacity-40"
            >
              <option value="" dir="rtl" lang="he">
                {currentAudienceId !== null && !currentAudienceName ? "קהל שהוגדר קודם" : "לא נבחר קהל"}
              </option>
              {audiences.map((audience) => (
                <option key={audience.id} value={audience.id} dir="rtl" lang="he">
                  {audience.name}
                  {audience.is_primary ? " (הקהל העיקרי)" : ""}
                </option>
              ))}
            </select>
            {audienceBusy ? <p className="mt-1 text-xs text-[#747570]">שומרים…</p> : null}
          </>
        )}
      </div>
    );
  }

  function renderPublishSection() {
    return (
      <div>
        {renderAudience()}
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
      </div>
    );
  }

  function renderSection(key: Section) {
    if (key === "text") return renderTextSection();
    if (key === "tone") return renderToneSection();
    if (key === "photo") return renderPhotoSection();
    if (key === "download") return renderDownloadSection();
    return renderPublishSection();
  }

  const sectionMeta = SECTIONS.find((item) => item.key === shownSection) ?? null;
  const nextPending = nextPendingIndex(posts, selectedIndex);

  /** THE one dark button: approve this post, or — once it is approved — the next one. */
  function renderPrimary() {
    const primaryClass =
      "inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#20211f] px-6 text-base font-bold text-white disabled:bg-[#c7c6c0]";
    if (status === "review") {
      return (
        <button
          type="button"
          disabled={
            approving ||
            (!currentPost.image_url && cardNeedsPhoto) ||
            imageLocked ||
            Boolean(imageError)
          }
          onClick={() => void approveCurrentPost()}
          className={primaryClass}
        >
          <IconCheck className="h-5 w-5" />
          {approving ? "מאשרים…" : "לאשר ולהמשיך"}
        </button>
      );
    }
    if (nextPending >= 0) {
      return (
        <button type="button" onClick={() => goTo(nextPending)} className={primaryClass}>
          לעבור לפוסט הבא
        </button>
      );
    }
    if (onClose) {
      return (
        <button type="button" onClick={onClose} className={primaryClass}>
          לחזור לכל הפוסטים
        </button>
      );
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="md:grid md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          {/* Where this is and how to get back — one row, so the card gets the height. */}
          <div className="mb-1 flex items-center justify-between gap-3">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="-mr-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-bold text-[#20211f]"
              >
                <IconArrowLeft className="h-4 w-4 -scale-x-100" />
                כל הפוסטים
              </button>
            ) : (
              <span />
            )}
            <span className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#6b6c66]">{postDateLabel(currentPost)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            </span>
          </div>

          <h1 className="mb-2 line-clamp-1 text-xl font-black leading-7 md:mb-3 md:line-clamp-2 text-[#20211f] md:text-2xl md:leading-8">
            {currentPost.title}
          </h1>

          {/* Which channel the preview shows. A control, not a call to action. */}
          {availableOutlets.length > 1 ? (
            <div role="tablist" aria-label="תצוגה לפי ערוץ" className="mb-2 flex justify-center gap-1 md:mb-3">
              {availableOutlets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={outlet === item.key}
                  disabled={imageLocked}
                  onClick={() => {
                    setOutlet(item.key);
                    setCaptionDraft(null);
                  }}
                  className={`min-h-11 rounded-full px-3.5 text-sm font-bold transition-colors disabled:opacity-40 ${
                    outlet === item.key ? "bg-[#eeede8] text-[#20211f]" : "text-[#62635f] hover:text-[#20211f]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          {renderPreview()}

          {/* Which real Instagram post this one follows. Its height is in the preview's
              --reserve, so the approve button stays on the first screen. */}
          <InspirationLine inspiration={currentPost.inspiration} />

          <div className="mt-3">{renderPrimary()}</div>

          {/* Everything else, one row of quiet actions. */}
          <div role="toolbar" aria-label="עוד פעולות על הפוסט" className="mt-2 grid grid-cols-5 gap-1">
            {SECTIONS.map(({ key, label, title, Icon }) => {
              const on = isDesktop && shownSection === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-pressed={isDesktop ? on : undefined}
                  aria-haspopup={isDesktop ? undefined : "dialog"}
                  onClick={() => setActive(key)}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold transition-colors ${
                    on ? "bg-[#eeede8] text-[#20211f]" : "text-[#3c3e3a] hover:bg-[#f4f3ee]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* From 768px up the same sections sit beside the preview instead of over it. */}
        {isDesktop && sectionMeta ? (
          <aside className="min-w-0 rounded-2xl border border-[#e6e4dc] bg-white p-5">
            <h2 className="mb-3 text-base font-black text-[#20211f]">{sectionMeta.title}</h2>
            {renderSection(sectionMeta.key)}
          </aside>
        ) : null}
      </div>

      <BottomSheet
        open={!isDesktop && sectionMeta !== null}
        title={sectionMeta?.title ?? ""}
        onClose={closeSection}
      >
        {sectionMeta ? renderSection(sectionMeta.key) : null}
      </BottomSheet>

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
