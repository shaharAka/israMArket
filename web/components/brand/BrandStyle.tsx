"use client";

/**
 * "הסגנון שלכם" — the business's Design DNA, shown the only way an owner can judge it: as
 * three of its own posts (its real words and photos when it has them), in three of the
 * DNA's compositions, with the one line of why.
 *
 * The server's semantics (api/app/routers/brand_dna.py):
 *  - the first read builds the DNA, which can take seconds — the cards wait calmly;
 *  - "לנסות סגנון אחר" stores a new style at once (genes the owner set stay);
 *  - "לשמור" keeps the style (`keep`), together with any font, motif or colour the owner
 *    picked under "לשנות פרטים" — each of those is then locked against later changes.
 * The pickers only render while open: each font preview downloads its family.
 */

import { useEffect, useMemo, useState } from "react";
import { CardStage } from "@/components/CardCanvas";
import { UIAction } from "@/components/design/Controls";
import { endpoints, type BrandLanguage, type Business, type RoadmapPost } from "@/lib/api";
import { fontStack } from "@/lib/dna/fonts";
import {
  COLOR_ROLES,
  COLOR_ROLE_LABEL,
  FONT_KEYS,
  FONT_LIBRARY,
  MOTIF_KEYS,
  MOTIF_LIBRARY,
  type BrandDna,
  type BrandDnaEdit,
  type ColorRole,
  type FontKey,
  type MotifKey,
} from "@/lib/dna/library";
import { defaultDna, resolveDna } from "@/lib/dna/resolve";
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
  const kickers = [short(brand?.offers_seen?.[0], 20), short(brand?.offers_seen?.[1], 20), ""];
  return {
    week: 1,
    date_hint: "",
    format: "image",
    title: headlines[i],
    angle: "",
    hook: "",
    caption: "",
    cta: ["לשלוח הודעה", "לבוא לבקר", "לקבוע"][i],
    calendar_tie: "",
    goal_fit: "",
    uid: `sample-${i}`,
    has_overlay: true,
    overlay_headline: headlines[i],
    overlay_badge: kickers[i],
    image_url: photo,
  };
}

function samplesOf(posts: RoadmapPost[], photos: string[], brand: BrandLanguage | null, name: string): RoadmapPost[] {
  const written = posts.filter((p) => (p.overlay_headline || p.overlay_text || "").trim() && p.has_overlay !== false);
  // Posts with a photo first: a sample says more with the business's own picture.
  const ordered = [...written.filter((p) => p.image_url), ...written.filter((p) => !p.image_url)];
  return [0, 1, 2].map((i) => {
    const photo = photos.length ? photos[i % photos.length] : undefined;
    const post = ordered[i];
    return post ? { ...post, image_url: post.image_url || photo } : samplePost(brand, name, i, photo);
  });
}

type Edits = Omit<BrandDnaEdit, "keep">;

function applyEdits(dna: BrandDna, edits: Edits): BrandDna {
  return {
    ...dna,
    type: { ...dna.type, ...edits.type },
    motif: { ...dna.motif, ...edits.motif },
    colors: { ...dna.colors, ...edits.colors },
  };
}

const hasEdits = (e: Edits) => Boolean(e.type || e.motif || (e.colors && Object.keys(e.colors).length));

export function BrandStyle({ business, brand }: { business: Business; brand: BrandLanguage | null }) {
  const [dna, setDna] = useState<BrandDna | null>(null);
  const [dnaLoaded, setDnaLoaded] = useState(false);
  const [posts, setPosts] = useState<RoadmapPost[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [edits, setEdits] = useState<Edits>({});
  const [busy, setBusy] = useState<"regen" | "save" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

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
      setPhotos(assets.status === "fulfilled" ? assets.value.assets.filter((a) => a.kind === "image" && a.url).map((a) => a.url) : []);
    });
    return () => {
      active = false;
    };
  }, [business.id]);

  const samples = useMemo(() => samplesOf(posts, photos, brand, business.name), [posts, photos, brand, business.name]);
  // A business without a DNA (an older server) sees its posts in the neutral default.
  const base: BrandDna = dna ?? defaultDna(brand);
  const shown = dna || hasEdits(edits) ? applyEdits(base, edits) : null;
  const resolved = resolveDna(shown, brand);
  const kept = Boolean(dna?.locked?.includes("all"));
  const dirty = hasEdits(edits);

  function edit(next: Edits) {
    setEdits(next);
    setNote("");
    setError("");
  }

  async function regenerate() {
    if (busy) return;
    setBusy("regen");
    setError("");
    setNote("");
    try {
      const res = await endpoints.regenerateBrandDna();
      setDna(res.brand_dna);
      setEdits({});
      setBrandDna(res.brand_dna);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להציע סגנון אחר. נסו שוב.");
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
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הסגנון. השינויים עדיין כאן.");
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
  const setMotif = (kind: MotifKey) => edit({ ...edits, motif: { ...edits.motif, kind } });
  const setColor = (role: ColorRole, hex: string) => edit({ ...edits, colors: { ...edits.colors, [role]: hex } });
  const colorOf = (role: ColorRole) =>
    (shown?.colors as Record<string, string | undefined> | undefined)?.[role] ||
    resolved.colors[role === "accent_2" ? "accent2" : role === "on_photo" ? "onPhoto" : role];

  const building = !dnaLoaded;
  return (
    <section id="style" className={styles.card} aria-labelledby="brand-style" aria-busy={building || undefined}>
      <div className={styles.head}>
        <h2 id="brand-style">הסגנון שלכם</h2>
        {building ? (
          <p className={styles.line} role="status">
            מעצבים לכם סגנון משלכם, לפי האתר, הלוגו והתמונות. זה לוקח כמה שניות.
          </p>
        ) : shown?.rationale_he ? (
          <p className={styles.line}>{shown.rationale_he}</p>
        ) : !shown ? (
          <p className={styles.line}>עוד אין לעסק סגנון משלו, אז הפוסטים מעוצבים בצבעים שלכם בלבד.</p>
        ) : null}
      </div>

      <div className={styles.samples} aria-label="שלושה פוסטים בסגנון שלכם" role="list">
        {samples.map((post, i) => {
          const composition = resolved.compositions[i % resolved.compositions.length];
          return (
            <div key={`${i}-${composition}`} role="listitem" className={styles.sample}>
              {building ? (
                <div className={styles.skeleton} aria-hidden />
              ) : (
                <CardStage
                  post={{ ...post, design: { composition } }}
                  brand={brand}
                  dna={shown}
                  businessName={brand?.business_name || business.name}
                  rounded={false}
                  ratio="4:5"
                  quietPlaceholder
                />
              )}
            </div>
          );
        })}
      </div>

      {/* While the first style is being built there is nothing to act on yet. */}
      <div className={styles.actions} hidden={building}>
        {dnaLoaded && (!kept || dirty) ? (
          <UIAction onClick={() => void save()} busy={busy === "save"} busyLabel="שומרים…" disabled={busy === "regen"}>
            לשמור
          </UIAction>
        ) : null}
        <UIAction variant="secondary" onClick={() => void regenerate()} busy={busy === "regen"} busyLabel="מחפשים סגנון אחר…" disabled={building || busy === "save"}>
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
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {note ? <p role="status" className={styles.note}>{note}</p> : null}

      <details className={styles.details} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
        <summary>לשנות פרטים</summary>
        {/* Rendered only while open: each font preview downloads its family. */}
        {detailsOpen ? (
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
              <legend>הקישוט החוזר</legend>
              <div className={styles.motifs}>
                {MOTIF_KEYS.map((key) => (
                  <button key={key} type="button" aria-pressed={resolved.motif.kind === key} onClick={() => setMotif(key)} className={styles.motif}>
                    {MOTIF_LIBRARY[key].label_he}
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
    </section>
  );
}
