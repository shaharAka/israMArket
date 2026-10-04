"use client";

/**
 * "הסגנון שלכם" — the business's Design DNA, shown the way a designer would present it to
 * the owner: the direction in words (the feeling first, then the place, the photos, the
 * text, and what it would never do), then three of its own posts drawn in it.
 *
 * The server's semantics (api/app/routers/brand_dna.py):
 *  - the first read builds the DNA, which can take seconds — the cards wait calmly;
 *  - "לנסות סגנון אחר" stores a new style at once (genes the owner set stay); a plan that
 *    does not allow it answers 402 `plan_required`, and the page points to the plan;
 *  - "לשנות פרטים" first offers choices in words (quieter or bolder, more photo or more
 *    text), each stored at once with `PUT /brand/dna {adjust}`; fonts and colours are a
 *    second layer under them, saved with "לשמור";
 *  - "לשמור" keeps the style (`keep`), with any font or colour the owner picked.
 * No gene name (a composition, a motif, a signature) is ever shown here. The font pickers
 * only render while open: each font preview downloads its family.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardStage } from "@/components/CardCanvas";
import { UIAction } from "@/components/design/Controls";
import { endpoints, isPlanRequired, type BrandLanguage, type Business, type RoadmapPost } from "@/lib/api";
import { fontStack } from "@/lib/dna/fonts";
import {
  COLOR_ROLES,
  COLOR_ROLE_LABEL,
  FONT_KEYS,
  FONT_LIBRARY,
  compositionDrawsPhoto,
  type BrandDna,
  type BrandDnaEdit,
  type ColorRole,
  type CompositionKey,
  type FontKey,
} from "@/lib/dna/library";
import { defaultDna, modesForSamples, resolveDna, type ResolvedDna } from "@/lib/dna/resolve";
import { setBrandDna } from "@/lib/dna/useBrandDna";
import styles from "./BrandStyle.module.css";

function short(text: string | undefined, max = 32): string {
  const t = (text || "").trim();
  return t && t.length <= max ? t : "";
}

/** A sample post from the business's own words, for a business with no posts yet. */
function samplePost(brand: BrandLanguage | null, name: string, i: number, photo?: string): RoadmapPost {
  const headlines = [
    short(brand?.voice_examples?.[0]) || short(brand?.messaging?.[0]) || `הכירו את ${name}`,
    short(brand?.messaging?.[1]) || short(brand?.offers_seen?.[0]) || "מה חדש אצלנו השבוע",
    short(brand?.voice_examples?.[1]) || short(brand?.messaging?.[2]) || "מחכים לכם",
  ];
  return {
    week: 1,
    date_hint: "",
    format: "image",
    title: headlines[i],
    angle: "",
    hook: "",
    caption: "",
    cta: "",
    calendar_tie: "",
    goal_fit: "",
    uid: `sample-${i}`,
    has_overlay: true,
    overlay_headline: headlines[i],
    image_url: photo,
  };
}

type Photo = { url: string; text: string };

/** Hebrew-aware words for matching a post to a photo: one-letter prefixes (ה ו ב ל מ ש כ) off. */
function words(text: string): Set<string> {
  return new Set(
    text
      .replace(/[^֐-׿a-zA-Z0-9]+/g, " ")
      .split(" ")
      .map((w) => w.replace(/^[והבלמשכ](?=[֐-׿]{3,})/, ""))
      .filter((w) => w.length > 1),
  );
}

/** How well a photo fits a post: headline words count double, caption words once. */
function fit(post: RoadmapPost, photo: Photo): number {
  const head = words([post.title, post.overlay_headline, post.overlay_text].filter(Boolean).join(" "));
  const body = words([post.angle, post.caption].filter(Boolean).join(" "));
  let score = 0;
  words(photo.text).forEach((w) => {
    score += head.has(w) ? 2 : body.has(w) ? 1 : 0;
  });
  return score;
}

function samplesOf(posts: RoadmapPost[], photos: Photo[], brand: BrandLanguage | null, name: string): RoadmapPost[] {
  const written = posts.filter((p) => (p.overlay_headline || p.overlay_text || "").trim());
  // Posts with a photo first: a sample says more with the business's own picture.
  const ordered = [...written.filter((p) => p.image_url), ...written.filter((p) => !p.image_url)].slice(0, 3);
  // Photos for the posts that have none: best fits first across all three, so one post's
  // loose match never takes the photo another post is about; the rest in library order.
  const chosen = new Map<number, string>();
  const used = new Set(ordered.map((p) => p.image_url).filter(Boolean) as string[]);
  const pairs = ordered.flatMap((post, i) => (post.image_url ? [] : photos.map((photo) => ({ i, photo, score: fit(post, photo) }))));
  pairs.sort((x, y) => y.score - x.score);
  for (const { i, photo, score } of pairs) {
    if (score > 0 && !chosen.has(i) && !used.has(photo.url)) {
      chosen.set(i, photo.url);
      used.add(photo.url);
    }
  }
  return [0, 1, 2].map((i) => {
    const post = ordered[i];
    if (post?.image_url) return post;
    let photo = chosen.get(i);
    if (!photo) {
      photo = (photos.find((p) => !used.has(p.url)) || photos[i % Math.max(photos.length, 1)])?.url;
      if (photo) used.add(photo);
    }
    // A photo from the library has not been measured for this post: no empty area to use.
    return post ? { ...post, image_url: photo, design: { ...post.design, safe_area: null, focal: null } } : samplePost(brand, name, i, photo);
  });
}

/**
 * The three samples in the DNA's own mix: which posts are photo-led, which carry a headline,
 * which are type — so "יותר תמונה" or "יותר טקסט" shows on the page at once.
 */
function inTheMix(samples: RoadmapPost[], dna: ResolvedDna): RoadmapPost[] {
  const modes = modesForSamples(dna, samples.length);
  const photoKeys = dna.compositions.filter((k) => compositionDrawsPhoto(k));
  let h = 0;
  return samples.map((post, i) => {
    const mode = modes[i];
    const composition: CompositionKey = mode === "type_led" ? "type_led" : mode === "photo_only" ? "full_bleed" : photoKeys[h++ % Math.max(1, photoKeys.length)] ?? "full_bleed";
    return { ...post, has_overlay: true, design: { ...post.design, composition, text_mode: mode } };
  });
}

type Edits = Pick<BrandDnaEdit, "type" | "colors">;

function applyEdits(dna: BrandDna, edits: Edits): BrandDna {
  return { ...dna, type: { ...dna.type, ...edits.type }, colors: { ...dna.colors, ...edits.colors } };
}

const hasEdits = (e: Edits) => Boolean(e.type || (e.colors && Object.keys(e.colors).length));

type Adjust = NonNullable<BrandDnaEdit["adjust"]>;
const ADJUSTMENTS: { label: string; group: string; adjust: Adjust; key: string; done: string }[] = [
  { key: "quieter", group: "tone", label: "יותר שקט", adjust: { tone: "quieter" }, done: "הסגנון שקט יותר עכשיו." },
  { key: "bolder", group: "tone", label: "יותר נועז", adjust: { tone: "bolder" }, done: "הסגנון נועז יותר עכשיו." },
  { key: "more_photo", group: "text", label: "יותר תמונה", adjust: { text: "more_photo" }, done: "יותר פוסטים יהיו רק תמונה." },
  { key: "more_text", group: "text", label: "יותר טקסט", adjust: { text: "more_text" }, done: "יותר פוסטים יהיו עם כותרת." },
];

export function BrandStyle({ business, brand }: { business: Business; brand: BrandLanguage | null }) {
  const [dna, setDna] = useState<BrandDna | null>(null);
  const [dnaLoaded, setDnaLoaded] = useState(false);
  const [posts, setPosts] = useState<RoadmapPost[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [edits, setEdits] = useState<Edits>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [planNeeded, setPlanNeeded] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fontsOpen, setFontsOpen] = useState(false);

  // The DNA and the sample material load apart: the first DNA read can take seconds.
  useEffect(() => {
    let active = true;
    endpoints
      .brandDna()
      .then((res) => {
        if (active) setDna(res.brand_dna ?? null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הסגנון. נסו שוב.");
      })
      .finally(() => {
        if (active) setDnaLoaded(true);
      });
    Promise.allSettled([endpoints.strategy(), endpoints.assets()]).then(([strategy, assets]) => {
      if (!active) return;
      setPosts(strategy.status === "fulfilled" ? strategy.value.roadmap?.posts ?? [] : []);
      setPhotos(
        assets.status === "fulfilled"
          ? assets.value.assets.filter((a) => a.kind === "image" && a.url).map((a) => ({ url: a.url, text: [a.description, ...(a.tags || [])].join(" ") }))
          : [],
      );
    });
    return () => {
      active = false;
    };
  }, [business.id]);

  // A business without a DNA (an older server) sees its posts in the neutral default.
  const base: BrandDna = dna ?? defaultDna(brand);
  const shown = dna || hasEdits(edits) ? applyEdits(base, edits) : null;
  const resolved = resolveDna(shown, brand);
  const samples = useMemo(() => samplesOf(posts, photos, brand, business.name), [posts, photos, brand, business.name]);
  const inMix = inTheMix(samples, resolved);
  const kept = Boolean(dna?.locked?.includes("all"));
  const dirty = hasEdits(edits);
  const d = resolved.direction;

  function edit(next: Edits) {
    setEdits(next);
    setNote("");
    setError("");
  }

  function failed(err: unknown, fallback: string) {
    if (isPlanRequired(err)) setPlanNeeded(err.message && !/^Payment Required$/i.test(err.message) ? err.message : "כדי לנסות סגנון אחר צריך מנוי פעיל.");
    else setError(err instanceof Error ? err.message : fallback);
  }

  async function regenerate() {
    if (busy) return;
    setBusy("regen");
    setError("");
    setNote("");
    setPlanNeeded("");
    try {
      const res = await endpoints.regenerateBrandDna();
      setDna(res.brand_dna);
      setEdits({});
      setBrandDna(res.brand_dna);
    } catch (err) {
      failed(err, "לא הצלחנו להציע סגנון אחר. נסו שוב.");
    } finally {
      setBusy(null);
    }
  }

  async function adjust(a: (typeof ADJUSTMENTS)[number]) {
    if (busy) return;
    setBusy(a.key);
    setError("");
    setNote("");
    setPlanNeeded("");
    try {
      const res = await endpoints.editBrandDna({ adjust: a.adjust });
      setDna(res.brand_dna);
      setBrandDna(res.brand_dna);
      setNote(a.done);
    } catch (err) {
      failed(err, "לא הצלחנו לשנות את הסגנון. נסו שוב.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (busy) return;
    setBusy("save");
    setError("");
    try {
      const res = await endpoints.editBrandDna({ ...edits, keep: true });
      setDna(res.brand_dna);
      setEdits({});
      setBrandDna(res.brand_dna);
      setNote("הסגנון נשמר. כל הפוסטים שלכם יעוצבו לפיו.");
    } catch (err) {
      failed(err, "לא הצלחנו לשמור את הסגנון. השינויים עדיין כאן.");
    } finally {
      setBusy(null);
    }
  }

  // A new display face gets its strong weight; a text face its regular one.
  const setType = (role: "display" | "text", key: FontKey) => {
    const weights = FONT_LIBRARY[key].weights;
    const next =
      role === "display"
        ? { display: key, display_weight: weights.includes(700) ? 700 : Math.max(...weights) }
        : { text: key, text_weight: weights.includes(400) ? 400 : weights[0] };
    edit({ ...edits, type: { ...edits.type, ...next } });
  };
  const setColor = (role: ColorRole, hex: string) => edit({ ...edits, colors: { ...edits.colors, [role]: hex } });
  const colorOf = (role: ColorRole) =>
    (shown?.colors as Record<string, string | undefined> | undefined)?.[role] || resolved.colors[role === "accent_2" ? "accent2" : role === "on_photo" ? "onPhoto" : role];

  const building = !dnaLoaded;
  const brief = [
    { label: "המקום", text: d.world },
    { label: "התמונות", text: d.photo },
    { label: "הטקסט", text: d.text },
    { label: "מה לא נעשה", text: d.never.join(" · ") },
  ].filter((row) => row.text);
  return (
    <section id="style" className={styles.card} aria-labelledby="brand-style" aria-busy={building || undefined}>
      <div className={styles.head}>
        <h2 id="brand-style">הסגנון שלכם</h2>
        {building ? (
          <p className={styles.line} role="status">
            מעצבים לכם סגנון משלכם, לפי האתר, הלוגו והתמונות. זה לוקח כמה שניות.
          </p>
        ) : shown && d.feel ? (
          <p className={styles.lead}>{d.feel}</p>
        ) : !shown ? (
          <p className={styles.line}>עוד אין לעסק סגנון משלו, אז הפוסטים מעוצבים בצבעים שלכם בלבד.</p>
        ) : null}
      </div>

      {!building && shown && brief.length ? (
        <dl className={styles.brief}>
          {brief.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={styles.samples} aria-label="שלושה פוסטים בסגנון שלכם" role="list">
        {inMix.map((post, i) => (
          <div key={`${i}-${post.design?.text_mode}-${post.design?.composition}`} role="listitem" className={styles.sample}>
            {building ? (
              <div className={styles.skeleton} aria-hidden />
            ) : (
              <CardStage post={post} brand={brand} dna={shown} businessName={brand?.business_name || business.name} rounded={false} ratio="4:5" quietPlaceholder />
            )}
          </div>
        ))}
      </div>

      {/* While the first style is being built there is nothing to act on yet. */}
      <div className={styles.actions} hidden={building}>
        {dnaLoaded && (!kept || dirty) ? (
          <UIAction onClick={() => void save()} busy={busy === "save"} busyLabel="שומרים…" disabled={Boolean(busy) && busy !== "save"}>
            לשמור
          </UIAction>
        ) : null}
        <UIAction variant="secondary" onClick={() => void regenerate()} busy={busy === "regen"} busyLabel="מחפשים סגנון אחר…" disabled={building || (Boolean(busy) && busy !== "regen")}>
          {dna ? "לנסות סגנון אחר" : "ליצור סגנון לעסק"}
        </UIAction>
        {dirty ? (
          <UIAction variant="text" disabled={Boolean(busy)} onClick={() => edit({})}>
            לבטל את השינויים
          </UIAction>
        ) : kept && !note ? (
          <span className={styles.kept}>שמרתם את הסגנון הזה</span>
        ) : null}
      </div>
      {planNeeded ? (
        <p role="status" className={styles.plan}>
          {planNeeded}{" "}
          <Link href="/billing" className={styles.planLink}>
            לבחור מנוי
          </Link>
        </p>
      ) : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {note ? <p role="status" className={styles.note}>{note}</p> : null}

      <details className={styles.details} onToggle={(e) => setDetailsOpen(e.currentTarget.open)} hidden={building}>
        <summary>לשנות פרטים</summary>
        {detailsOpen ? (
          <div className={styles.adjust}>
            {(["tone", "text"] as const).map((group) => (
              <div key={group} role="group" aria-label={group === "tone" ? "האופי" : "תמונה וטקסט"} className={styles.pair}>
                {ADJUSTMENTS.filter((a) => a.group === group).map((a) => (
                  <button key={a.key} type="button" className={styles.choice} disabled={Boolean(busy) || !dna} aria-busy={busy === a.key || undefined} onClick={() => void adjust(a)}>
                    {busy === a.key ? "משנים…" : a.label}
                  </button>
                ))}
              </div>
            ))}

            <details className={styles.more} onToggle={(e) => setFontsOpen(e.currentTarget.open)}>
              <summary>אותיות וצבעים</summary>
              {/* Rendered only while open: each font preview downloads its family. */}
              {fontsOpen ? (
                <div className={styles.pickers}>
                  <fieldset>
                    <legend>אותיות לכותרות</legend>
                    <div className={styles.fonts}>
                      {FONT_KEYS.map((key) => (
                        <button key={key} type="button" aria-pressed={resolved.display.key === key} onClick={() => setType("display", key)} className={styles.font}>
                          <span style={{ fontFamily: fontStack(key), fontWeight: FONT_LIBRARY[key].weights.includes(700) ? 700 : FONT_LIBRARY[key].weights[0] }}>אבג</span>
                          <small>{FONT_LIBRARY[key].label_he}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>אותיות לטקסט</legend>
                    <div className={styles.fonts}>
                      {FONT_KEYS.filter((key) => FONT_LIBRARY[key].roles.includes("text")).map((key) => (
                        <button key={key} type="button" aria-pressed={resolved.text.key === key} onClick={() => setType("text", key)} className={styles.font}>
                          <span style={{ fontFamily: fontStack(key), fontWeight: 400 }}>אבג</span>
                          <small>{FONT_LIBRARY[key].label_he}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>צבעים</legend>
                    <div className={styles.colors}>
                      {COLOR_ROLES.map((role) => (
                        <label key={role}>
                          <input type="color" aria-label={`לשנות את ${COLOR_ROLE_LABEL[role]}`} value={colorOf(role)} onChange={(e) => setColor(role, e.target.value)} />
                          <span>{COLOR_ROLE_LABEL[role]}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              ) : null}
            </details>
          </div>
        ) : null}
      </details>
    </section>
  );
}
