"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  chosenDirectionOf,
  draftForApi,
  fetchSamplePosts,
  samplePostsBase,
  type PostPhotoChoice,
} from "@/lib/draft";
import { deletePending, getPending, keyFor, preparePhoto, putPending } from "@/lib/pendingUploads";
import { lookOf } from "./BusinessCard";
import { PostPhone, type PhotoState } from "./PostPhone";
import { WorkProgress, type RevealProps } from "./StepPlan";
import { StepShell } from "./ui";
import styles from "./start.module.css";

/**
 * "ככה זה ייראה": the 3 real week-1 posts, written for the strategy the owner just shaped,
 * drawn with the product's own card templates in their colours and logo, in a phone.
 *
 * Each post has a photo slot: the site's own photo when the scan found one, otherwise
 * what to shoot and three small buttons (upload, camera, "let the AI make it later").
 * A picked photo shows in the card at once, and waits in the browser until signup.
 */
export function StepPreview(props: RevealProps & { loggedIn: boolean; saving: boolean; saveError: string; onSave: () => void }) {
  const { flow, update, next, jump, loggedIn, saving, saveError, onSave } = props;
  const direction = chosenDirectionOf(flow);
  const strategy = flow.strategy ?? null;
  const base = samplePostsBase(flow);
  const posts = flow.samplePostsFor === base ? (flow.samplePosts ?? null) : null;
  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [announce, setAnnounce] = useState("");
  const [camera, setCamera] = useState(false);
  const [active, setActive] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const urlsRef = useRef(urls);
  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);

  const look = lookOf(flow);
  const palette = look.palette ?? (flow.plan?.brand?.palette?.length ? flow.plan.brand.palette : null);
  const loading = Boolean(direction && strategy) && !posts && !failed;

  useEffect(() => {
    if (!direction || !strategy || (flow.samplePostsFor === base && flow.samplePosts)) return;
    let live = true;
    fetchSamplePosts(draftForApi(flow), direction, strategy)
      .then((result) => {
        if (!live) return;
        setFailed(false);
        update((f) => ({ ...f, samplePosts: result.slice(0, 3), samplePostsFor: base }));
      })
      .catch((err: unknown) => {
        if (!live) return;
        setFailMessage(err instanceof ApiError && /[֐-׿]/.test(err.message) ? err.message : "");
        setFailed(true);
      });
    return () => {
      live = false;
    };
    // Once per strategy (and per retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, attempt]);

  // Photos picked earlier come back from IndexedDB after a refresh. A choice whose file
  // is gone (storage cleared) is dropped rather than shown as a broken slot.
  useEffect(() => {
    let live = true;
    const picks = Object.entries(flow.postPhotos ?? {}).filter(([, p]) => p.kind === "upload");
    Promise.all(
      picks.map(async ([index]) => {
        const item = await getPending(keyFor(Number(index)));
        return [Number(index), item] as const;
      }),
    ).then((found) => {
      if (!live) return;
      const next: Record<number, string> = {};
      const missing: number[] = [];
      for (const [index, item] of found) {
        if (item) next[index] = URL.createObjectURL(item.blob);
        else missing.push(index);
      }
      setUrls(next);
      if (missing.length) {
        update((f) => {
          const photos = { ...(f.postPhotos ?? {}) };
          missing.forEach((index) => delete photos[index]);
          return { ...f, postPhotos: photos };
        });
      }
    });
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const timer = window.setTimeout(() => setCamera(coarse), 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
      Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
    // On mount only: later picks manage their own URLs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which phone is in view on the swipe strip (phones only).
  useEffect(() => {
    const root = strip.current;
    if (!root || !posts) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index ?? 0));
        }
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [posts]);

  function setChoice(index: number, choice: PostPhotoChoice | null) {
    update((f) => {
      const photos = { ...(f.postPhotos ?? {}) };
      if (choice) photos[index] = choice;
      else delete photos[index];
      return { ...f, postPhotos: photos };
    });
  }

  function setUrl(index: number, url: string | null) {
    setUrls((current) => {
      const nextUrls = { ...current };
      if (current[index]) URL.revokeObjectURL(current[index]);
      if (url) nextUrls[index] = url;
      else delete nextUrls[index];
      return nextUrls;
    });
  }

  async function onFile(index: number, file: File) {
    setErrors((e) => ({ ...e, [index]: "" }));
    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      setErrors((e) => ({ ...e, [index]: prepared.error }));
      return;
    }
    await putPending({
      key: keyFor(index),
      postIndex: index,
      blob: prepared.blob,
      name: prepared.name,
      type: prepared.type,
    });
    setUrl(index, URL.createObjectURL(prepared.blob));
    setChoice(index, { kind: "upload", name: prepared.name });
    setAnnounce(`התמונה נוספה לפוסט ${index + 1}. היא תעלה ל״התמונות שלי״ אחרי ההרשמה.`);
  }

  async function onRemove(index: number) {
    await deletePending(keyFor(index));
    setUrl(index, null);
    setChoice(index, null);
    setAnnounce(`התמונה הוסרה מפוסט ${index + 1}.`);
  }

  function onAiLater(index: number, on: boolean) {
    setChoice(index, on ? { kind: "ai_later" } : null);
    setAnnounce(on ? `סימנו: ה-AI ייצור תמונה לפוסט ${index + 1} אחרי ההרשמה.` : "");
  }

  function photoFor(index: number): PhotoState {
    const pick = flow.postPhotos?.[index];
    if (pick?.kind === "upload") return { kind: "upload", url: urls[index] ?? null };
    if (pick?.kind === "ai_later") return { kind: "ai_later" };
    const site = posts?.[index]?.photo.site_url;
    return site ? { kind: "site", url: site } : { kind: "none" };
  }

  function scrollTo(index: number) {
    const child = strip.current?.children[index] as HTMLElement | undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    child?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest", inline: "center" });
  }

  const photoCount = Object.values(flow.postPhotos ?? {}).filter((p) => p.kind === "upload").length;

  if (!direction || !strategy) {
    return (
      <StepShell
        {...props}
        title="ככה זה ייראה"
        why="הפוסטים נכתבים מתוך האסטרטגיה. קודם נבנה אותה."
        primary="לבנות את האסטרטגיה"
        onPrimary={() => jump(direction ? "strategy" : "direction")}
      >
        {null}
      </StepShell>
    );
  }

  return (
    <StepShell
      {...props}
      title="ככה זה ייראה"
      why="3 הפוסטים של השבוע הראשון, בצבעים שלכם. הוסיפו תמונה אמיתית, או השאירו לנו."
      primary={
        loading
          ? "כותבים…"
          : failed && !posts
            ? "לנסות שוב"
            : saving
              ? "שומרים…"
              : loggedIn
                ? "לשמור ולהמשיך לתקציב"
                : "לשמור את מה שבנינו"
      }
      primaryDisabled={loading || saving}
      stickyAction
      onPrimary={() => {
        if (failed && !posts) {
          setFailed(false);
          setAttempt((n) => n + 1);
          return;
        }
        if (loggedIn) onSave();
        else next();
      }}
      skip={failed && !posts ? "להמשיך בלי זה ולשמור" : undefined}
      onSkip={failed && !posts ? () => jump("save") : undefined}
    >
      {loading ? (
        <WorkProgress
          title="כותבים את 3 הפוסטים הראשונים…"
          note="באותה דרך שנכתוב אותם אחרי ההרשמה."
          pace={3000}
          lines={["בוחרים פוסט לכל נושא", "כותבים כותרת וטקסט בסגנון שלכם", "מעצבים בצבעים של העסק"]}
        />
      ) : null}
      {failed && !posts ? (
        <div role="alert" className="rounded-xl border border-[#e2e0d8] bg-white p-4 text-sm leading-6 text-[#2b2d28]">
          <p className="font-bold text-[#191b18]">לא הצלחנו לכתוב את הפוסטים כרגע.</p>
          {failMessage ? <p>{failMessage}</p> : null}
          <p>האסטרטגיה שמורה. אפשר לנסות שוב, או לשמור ולראות את הפוסטים אחרי ההרשמה.</p>
        </div>
      ) : null}

      {posts ? (
        <>
          <div
            ref={strip}
            className={`-mx-4 flex gap-4 overflow-x-auto px-[9%] pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 ${styles.strip} ${styles.stagger}`}
          >
            {posts.map((post, index) => (
              <div key={`${post.title}-${index}`} data-index={index} className="w-[82%] max-w-[19rem] shrink-0 lg:w-auto lg:max-w-none">
                <PostPhone
                  post={post}
                  index={index}
                  total={posts.length}
                  businessName={flow.draft.business_name.trim()}
                  palette={palette}
                  logoUrl={look.logoUrl}
                  pillarTitle={strategy.pillars.find((p) => p.key === post.pillar_key)?.title}
                  photo={photoFor(index)}
                  camera={camera}
                  error={errors[index] ?? ""}
                  onFile={(file) => void onFile(index, file)}
                  onRemove={() => void onRemove(index)}
                  onAiLater={(on) => onAiLater(index, on)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1 lg:hidden">
            {posts.map((post, index) => (
              <button
                key={index}
                type="button"
                onClick={() => scrollTo(index)}
                aria-label={`לפוסט ${index + 1}: ${post.title}`}
                aria-current={active === index ? "true" : undefined}
                className="flex h-11 w-9 cursor-pointer items-center justify-center"
              >
                <span className={`block h-2 rounded-full transition-all motion-reduce:transition-none ${active === index ? "w-5 bg-[#191b18]" : "w-2 bg-[#c7c4b8]"}`} />
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-[#6b6e65]">
            {photoCount
              ? `${photoCount} ${photoCount === 1 ? "תמונה שלכם תעלה" : "תמונות שלכם יעלו"} ל״התמונות שלי״ אחרי ההרשמה.`
              : "התמונות נשמרות רק במכשיר הזה, עד שתפתחו חשבון."}
          </p>
        </>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {saveError ? (
        <p role="alert" className="text-sm font-bold text-[#9f4330]">
          {saveError}
        </p>
      ) : null}
    </StepShell>
  );
}
