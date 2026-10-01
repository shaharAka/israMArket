"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CardCanvas,
  CardStage,
  CARD_RATIOS,
  cardSize,
  postNeedsPhoto,
  type CardRatio,
} from "@/components/CardCanvas";
import { downloadCardPng } from "@/lib/cardExport";
import { COMPOSITION_LIBRARY, type CompositionKey } from "@/lib/dna/library";
import { offeredCompositions, resolveComposition, resolveDna } from "@/lib/dna/resolve";
import { useBrandDna } from "@/lib/dna/useBrandDna";
import { PublishPanel } from "@/components/PublishPanel";
import { BottomSheet, useIsDesktop } from "@/components/posts/BottomSheet";
import { InspirationLine } from "@/components/posts/InspirationLine";
import { ChannelIcon } from "@/components/posts/ChannelIcon";
import {
  LIFECYCLE_LABEL,
  isDone,
  lifecycleOf,
  nextPendingIndex,
  postDateLabel,
  postWeek,
  weekFocus,
} from "@/components/posts/postMeta";
import {
  CHANNEL_LABEL,
  channelOf,
  compareOf,
  formatCount,
  isOut,
  isPending,
  matchedByLabel,
  metricLabel,
  otherResults,
  ownerNeedsOf,
  resultValue,
  shortDate,
} from "@/lib/postLifecycle";
import {
  endpoints,
  isDemo,
  type Asset,
  type AssetSource,
  type AssetSuggestion,
  type Audience,
  type BrandLanguage,
  type PostChannel,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevron,
  IconCopy,
  IconEye,
  IconLink,
  IconPhotos,
  IconTrendDown,
  IconTrendUp,
  IconUsers,
} from "@/lib/icons";
import { toast } from "@/lib/ui";
import { EditorIcon } from "@/components/posts/EditorIcon";
import { PhotoPlaceholder } from "@/components/posts/PhotoPlaceholder";
import { productPaletteVariables, useDesignPalette } from "@/components/design/palette";
import editorStyles from "@/components/posts/editor.module.css";
import ui from "@/components/posts/chrome.module.css";

/**
 * One instruction, one new version (docs/posts-v2.md, Phase C): a few one-tap chips and the
 * owner's own words. The server writes with the plan, what worked and the facts the owner
 * confirmed, and never invents a price: "להוסיף מחיר" with no known price asks for it.
 */
const INSTRUCTION_CHIPS = ["קצר יותר", "להוסיף מחיר", "יותר חם", "עם שאלה ללקוחות"] as const;
const MAX_INSTRUCTION = 200;
/** The free-text field's own busy key, beside the chips' labels. */
const OWN_WORDS = "own-words";
const PRICE_WORDS = /מחיר|כמה עולה|₪|ש"ח|ש״ח|שקל/;

/**
 * The tools behind the panel's quiet links, each in the step it belongs to (posts-v2,
 * Revision 1): the words and their tone, the picture and its design, and publishing. On a
 * phone a step opens as a bottom sheet over the post; from 768px up it takes the side
 * panel's place. Either way the screen itself holds the post, one sentence of why, what we
 * need from the owner, and the one thing we are asking for.
 */
type Step = "text" | "photo" | "publish";

const IMAGE_SOURCE_LABELS: Record<string, string> = {
  real_photo: "תמונה אמיתית מהאתר שלכם",
  generated: "תמונה שנוצרה ב-AI",
  asset: "אחת מהתמונות שלכם",
  pending: "עוד אין תמונה. אפשר לבחור או להעלות צילום",
  none: "כרטיס של טקסט בלבד, בלי תמונה",
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
      <span className={`flex items-center justify-center bg-[var(--primary-soft)] text-[color:var(--ink-muted)] ${className}`}>
        <PhotoPlaceholder small />
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
        className={`bg-[var(--primary-soft)] object-cover ${className}`}
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
      className={`bg-[var(--primary-soft)] object-cover ${className}`}
    />
  );
}

function primaryOutletOf(post: RoadmapPost): string {
  return post.primary_outlet || "instagram";
}

function captionFor(post: RoadmapPost, channel: string) {
  const own = post.outlet_captions?.[channel as PostChannel];
  return own || post.caption;
}

/** The why sentence. A post written before `why_line` says it with the older fields. */
function whyOf(post: RoadmapPost): string {
  const line = (post.why_line || "").trim();
  if (line) return line;
  const goal = (post.goal_fit || "").trim();
  if (goal) return `בשביל ${goal.replace(/[.\s]+$/, "")}.`;
  return (post.why_now || "").trim();
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
  strategy,
  brandLanguage,
  initialIndex = 0,
  onStrategyUpdated,
  onNavigate,
  onClose,
}: {
  posts: RoadmapPost[];
  /** The month the posts belong to, for the week's focus when a post has no plan link. */
  strategy?: Pick<StrategyPayload, "roadmap" | "weekly_breakdown" | "brand_dna"> | null;
  brandLanguage?: BrandLanguage | null;
  initialIndex?: number;
  onStrategyUpdated?: (strategy: StrategyPayload) => void;
  /** Move the page to another post ("הבא בתור"). Without it the editor switches
   *  internally, the way it did when it had its own post picker. */
  onNavigate?: (index: number) => void;
  /** Back to the month's feed. */
  onClose?: () => void;
}) {
  const { palette } = useDesignPalette();
  // The business's Design DNA: every preview, thumbnail and export is drawn from it.
  // The month carries it (`serialize_strategy`); the shared store is the fallback, and is
  // what a save on the brand page updates.
  const stored = useBrandDna({ skip: Boolean(strategy?.brand_dna) });
  const brandDna = (stored.loaded ? stored.dna : null) ?? strategy?.brand_dna ?? null;
  const demo = useSyncExternalStore(subscribeClient, isDemo, serverSnapshot);
  const [posts, setPosts] = useState(initialPosts);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(initialPosts.length - 1, 0))
  );
  // Which step is open. `null` means the post and its panel: on a phone the sheet is closed,
  // on a desktop the side panel shows the why, the need, the one button and the results.
  const [active, setActive] = useState<Step | null>(null);
  // The publish step opens on the kit, or — when the post is out and its link is what is
  // missing — on the pasted link.
  const [publishFocus, setPublishFocus] = useState<"kit" | "link">("kit");
  const isDesktop = useIsDesktop();
  const closeSection = useCallback(() => setActive(null), []);
  // An unsaved edit of the caption; `null` when the box shows what is stored.
  const [captionDraft, setCaptionDraft] = useState<string | null>(null);
  const [savingCaption, setSavingCaption] = useState(false);
  // Which instruction is being written (a chip's label or OWN_WORDS), the owner's own words,
  // and the server's word when the post stayed as it was ("מה המחיר?").
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [instructionDraft, setInstructionDraft] = useState("");
  const [rewriteMessage, setRewriteMessage] = useState("");
  const instructionInput = useRef<HTMLInputElement>(null);
  const [approving, setApproving] = useState(false);
  const [imageBusy, setImageBusy] = useState<number | null>(null);
  const [imageError, setImageError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
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
  const imageLocked = imageBusy !== null || designerBusy || assetBusyId !== null || uploadingPhoto;

  const currentPost = posts[selectedIndex];

  if (!currentPost) {
    return (
      <div className={`${ui.card} mx-auto max-w-3xl px-6 py-14 text-center text-sm text-[color:var(--ink-muted)]`}>
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
  const resolvedDna = resolveDna(brandDna, brandLanguage);
  const activeComposition = resolveComposition(currentPost, resolvedDna);
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
    if (!currentPost.image_url && postNeedsPhoto(currentPost)) {
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
    setActive(null);
    setPublishFocus("kit");
    setCaptionDraft(null);
    setInstructionDraft("");
    setRewriteMessage("");
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

  async function uploadPhoto(file: File | undefined) {
    if (!file || imageLocked) return;
    if (!file.type.startsWith("image/")) { setPhotoUploadError("בחרו קובץ תמונה. סרטונים אפשר להוסיף דרך התמונות שלי."); return; }
    const postIndex = selectedIndex;
    setUploadingPhoto(true); setPhotoUploadError(""); setImageError("");
    try {
      const uploaded = await endpoints.uploadAsset(file);
      setAssets(prev => prev ? [...prev, uploaded.asset] : null);
      const result = await endpoints.attachPostAsset(postIndex, uploaded.asset.id);
      setPosts(result.strategy.roadmap.posts); onStrategyUpdated?.(result.strategy);
      setShowAssets(false); setSuggestions(null);
      toast("התמונה נוספה לפוסט. אפשר לבדוק אותה בתצוגה.");
    } catch (err) {
      setPhotoUploadError(err instanceof Error ? err.message : "לא הצלחנו להוסיף את התמונה. אם ההעלאה הסתיימה, אפשר לבחור אותה מהתמונות שלי.");
    } finally { setUploadingPhoto(false); if (photoInput.current) photoInput.current.value = ""; }
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

  /**
   * "פרסמתי": marks the post published. The link is optional — it adds Instagram's reach —
   * and the same call adds it later; WhatsApp taps are counted by the post's own code
   * either way. Only a link added after the fact has to be there to be saved.
   */
  async function markPublished() {
    const url = publishUrl.trim();
    const alreadyOut = Boolean(currentPost.published_url || currentPost.published_at);
    if (alreadyOut && !url) {
      toast("הדביקו את הקישור לפוסט");
      return;
    }
    if (url && !/^https?:\/\//i.test(url)) {
      toast("הקישור צריך להתחיל ב-https://");
      return;
    }
    setPublishing(true);
    try {
      const result = await endpoints.publishPost(selectedIndex, url);
      setPosts(result.strategy.roadmap.posts);
      onStrategyUpdated?.(result.strategy);
      // Back to the post, which now says "פורסם" and what it will be measured by.
      setActive(null);
      toast(
        alreadyOut
          ? "הקישור נשמר. נראה לפיו גם כמה ראו."
          : "סימנו שהפוסט פורסם. נמדוד אותו בעדכון הנתונים הבא."
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו לסמן שהפוסט פורסם");
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
      // The post stays on screen and its one button moves on to "לפרסם" (posts-v2,
      // Revision 1). The next post waiting is one tap away in the header ("הבא בתור").
      toast(
        updatedPosts.every(isDone) ? "הפוסט אושר. כל הפוסטים של החודש אושרו." : "הפוסט אושר.",
        "milestone"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "לא הצלחנו לאשר את הפוסט");
    } finally {
      setApproving(false);
    }
  }

  /** One instruction: a chip's words, or the owner's own (`key` says which is busy). */
  async function requestRewrite(instruction: string, key: string) {
    const text = instruction.replace(/\s+/g, " ").trim().slice(0, MAX_INSTRUCTION);
    if (!text || rewriting !== null) return;
    setRewriting(key);
    setRewriteMessage("");
    try {
      const result = await endpoints.rewritePost(selectedIndex, { instruction: text });
      applyStrategy(result.strategy);
      setCaptionDraft(null);
      if (result.changed) {
        // Show the new version: the side panel's text on a desktop, the preview on a phone.
        setActive(isDesktop ? "text" : null);
        setInstructionDraft("");
        toast("הכנו גרסה חדשה");
        return;
      }
      // The post stayed as it was, and the server said why. A missing price is one the
      // owner can type right here, so the field is ready for it.
      setRewriteMessage(result.message || "הפוסט נשאר כמו שהוא.");
      if (PRICE_WORDS.test(text) && !/\d/.test(text)) {
        setInstructionDraft("להוסיף מחיר ");
        window.requestAnimationFrame(() => instructionInput.current?.focus());
      }
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
        // Which of the DNA's compositions the post uses (docs/design-dna.md); the server
        // validates it and sets the crop from the format. `overlay_theme` is never sent:
        // the server keeps it only for older posts, and only when told explicitly.
        design: updated.design?.composition
          ? { composition: updated.design.composition, text_position: updated.design.text_position || "" }
          : undefined,
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

  /**
   * One of the DNA's compositions for this post. Saved like any other edit (no model call);
   * the text keeps its position when the new composition takes it, otherwise the server
   * uses that composition's default.
   */
  function chooseComposition(key: CompositionKey) {
    if (key === activeComposition) return;
    const position = currentPost.design?.text_position;
    const keeps = Boolean(position) && (COMPOSITION_LIBRARY[key].text_positions as string[]).includes(position as string);
    void updateDesignField({
      design: { composition: key, text_position: keeps ? position : "" },
      has_overlay: true,
    });
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
      toast(wasApproved ? "הנוסח נשמר. צריך לאשר את הפוסט שוב." : "הנוסח נשמר.", "save");
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

  // The one channel the plan chose. There is no channel switch: the plan already knows
  // where this post goes, and the same post elsewhere is a quiet option when publishing.
  const channel = channelOf(currentPost);
  const channelLabel = CHANNEL_LABEL[channel];
  const activeCaption = captionFor(currentPost, channel);
  const businessName = brandLanguage?.business_name || "העסק";
  const isPreparingImage = imageBusy === selectedIndex;
  const cardNeedsPhoto = postNeedsPhoto(currentPost);
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
  const primaryOutletLabel = CHANNEL_LABEL[primaryOutlet as PostChannel] || "";

  // Where the post stands, and what that asks of the owner.
  const stage = lifecycleOf(currentPost);
  const pending = isPending(stage);
  const out = isOut(stage);
  const needs = ownerNeedsOf(currentPost);
  // A photo need is what the one button asks for while the post waits. Once it is approved
  // the owner has decided, and the need is history.
  const photoNeeded = pending && needs.some((need) => need.kind === "photo");
  const showNeeds = pending && needs.length > 0;
  const why = whyOf(currentPost);
  const workedNote = (currentPost.informed_by_note || "").trim() || (currentPost.inspiration?.note || "").trim();
  const week = postWeek(currentPost);
  const focus = week ? weekFocus(week, currentPost, strategy) : "";
  // Out without its link: the link is an optional field on the panel, never the ask.
  const linkOptional = out && !currentPost.published_url && channel !== "whatsapp";
  const nextPending = nextPendingIndex(posts, selectedIndex);

  function openStep(step: Step, focusOn: "kit" | "link" = "kit") {
    setPublishFocus(focusOn);
    setActive(step);
  }

  function openLibrary() {
    setActive("photo");
    setShowAssets(true);
    void loadAssets();
  }

  // Visual Image Media Slot — the card itself renders inside CardStage.
  function renderMediaSlot() {
    const photoFree = !postNeedsPhoto(currentPost);
    if (!currentPost.image_url && !photoFree) {
      return (
        <div style={{ aspectRatio: `${previewSize.w} / ${previewSize.h}` }} className={editorStyles.placeholder}>
          <PhotoPlaceholder />
          <h3>{isPreparingImage || uploadingPhoto ? "מכינים את התמונה…" : "כאן נכנסת תמונה מהעסק"}</h3>
          <p>{isPreparingImage || uploadingPhoto ? "התצוגה תתעדכן כשהתמונה מוכנה." : "צילום ברור של המוצר, המקום או האנשים שלכם. עדיף באור טבעי, בלי כיתוב מעל."}</p>
          {imageError && <p role="alert">{imageError}</p>}
          <button type="button" disabled={imageLocked} onClick={openLibrary}>
            לבחור מהתמונות שלי
            <IconArrowLeft className="h-4 w-4" />
          </button>
        </div>
      );
    }

    return (
      <CardStage
        post={currentPost}
        brand={brandLanguage}
        dna={brandDna}
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
   * Sized to fit the screen, not the column: the width is whatever lets the whole card and
   * the panel under it, up to the one button, fit in one phone screen (`--reserve` is the
   * height of everything else, counted from what this post's panel actually shows). On a
   * desktop the panel sits beside the card, so only the header is held back.
   */
  function renderPreview() {
    const captionLine = (
      <button
        type="button"
        onClick={() => openStep("text")}
        aria-label="לקרוא ולשנות את הטקסט"
        className="block min-h-11 w-full px-3.5 py-2.5 text-right text-[13px] leading-5 text-[color:var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--soft)]"
      >
        <span className="line-clamp-1 md:line-clamp-2">
          <span className="ml-1.5 font-semibold text-[color:var(--ink)]">{businessName}</span>{" "}
          {previewCaption(activeCaption)}
        </span>
      </button>
    );
    // Measured at 390x844: 325px is the header, the caption line, the gaps and the tab bar;
    // the rest is the panel this post actually shows. After publishing the number leads, so
    // the card gives it room.
    const hasPrimary = pending || stage === "approved";
    const reservePhone =
      325 +
      (why ? 52 : 0) +
      (workedNote ? 48 : 0) +
      (showNeeds ? 56 + 28 * needs.length : 0) +
      (out ? (resultValue(currentPost) !== null ? 200 : 110) : 0) +
      (linkOptional ? 92 : 0) +
      (hasPrimary ? 72 : 0) +
      64;
    return (
      <div
        className="mx-auto [--reserve:var(--reserve-phone)] md:[--reserve:290px]"
        style={{
          ["--reserve-phone" as string]: `${reservePhone}px`,
          // The floor: a 4:5 card never under 176px wide, a 9:16 reel never under 164px.
          width: `min(100%, max(${previewSize.w / previewSize.h < 0.7 ? 164 : 176}px, calc((100dvh - var(--reserve)) * ${previewSize.w / previewSize.h})))`,
        }}
      >
        <div className="overflow-hidden rounded-[16px] bg-[var(--paper)] shadow-[var(--shadow-pop)]">
          {channel === "facebook" ? captionLine : null}
          {renderMediaSlot()}
          {channel !== "facebook" ? captionLine : null}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ *
   * The screen has at most one dark filled button, and it changes with *
   * the post's state. Everything else is a link, a quiet outline       *
   * button, or lives inside its step (UI-RULES rule 1 + 3).            *
   * ------------------------------------------------------------------ */

  /** The owner's own photographs, the AI generation paths and the source switch — all of
   *  them are the same question ("which picture?"), so they share one panel. */
  function renderImageTools() {
    return (
      <div>
        <p className="text-sm leading-6 text-[color:var(--ink-soft)]">
          {IMAGE_SOURCE_LABELS[imageSourceKey]}
          {currentAsset ? ` · ${currentAsset.description || "תמונה בלי תיאור"}` : ""}
        </p>

        {cardNeedsPhoto && <div className={editorStyles.photoGuide}>
          <h3 className={ui.groupTitle}>{currentPost.image_url ? "להחליף את התמונה" : "1. בוחרים תמונה מהעסק"}</h3>
          <p className={ui.help}>בחרו צילום של מה שהפוסט מדבר עליו. השאירו קצת מרווח סביב הנושא כדי שיתאים גם לחיתוך אנכי.</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" disabled={imageLocked} onClick={() => photoInput.current?.click()} className={ui.button}>
              <EditorIcon kind="photo" />
              {uploadingPhoto ? "מעלים ומוסיפים…" : "להעלות מהמכשיר"}
            </button>
            <button type="button" disabled={imageLocked} onClick={toggleAssetPicker} aria-expanded={showAssets} className={ui.button}>
              <IconPhotos />
              {showAssets ? "לסגור את התמונות שלי" : "לבחור מהתמונות שלי"}
            </button>
          </div>
          {photoUploadError && <p role="alert" className={`${ui.error} mt-3`}>{photoUploadError}</p>}
        </div>}
        <details className={editorStyles.photoOptions}>
          <summary className={`${ui.summary} text-sm font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]`}>
            <span className="flex-1">תמונה מהאתר או יצירה ב-AI</span>
            <IconChevron />
          </summary>
          <p className={`${ui.help} mt-1`}>תמונה מהעסק נותנת לפוסט אמינות. אפשר גם לקחת מהאתר או ליצור תמונה לפי העיצוב.</p>
          <div className="mt-1 flex flex-wrap gap-x-5">
            <button type="button" disabled={imageLocked} onClick={() => void chooseImageSource("real")} className={ui.link}>לקחת תמונה מהאתר</button>
            <button type="button" disabled={imageLocked} onClick={() => void chooseImageSource("ai")} className={ui.link}>לבחור יצירה ב-AI</button>
            <button type="button" disabled={imageLocked} onClick={() => void prepareImage(selectedIndex, true)} className={ui.link}>{isPreparingImage ? "יוצרים תמונה…" : "ליצור לפי העיצוב"}</button>
          </div>
        </details>

        {showAssets ? (
          <div className={`${ui.inset} mt-4 p-4`}>
            <div className="flex items-center justify-between gap-2">
              <p className={ui.groupTitle}>
                התמונות שלי{assets ? <span className="font-medium tabular-nums text-[color:var(--ink-muted)]">{` · ${assets.length}`}</span> : ""}
              </p>
              <span className="-my-2 flex items-center gap-4">
                <button
                  type="button"
                  disabled={assetsLoading || imageLocked}
                  onClick={() => void loadAssets()}
                  className={`${ui.link} ${ui.linkQuiet} text-[13px]`}
                >
                  לרענן
                </button>
                <Link href="/assets" className={`${ui.link} text-[13px]`}>
                  לכל התמונות
                </Link>
              </span>
            </div>

            {attachError ? <p className={`${ui.error} mt-3`}>{attachError}</p> : null}

            {!cardNeedsPhoto ? (
              <p className="mt-3 rounded-[12px] bg-[var(--paper)] px-3.5 py-2.5 text-[13px] leading-6 text-[color:var(--ink-soft)] shadow-[var(--shadow-card)]">
                הכרטיס הזה בנוי מטקסט בלבד, אז התמונה שתבחרו לא תופיע עליו. כדי שתופיע, בחרו
                עיצוב עם תמונה ב״לשנות עיצוב״.
              </p>
            ) : null}

            {assetsLoading && !assets ? (
              <p className={`${ui.help} mt-3`}>טוענים את התמונות…</p>
            ) : assetsError ? (
              <p className={`${ui.error} mt-3`}>{assetsError}</p>
            ) : libraryEmpty ? (
              <div className={`${ui.card} mt-3 px-4 py-6 text-center`}>
                <p className="text-sm font-semibold text-[color:var(--ink)]">עוד אין לכם כאן תמונות</p>
                <p className={`${ui.help} mx-auto mt-1 max-w-xs`}>
                  להוספת צילום לחצו על ״להעלות מהמכשיר״ למעלה. אפשר גם להוסיף סרטון או קישור
                  או תנו לנו לקרוא את האתר.
                </p>
                <Link href="/assets" className={`${ui.button} mt-4`}>
                  <EditorIcon kind="photo" />
                  להוסיף תמונות
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={suggesting || imageLocked}
                    onClick={() => void suggestAssetsForPost()}
                    className={`${ui.button} w-full`}
                  >
                    <EditorIcon kind="tone" />
                    {suggesting ? "מחפשים מה מתאים…" : "למצוא תמונה שמתאימה לפוסט"}
                  </button>

                  {suggesting ? (
                    <p className={`${ui.help} mt-2`}>
                      עוברים על התמונות שלכם ובודקים מה מתאים לנושא הפוסט. זה לוקח כמה שניות,
                      השאירו את החלון פתוח.
                    </p>
                  ) : null}

                  {!suggesting && suggestError ? (
                    <p className={`${ui.error} mt-2`}>{suggestError}</p>
                  ) : null}

                  {!suggesting && suggestions && !rankedSuggestions.length ? (
                    <p className={`${ui.help} mt-2`}>
                      לא מצאנו תמונה שמתאימה לפוסט הזה, ולא נציע אחת בכוח. אפשר לבחור בעצמכם
                      מהתמונות למטה.
                    </p>
                  ) : null}

                  {rankedSuggestions.length ? (
                    <>
                      <p className="mt-4 text-[13px] font-semibold text-[color:var(--ink-muted)]">
                        מה הכי מתאים, לפי הסדר:
                      </p>
                      <ul className="mt-2 space-y-2">
                        {rankedSuggestions.map(({ suggestion, asset }, rank) => (
                          <li key={asset.id}>
                            <button
                              type="button"
                              disabled={imageLocked}
                              onClick={() => void attachAsset(asset)}
                              className="flex w-full items-start gap-3 rounded-[12px] bg-[var(--paper)] p-2.5 text-right shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[0_0_0_2px_var(--primary)] disabled:opacity-50"
                            >
                              <AssetPickerThumb asset={asset} className="h-12 w-12 shrink-0 rounded-[10px]" />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start gap-2">
                                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[11px] font-bold tabular-nums text-[color:var(--primary)]">
                                    {rank + 1}
                                  </span>
                                  <span className="line-clamp-2 text-[13px] font-semibold leading-5 text-[color:var(--ink)]">
                                    {asset.description || "תמונה בלי תיאור"}
                                  </span>
                                </span>
                                <span className="mt-1 block text-[13px] leading-5 text-[color:var(--ink-soft)]">
                                  {suggestion.reason}
                                </span>
                                <span className="mt-1 block text-xs font-semibold text-[color:var(--primary)]">
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

                <p className="mt-5 text-[13px] font-semibold text-[color:var(--ink-muted)]">
                  כל התמונות שלכם. לחיצה מכניסה את התמונה לפוסט:
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(assets ?? []).map((asset) => {
                    const inPost = currentAssetId === asset.id;
                    return (
                      <li key={asset.id}>
                        <button
                          type="button"
                          disabled={imageLocked}
                          onClick={() => void attachAsset(asset)}
                          className={`flex w-full flex-col overflow-hidden rounded-[12px] bg-[var(--paper)] text-right transition-shadow duration-200 disabled:opacity-50 ${
                            inPost
                              ? "shadow-[0_0_0_2px_var(--primary)]"
                              : "shadow-[var(--shadow-card)] hover:shadow-[0_0_0_2px_var(--primary)]"
                          }`}
                        >
                          <AssetPickerThumb asset={asset} className="h-24 w-full" />
                          <span className="block w-full p-2.5">
                            <span className="line-clamp-2 block text-xs leading-5 text-[color:var(--ink)]">
                              {asset.description || "תמונה בלי תיאור"}
                            </span>
                            {asset.tags.length ? (
                              <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                {asset.tags.slice(0, 2).map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[11px] text-[color:var(--ink-muted)]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                            <span className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-[color:var(--ink-muted)]">
                              <span>
                                {ASSET_SOURCE_LABELS[asset.source]}
                                {asset.kind === "video" ? " · סרטון" : ""}
                              </span>
                              <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--primary)]">
                                {assetBusyId === asset.id ? (
                                  "מכניסים…"
                                ) : inPost ? (
                                  <>
                                    בפוסט הזה
                                    <IconCheck className="h-3 w-3" />
                                  </>
                                ) : (
                                  "לבחור"
                                )}
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

  /**
   * The design step: three compositions of the business's own DNA, each drawn by the real
   * renderer with this post's words and photo, then the card's shape, the free-text
   * instruction and the one manual switch. The old presets promised looks the renderer
   * could not draw; every thumbnail here is exactly what the post becomes.
   */
  function renderDesignerPanel() {
    const offered = offeredCompositions(resolvedDna, activeComposition);
    const thumbRatio = exportRatio === "auto" ? undefined : exportRatio;
    return (
      <div className="mt-2 space-y-6 pb-1">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[color:var(--ink-muted)]">
              {resolvedDna.isDefault ? "שלושה עיצובים לפוסט:" : "שלושה עיצובים בסגנון שלכם:"}
            </p>
            <Link href="/brand#style" className={`${ui.link} ${ui.linkQuiet} -my-2 text-[13px]`}>
              {resolvedDna.isDefault ? "לבחור סגנון לעסק" : "לשנות את הסגנון"}
            </Link>
          </div>
          <div role="radiogroup" aria-label="העיצוב של הפוסט" className={`${editorStyles.looks} mt-2.5`}>
            {offered.map((key) => {
              const on = key === activeComposition;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={imageLocked}
                  onClick={() => chooseComposition(key)}
                  className={editorStyles.look}
                >
                  <span className={editorStyles.lookThumb} aria-hidden>
                    <CardStage
                      post={{ ...currentPost, design: { ...currentPost.design, composition: key } }}
                      brand={brandLanguage}
                      dna={brandDna}
                      businessName={businessName}
                      rounded={false}
                      ratio={thumbRatio}
                      quietPlaceholder
                    />
                  </span>
                  <span className={editorStyles.lookLabel}>
                    {on ? <IconCheck className="h-3.5 w-3.5 shrink-0" /> : null}
                    {COMPOSITION_LIBRARY[key].label_he}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The card's shape. It changes the preview as well as the download, so it is a
            design choice, not a download setting. */}
        <div>
          <p className="text-[13px] font-semibold text-[color:var(--ink-muted)]">גודל הכרטיס:</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([{ key: "auto" as const, label: "אוטומטי" }, ...CARD_RATIOS]).map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={exportRatio === r.key}
                onClick={() => setExportRatio(r.key)}
                className={ui.option}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="custom-design-prompt"
            className="mb-2 block text-[13px] font-semibold text-[color:var(--ink-muted)]"
          >
            או תארו במילים שלכם:
          </label>
          <div className="flex gap-2">
            <input
              id="custom-design-prompt"
              value={customDesignPrompt}
              onChange={(e) => setCustomDesignPrompt(e.target.value)}
              placeholder="למשל: ידיים לשות בצק מקרוב, שולחן חג עמוס"
              disabled={imageLocked}
              className={`${ui.field} min-w-0 flex-1 text-sm`}
            />
            {/* Only meaningful once something was typed — otherwise it is a dark button
                that does nothing sitting in the middle of the screen. */}
            {customDesignDirty ? (
              <button
                type="button"
                disabled={imageLocked || designerBusy}
                onClick={() => void handleApplyDesignPreset("custom", false)}
                className={`${ui.button} ${ui.matchField} shrink-0`}
              >
                {designerBusy ? "מעצבים…" : "לעצב לפי זה"}
              </button>
            ) : null}
          </div>
        </div>

        {currentPost.creative_concept || currentPost.visual_style ? (
          <div className={`${ui.inset} px-4 py-3 text-[13px] leading-6 text-[color:var(--ink)]`}>
            {currentPost.creative_concept ? (
              <p>
                <span className="font-semibold">הרעיון: </span>
                {currentPost.creative_concept}
              </p>
            ) : null}
            {currentPost.visual_style ? (
              <p className="mt-1 text-[color:var(--ink-soft)]">
                <span className="font-semibold">הסגנון: </span>
                {currentPost.visual_style}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[color:var(--ink)]">כיתוב על התמונה</span>
          <button
            type="button"
            onClick={() => void updateDesignField({ has_overlay: !hasOverlay })}
            aria-pressed={hasOverlay}
            // Outlined even when on: a filled toggle here was a second dark button.
            className={ui.chip}
          >
            {hasOverlay ? "כן, עם כיתוב" : "לא, צילום נקי"}
          </button>
        </div>
      </div>
    );
  }

  const downloadDisabled = exporting || (!currentPost.image_url && postNeedsPhoto(currentPost));

  /* ------------------------------------------------------------------ *
   * The steps behind the quiet links. Each holds the tools that belong *
   * to it, with the same handlers and states as before: the words and  *
   * their tone, the picture and its design, and publishing.            *
   * ------------------------------------------------------------------ */

  async function copyCaption() {
    // WhatsApp gets the whole formatted message (bold title, caption, call to action and
    // link), which is what the WhatsApp mockup's copy button used to hand over.
    const text =
      channel === "whatsapp"
        ? `*${currentPost.title}*\n\n${activeCaption}\n\n${currentPost.cta || ""}\n${currentPost.tracking_url || ""}`.trim()
        : activeCaption;
    try {
      await navigator.clipboard.writeText(text);
      toast(`נוסח ה${channelLabel} הועתק.`, "copy");
    } catch {
      toast("לא הצלחנו להעתיק. אפשר לסמן את הנוסח ולהעתיק ידנית.");
    }
  }

  /** "שונה לפי: קצר יותר": the last one-instruction rewrite, until the text is saved or
   *  approved (the server clears it then). */
  function renderRewriteNote(className = "") {
    const label = (currentPost.rewrite_instruction || "").trim();
    if (!label) return null;
    return (
      <p className={`flex items-center gap-1.5 text-[13px] font-medium leading-5 text-[color:var(--ink-muted)] ${className}`}>
        <EditorIcon kind="text" className="h-4 w-4 shrink-0" />
        <span className="min-w-0">שונה לפי: {label}</span>
      </p>
    );
  }

  function renderTextStep() {
    // The server stores one editable caption per post: the primary outlet's, which is the
    // plan's channel. Should the two ever differ, the channel's text stays read-only here
    // rather than being saved over the wrong caption.
    const editable = channel === primaryOutlet;
    const draft = captionDraft ?? activeCaption;
    const dirty = captionDraft !== null && captionDraft !== activeCaption;
    return (
      <div className="divide-y divide-[var(--rule)]">
        <div className="pb-5">
          <div className="-mt-2 flex items-center justify-between gap-2">
            <label htmlFor="post-caption" className={ui.groupTitle}>
              הנוסח ל{channelLabel}
            </label>
            <button type="button" onClick={copyCaption} className={ui.link}>
              <IconCopy />
              להעתיק
            </button>
          </div>
          {renderRewriteNote("-mt-1 mb-1.5")}
          {editable ? (
            <textarea
              id="post-caption"
              value={draft}
              rows={5}
              disabled={savingCaption}
              onChange={(event) => setCaptionDraft(event.target.value)}
              className={`${ui.field} mt-1`}
            />
          ) : (
            <p id="post-caption" className={`${ui.inset} mt-1 whitespace-pre-line px-4 py-3 text-[15px] leading-7 text-[color:var(--ink)]`}>
              {activeCaption}
            </p>
          )}
          {dirty ? (
            <div className="mt-3 flex items-center gap-5">
              <button
                type="button"
                disabled={savingCaption}
                onClick={() => void saveCaption()}
                className={ui.button}
              >
                {savingCaption ? "שומרים…" : "לשמור את הנוסח"}
              </button>
              <button
                type="button"
                disabled={savingCaption}
                onClick={() => setCaptionDraft(null)}
                className={`${ui.link} ${ui.linkQuiet}`}
              >
                לבטל
              </button>
            </div>
          ) : null}
          {!editable && primaryOutletLabel ? (
            <p className={`${ui.help} mt-2`}>אפשר לערוך רק את הנוסח ל{primaryOutletLabel}.</p>
          ) : null}
        </div>

        {currentPost.cta ? (
          <p className="py-4 text-[15px] font-semibold leading-6 text-[color:var(--ink)]">{currentPost.cta}</p>
        ) : null}

        {/* The words drawn on the card itself — the one place the headline lives. */}
        {hasOverlay ? (
          <div className="space-y-4 py-5">
            <div>
              <label htmlFor="post-overlay-headline" className={`${ui.groupTitle} mb-2 block`}>
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
                className={ui.field}
                placeholder="2–5 מילים"
              />
            </div>
            <div>
              <label htmlFor="post-overlay-badge" className={`${ui.groupTitle} mb-2 block`}>
                תגית
              </label>
              <input
                id="post-overlay-badge"
                value={overlayBadge}
                onChange={(e) => void updateDesignField({ overlay_badge: e.target.value })}
                className={ui.field}
                placeholder="למשל: מיוחד לחג / רק בשישי"
              />
            </div>
          </div>
        ) : null}

        {/* One instruction, one new version: quiet chips, or the owner's own words. It is
            written with the plan and what already worked, and keeps what they confirmed. */}
        <div className="py-5">
          <p id="post-rewrite-title" className={ui.groupTitle}>
            לנסח מחדש
          </p>
          <div role="group" aria-labelledby="post-rewrite-title" className="mt-3 flex flex-wrap gap-2">
            {INSTRUCTION_CHIPS.map((label) => (
              <button
                key={label}
                type="button"
                disabled={rewriting !== null}
                aria-busy={rewriting === label}
                onClick={() => void requestRewrite(label, label)}
                className={ui.chip}
              >
                {rewriting === label ? "כותבים…" : label}
              </button>
            ))}
          </div>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void requestRewrite(instructionDraft, OWN_WORDS);
            }}
          >
            <label htmlFor="post-instruction" className={`${ui.help} block`}>
              או במילים שלכם
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="post-instruction"
                ref={instructionInput}
                value={instructionDraft}
                maxLength={MAX_INSTRUCTION}
                disabled={rewriting !== null}
                onChange={(event) => setInstructionDraft(event.target.value)}
                placeholder="למשל: להזכיר שפתוחים גם בשבת"
                className={`${ui.field} min-w-0 flex-1 text-sm`}
              />
              <button
                type="submit"
                disabled={rewriting !== null || !instructionDraft.trim()}
                aria-busy={rewriting === OWN_WORDS}
                className={`${ui.button} ${ui.matchField} shrink-0`}
              >
                {rewriting === OWN_WORDS ? "כותבים…" : "לשנות"}
              </button>
            </div>
            {instructionDraft.length > MAX_INSTRUCTION - 40 ? (
              <p className={`${ui.help} mt-1.5`}>נשארו {MAX_INSTRUCTION - instructionDraft.length} תווים</p>
            ) : null}
          </form>
          {rewriteMessage ? (
            <p role="status" className="mt-3 flex items-start gap-2 text-[13px] leading-6 text-[color:var(--ink)]">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sun)]" />
              {rewriteMessage}
            </p>
          ) : null}
        </div>

        <div className="pt-5">{renderAudience()}</div>
      </div>
    );
  }

  function renderPhotoStep() {
    return (
      <div>
        {renderImageTools()}
        <div className="mt-4 border-t border-[var(--rule)] pt-2">
          <button
            type="button"
            aria-expanded={showDesigner}
            disabled={imageLocked}
            onClick={() => setShowDesigner((open) => !open)}
            className="group flex min-h-12 w-full items-center justify-between gap-3 text-right text-[15px] font-semibold text-[color:var(--ink)] disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <EditorIcon kind="paper" className="h-5 w-5 text-[color:var(--ink-muted)]" />
              לשנות עיצוב
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ink-muted)] transition-colors group-hover:text-[color:var(--ink)]">
              {showDesigner ? "לסגור" : "לפתוח"}
              <IconChevron className={`h-4 w-4 transition-transform duration-200 ${showDesigner ? "rotate-90" : "-rotate-90"}`} />
            </span>
          </button>
          {showDesigner ? renderDesignerPanel() : null}
        </div>
      </div>
    );
  }

  /** Who the post is for — the plan wrote it; the owner can point it elsewhere. */
  function renderAudience() {
    return (
      <div>
        <div className="-mt-2 flex items-center justify-between gap-2">
          <label htmlFor="post-audience-select" className={`${ui.groupTitle} inline-flex items-center gap-2`}>
            <IconUsers className="h-[18px] w-[18px] text-[color:var(--ink-muted)]" />
            למי הפוסט
          </label>
          <Link href="/decisions#audiences" className={`${ui.link} ${ui.linkQuiet} text-[13px]`}>
            לכל הקהלים
          </Link>
        </div>
        {/* A load in flight, a failed read and "no audiences yet" are all things the owner
            has to know without asking. */}
        {audiencesLoading ? (
          <p className={ui.help}>טוענים את הקהלים…</p>
        ) : audiencesError ? (
          <p className={ui.error}>{audiencesError}</p>
        ) : !audiences.length ? (
          <p className={ui.help}>
            עוד לא הגדרתם קהלים, אז אי אפשר לבחור למי הפוסט פונה.
          </p>
        ) : (
          <>
            <span className={ui.select}>
              <select
                id="post-audience-select"
                value={currentAudienceId === null ? "" : String(currentAudienceId)}
                // An image operation rewrites the same post on the server; the audience write
                // waits rather than racing it.
                disabled={imageLocked || audienceBusy}
                onChange={(event) =>
                  void changeAudience(event.target.value === "" ? null : Number(event.target.value))
                }
                className={`${ui.field} text-sm`}
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
              <IconChevron />
            </span>
            {audienceBusy ? <p className={`${ui.help} mt-1.5`}>שומרים…</p> : null}
          </>
        )}
      </div>
    );
  }

  function renderPublishStep() {
    return (
      <PublishPanel
        key={`${selectedIndex}-${publishFocus}`}
        post={currentPost}
        postIndex={selectedIndex}
        channel={channel}
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
        linkFirst={publishFocus === "link"}
      />
    );
  }

  function renderStep(step: Step) {
    if (step === "text") return renderTextStep();
    if (step === "photo") return renderPhotoStep();
    return renderPublishStep();
  }

  function stepTitle(step: Step) {
    if (step === "text") return "לשנות את הטקסט";
    if (step === "photo") return cardNeedsPhoto ? (currentPost.image_url ? "להחליף תמונה" : "לבחור תמונה") : "לשנות עיצוב";
    return publishFocus === "link" ? "הקישור לפוסט" : `לפרסם ב${channelLabel}`;
  }

  /* ------------------------------------------------------------------ *
   * The panel: why, what we need, the one button, and what happened.   *
   * ------------------------------------------------------------------ */

  const primaryClass =
    "drawn-button inline-flex min-h-13 w-full items-center justify-center gap-2.5 bg-[var(--primary)] px-6 text-base text-white enabled:hover:bg-[var(--primary-dark)]";

  /** THE one dark button, by state: להעלות תמונה → לאשר → לפרסם. "פרסמתי" is the publish
   *  step's own action; after it nothing more is asked. */
  function renderPrimary() {
    if (photoNeeded) {
      return (
        <button type="button" disabled={imageLocked} onClick={() => photoInput.current?.click()} className={primaryClass}>
          <EditorIcon kind="photo" className="h-5 w-5" />
          {uploadingPhoto ? "מעלים את התמונה…" : "להעלות תמונה"}
        </button>
      );
    }
    if (pending) {
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
          {approving ? "מאשרים…" : "לאשר"}
        </button>
      );
    }
    if (stage === "approved") {
      return (
        <button type="button" onClick={() => openStep("publish")} className={primaryClass}>
          {/* Mirrored: in RTL, "forward" flies left. */}
          <EditorIcon kind="publish" className="h-5 w-5 -scale-x-100" />
          לפרסם
        </button>
      );
    }
    // Out: nothing more is asked. The link, when it is missing, is an optional field.
    return null;
  }

  /** The optional link for a post marked "פרסמתי" without one: what it adds, and a field. */
  function renderLinkField() {
    return (
      <div className="mt-5">
        <label htmlFor="post-link-later" className={`${ui.help} block`}>
          להדביק קישור לפוסט, כדי לראות גם כמה ראו
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="post-link-later"
            value={publishUrl}
            onChange={(event) => setPublishUrl(event.target.value)}
            placeholder="https://..."
            dir="ltr"
            className={`${ui.field} min-w-0 flex-1 text-left text-sm`}
          />
          <button
            type="button"
            disabled={publishing || !publishUrl.trim()}
            onClick={() => void markPublished()}
            className={`${ui.button} ${ui.matchField} shrink-0`}
          >
            {publishing ? "שומרים…" : "לשמור"}
          </button>
        </div>
      </div>
    );
  }

  type Quiet = { key: string; label: string; icon: React.ReactNode; onClick?: () => void; href?: string; disabled?: boolean };

  /** The quiet actions beside the button: never more than three, and only the ones that
   *  mean something in this state. */
  function quietActions(): Quiet[] {
    const icon = "h-[18px] w-[18px]";
    const download: Quiet = {
      key: "download",
      label: exporting ? "מורידים…" : "להוריד",
      icon: <EditorIcon kind="download" className={icon} />,
      onClick: () => void handleExportCard(),
      disabled: downloadDisabled,
    };
    const text: Quiet = {
      key: "text",
      label: "לשנות את הטקסט",
      icon: <EditorIcon kind="text" className={icon} />,
      onClick: () => openStep("text"),
    };
    if (out) {
      return [
        ...(currentPost.published_url
          ? [{ key: "view", label: "לראות את הפוסט", icon: <IconEye className={icon} />, href: currentPost.published_url }]
          : []),
        download,
        ...(currentPost.published_url
          ? [{ key: "link", label: "לעדכן את הקישור", icon: <IconLink className={icon} />, onClick: () => openStep("publish", "link") }]
          : []),
      ];
    }
    if (photoNeeded) {
      return [
        { key: "library", label: "לבחור מהתמונות שלי", icon: <IconPhotos className={icon} />, onClick: openLibrary, disabled: imageLocked },
        text,
        // The plan asked for the owner's own photo, but the post already has a picture: the
        // owner may decide it is good enough. Never a dead end.
        ...(currentPost.image_url || !cardNeedsPhoto
          ? [
              {
                key: "approve",
                label: approving ? "מאשרים…" : "לאשר עם התמונה הזו",
                icon: <IconCheck className={icon} />,
                onClick: () => void approveCurrentPost(),
                disabled: approving || imageLocked,
              },
            ]
          : []),
      ];
    }
    return [
      text,
      {
        key: "photo",
        label: cardNeedsPhoto ? (currentPost.image_url ? "להחליף תמונה" : "לבחור תמונה") : "לשנות עיצוב",
        icon: <EditorIcon kind="photo" className={icon} />,
        onClick: () => openStep("photo"),
      },
      download,
    ];
  }

  function renderQuiet(centered: boolean) {
    const actions = quietActions();
    if (!actions.length) return null;
    // A phone gets one row of icons over short labels (three always fit at 390px); from
    // 768px up they are plain text actions in a line.
    const cls =
      "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[12px] px-1 text-center text-[13px] font-semibold leading-4 text-[color:var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--soft)] hover:text-[color:var(--ink)] active:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-45 md:min-h-11 md:flex-row md:gap-1.5 md:rounded-none md:px-0 md:text-[14px] md:leading-5 md:hover:bg-transparent md:hover:underline md:underline-offset-[5px] md:active:bg-transparent";
    return (
      <div
        role="toolbar"
        aria-label="עוד פעולות על הפוסט"
        className={`mt-2 grid gap-1 md:flex md:flex-wrap md:items-center md:gap-x-6 md:gap-y-0 ${
          actions.length === 3 ? "grid-cols-3" : actions.length === 2 ? "grid-cols-2" : "grid-cols-1"
        } ${centered ? "md:justify-center" : "md:justify-start"}`}
      >
        {actions.map((action) =>
          action.href ? (
            <a key={action.key} href={action.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {action.icon}
              {action.label}
            </a>
          ) : (
            <button key={action.key} type="button" disabled={action.disabled} onClick={action.onClick} className={cls}>
              {action.icon}
              {action.label}
            </button>
          )
        )}
      </div>
    );
  }

  /** What only the owner can add: a photo of something specific, or a fact to check. */
  function renderNeeds() {
    return (
      <section aria-labelledby="post-needs" className="mt-3 rounded-[14px] bg-[var(--soft)] px-4 py-3 md:mt-5 md:py-3.5">
        <h2 id="post-needs" className="text-[13px] font-semibold text-[color:var(--ink-muted)]">
          מה צריך מכם
        </h2>
        <ul className="mt-1 space-y-1 md:mt-1.5 md:space-y-1.5">
          {needs.map((need, index) => (
            <li key={`${need.kind}-${index}`} className="flex items-start gap-2.5 text-[15px] leading-6 text-[color:var(--ink)]">
              <EditorIcon
                kind={need.kind === "photo" ? "photo" : "badge"}
                className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ink-muted)]"
              />
              <span className="min-w-0">{need.text}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  /** After publishing: the one number (against a similar post when there is one) and one
   *  line of what we learn. Never a zero for a number nobody counted. */
  function renderResults() {
    const value = resultValue(currentPost);
    const label = metricLabel(currentPost);
    const compare = compareOf(currentPost);
    const others = otherResults(currentPost);
    const updated = shortDate(currentPost.results?.updated_at);
    const source = matchedByLabel(currentPost.results);
    const meta = [updated ? `עודכן ${updated}` : "", source].filter(Boolean).join(" · ");
    const learning = (currentPost.learning || "").trim();
    return (
      <section aria-labelledby="post-results" className="mt-6 border-t border-[var(--rule)] pt-5">
        <h2 id="post-results" className="text-[13px] font-semibold text-[color:var(--ink-muted)]">
          מה קרה
        </h2>
        {value !== null ? (
          <>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-[40px] font-bold leading-none tracking-tight tabular-nums text-[color:var(--ink)]">
                {formatCount(value)}
              </span>
              {label ? <span className="text-[15px] font-medium text-[color:var(--ink-soft)]">{label}</span> : null}
            </p>
            {compare ? (
              <p
                className={`mt-2 flex items-center gap-1.5 text-[13px] font-semibold ${
                  compare.direction === "up" ? "text-[color:var(--good)]" : "text-[color:var(--ink-soft)]"
                }`}
              >
                {compare.direction === "up" ? (
                  <IconTrendUp className="h-4 w-4 shrink-0" />
                ) : compare.direction === "down" ? (
                  <IconTrendDown className="h-4 w-4 shrink-0" />
                ) : null}
                {compare.text}
              </p>
            ) : null}
            {meta ? <p className="mt-1 text-[12px] text-[color:var(--ink-muted)]">{meta}</p> : null}
            {others.length ? (
              <details className="mt-1">
                <summary className={`${ui.summary} text-[13px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]`}>
                  עוד מספרים
                  <IconChevron />
                </summary>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pb-1">
                  {others.map((item) => (
                    <div key={item.label}>
                      <dt className="text-[12px] text-[color:var(--ink-muted)]">{item.label}</dt>
                      <dd className="text-[17px] font-bold tracking-tight tabular-nums text-[color:var(--ink)]">{formatCount(item.value)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-1 text-[17px] font-semibold text-[color:var(--ink)]">לא נמדד עדיין</p>
            <p className={`${ui.help} mt-0.5`}>
              {label ? `נספור ${label} בעדכון הנתונים הבא.` : "נמדוד אותו בעדכון הנתונים הבא."}
            </p>
          </>
        )}
        {learning ? (
          <div className="mt-5">
            <h3 className="text-[13px] font-semibold text-[color:var(--ink-muted)]">מה לומדים</h3>
            <p className="mt-1 text-[15px] leading-7 text-[color:var(--ink)]">{learning}</p>
          </div>
        ) : null}
      </section>
    );
  }

  function renderPanel() {
    const primary = renderPrimary();
    return (
      <div>
        {why ? (
          <p className="text-[16px] font-semibold leading-7 text-[color:var(--ink)] md:text-[17px]">{why}</p>
        ) : null}
        <InspirationLine inspiration={currentPost.inspiration} note={currentPost.informed_by_note} />
        {renderRewriteNote("mt-2")}
        {showNeeds ? renderNeeds() : null}
        {out ? renderResults() : null}
        {linkOptional ? renderLinkField() : null}
        {primary ? <div className={why || showNeeds || out ? "mt-5 md:mt-6" : ""}>{primary}</div> : null}
        <div className={primary ? "" : "mt-4"}>{renderQuiet(Boolean(primary))}</div>
      </div>
    );
  }

  return (
    <div className={`${editorStyles.editor} mx-auto max-w-5xl`}>
      <input ref={photoInput} type="file" accept="image/*" aria-label="להעלות תמונה לפוסט" hidden onChange={e => void uploadPhoto(e.target.files?.[0])} />

      {/* Where this post sits in the plan, its title and its state. */}
      <header className="mb-4 md:mb-7">
        <div className="flex items-center justify-between gap-3">
          <nav aria-label="איפה הפוסט בתוכנית" className="flex min-w-0 items-center text-[13px]">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className={`${ui.link} ${ui.linkQuiet} group -ms-1 shrink-0 px-1 text-[13px]`}
              >
                <IconArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                הפוסטים
              </button>
            ) : null}
            {week ? (
              <span className="min-w-0 truncate text-[color:var(--ink-muted)]">
                {onClose ? " · " : ""}שבוע {week}
                {focus ? ` · ${focus}` : ""}
              </span>
            ) : null}
          </nav>
          {nextPending >= 0 && nextPending !== selectedIndex ? (
            <button
              type="button"
              onClick={() => goTo(nextPending)}
              className={`${ui.link} ${ui.linkQuiet} group shrink-0 text-[13px]`}
            >
              הבא בתור
              <IconChevron className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>
          ) : null}
        </div>
        <h1 className="line-clamp-2 text-[24px] font-bold leading-8 tracking-tight text-[color:var(--ink)] md:text-[30px] md:leading-10">
          {currentPost.title}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 md:mt-2">
          <span className={ui.status} data-status={stage}>
            {LIFECYCLE_LABEL[stage]}
          </span>
          <span className={`${ui.meta} inline-flex items-center gap-1.5 font-normal`}>
            <ChannelIcon channel={channel} className="h-4 w-4" />
            {channelLabel}
            {postDateLabel(currentPost) ? ` · ${postDateLabel(currentPost)}` : ""}
          </span>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] md:items-start md:gap-10 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0">{renderPreview()}</div>

        {/* From 768px up the panel — or the step that replaced it — sits beside the post. */}
        {isDesktop ? (
          <aside className={`${ui.card} min-w-0 rounded-[18px] p-6 lg:p-8`}>
            {active ? (
              <>
                <button
                  type="button"
                  onClick={closeSection}
                  className={`${ui.link} ${ui.linkQuiet} group -ms-1 -mt-2 px-1 text-[13px]`}
                >
                  <IconArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  לחזור לפוסט
                </button>
                <h2 className="mt-1 text-lg font-bold tracking-tight text-[color:var(--ink)]">{stepTitle(active)}</h2>
                <div className="mt-5">{renderStep(active)}</div>
              </>
            ) : (
              renderPanel()
            )}
          </aside>
        ) : (
          <div className="mt-4">{renderPanel()}</div>
        )}
      </div>

      <BottomSheet
        style={demo ? productPaletteVariables(palette) : undefined}
        open={!isDesktop && active !== null}
        title={active ? stepTitle(active) : ""}
        onClose={closeSection}
      >
        {active ? renderStep(active) : null}
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
                dna={brandDna}
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
