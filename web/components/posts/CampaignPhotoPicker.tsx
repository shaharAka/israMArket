"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/components/language/LanguageProvider";
import { endpoints, type Asset, type StrategyPayload } from "@/lib/api";
import styles from "./campaign.module.css";

export function CampaignPhotoPicker({ index, uid, title, onSaved, onCancel, onBusy }: {
  index: number;
  uid: string;
  title: string;
  onSaved: (strategy: StrategyPayload) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useCopy();
  const [photos, setPhotos] = useState<Asset[] | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);

  async function load() {
    setError("");
    try {
      const { assets } = await endpoints.assets();
      setPhotos(assets.filter(asset => asset.kind === "image"));
    } catch {
      setError("לא הצלחנו לטעון את התמונות שלכם");
    }
  }
  useEffect(() => {
    let live = true;
    endpoints.assets().then(({ assets }) => {
      if (live) setPhotos(assets.filter(asset => asset.kind === "image"));
    }).catch(() => { if (live) setError("לא הצלחנו לטעון את התמונות שלכם"); });
    return () => { live = false; };
  }, []);
  async function upload(file: File | undefined) {
    if (!file || saving) return;
    setError("");
    onBusy(true);
    setSaving(true);
    try {
      const { asset } = await endpoints.uploadAsset(file);
      setPhotos(previous => [...(previous ?? []), asset]);
      setChoice(asset.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו להוסיף את התמונה");
    } finally {
      setSaving(false);
      onBusy(false);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  async function save() {
    if (!choice || saving) return;
    setError("");
    onBusy(true);
    setSaving(true);
    try {
      const { strategy } = await endpoints.attachPostAsset(index, choice, uid);
      onSaved(strategy);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו להכניס את התמונה לפוסט");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  return <section aria-label={t("לבחור תמונה שכבר יש לכם")}>
    <h3>{t("בחירת תמונה לפוסט")}</h3>
    <p dir="auto" className={styles.caption}>{title}</p>
    {error ? <p role="alert" className={styles.error}>{t(error)}</p> : null}
    {!photos ? error ? <button type="button" className={styles.textAction} onClick={() => void load()}>{t("לטעון שוב")}</button> :
      <p role="status">{t("טוענים את התמונות…")}</p> : !photos.length ? <p>{t("עוד אין לכם כאן תמונות")}</p> :
      <ul className={styles.libraryPhotos}>
        {photos.map(asset => <li key={asset.id}>
          <button type="button" disabled={saving} aria-pressed={choice === asset.id} onClick={() => setChoice(asset.id)}>
            <Image src={asset.url} alt="" width={112} height={112} unoptimized />
            <span>{asset.description || t("תמונה {arg_0}", { arg_0: asset.id })}</span>
          </button>
        </li>)}
      </ul>}
    <div className={styles.timelineTools}>
      {photos?.length ? <button type="button" className={styles.primary} disabled={saving || !choice} onClick={() => void save()}>
        {t(saving ? "מכניסים לפוסט…" : "להשתמש בתמונה בפוסט")}
      </button> : null}
      <input ref={uploadInput} hidden type="file" accept="image/*" onChange={event => void upload(event.target.files?.[0])} />
      <button type="button" disabled={saving || photos === null} className={styles.textAction} onClick={() => uploadInput.current?.click()}>{t("להעלות מהמכשיר")}</button>
      <button type="button" disabled={saving} className={styles.textAction} onClick={onCancel}>{t("לבטל")}</button>
    </div>
  </section>;
}
