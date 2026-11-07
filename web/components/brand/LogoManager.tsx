"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import type { Asset, Business } from "@/lib/api";
import { endpoints } from "@/lib/api";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import styles from "./logo-manager.module.css";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Lets the owner stage an owned image as the brand logo; persistence stays with Save. */
export function LogoManager({
  value,
  onSaved,
}: {
  value: string;
  onSaved: (url: string, business: Business) => void;
}) {
  const t = useCopy();
  const input = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stagedUrl, setStagedUrl] = useState(value);
  const [stagedAssetId, setStagedAssetId] = useState<number | null | undefined>();
  const [error, setError] = useState("");
  const dirty = stagedAssetId !== undefined;

  useEffect(() => {
    let active = true;
    endpoints.assets().then(result => {
      if (active) setAssets(result.assets.filter(asset => asset.kind === "image" && LOGO_TYPES.has(asset.mime)));
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את התמונות שלכם");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function upload(file?: File) {
    if (!file || saving || uploading) return;
    setError("");
    if (!LOGO_TYPES.has(file.type)) {
      setError(t("אפשר לבחור לוגו מסוג PNG, JPG או WebP."));
      if (input.current) input.current.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t("הלוגו צריך להיות קטן מ־5MB."));
      if (input.current) input.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const result = await endpoints.uploadAsset(file);
      const asset = result.asset;
      setAssets(current => [asset, ...current.filter(item => item.id !== asset.id)]);
      setStagedUrl(asset.url);
      setStagedAssetId(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו להעלות את הלוגו. אפשר לנסות שוב."));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!dirty || saving || uploading) return;
    setSaving(true);
    setError("");
    try {
      const result = await endpoints.saveBrandLogo(stagedAssetId ?? null);
      const logoUrl = result.business?.brand_language?.logo_url || "";
      if (!result.business) throw new Error(t("לא התקבל אישור לשמירת הלוגו. נסו שוב."));
      onSaved(logoUrl, result.business);
      setStagedUrl(logoUrl);
      setStagedAssetId(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו לשמור את הלוגו. אפשר לנסות שוב."));
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setStagedUrl(value);
    setStagedAssetId(undefined);
    setError("");
  }

  return <section className={styles.section} aria-labelledby="brand-logo-heading">
    <div className={styles.heading}>
      <div>
        <h3 id="brand-logo-heading"><Copy text="הלוגו של העסק" /></h3>
        <p><Copy text="בחרו תמונה שלכם. היא תופיע בפוסטים אחרי שמירת השינויים." /></p>
      </div>
      <button type="button" className={styles.upload} disabled={saving || uploading} onClick={() => input.current?.click()}>
        <Copy text={uploading ? "מעלים את הלוגו…" : "להעלות לוגו"} />
      </button>
      <input ref={input} className={styles.file} type="file" accept="image/png,image/jpeg,image/webp" aria-label={t("לבחור קובץ לוגו PNG, JPG או WebP")}
        disabled={saving || uploading} onChange={event => void upload(event.target.files?.[0])} />
    </div>
    {loading ? <p className={styles.note} role="status"><Copy text="טוענים את התמונות שלכם…" /></p> : assets.length > 0 ? <div className={styles.grid} aria-label={t("לבחור לוגו מהתמונות שלכם")}>
      {assets.map(asset => {
        const selected = asset.id === stagedAssetId || (stagedAssetId === undefined && asset.url === stagedUrl);
        return <button type="button" key={asset.id} className={`${styles.tile} ${selected ? styles.selected : ""}`} aria-pressed={selected}
          aria-label={t("לבחור את התמונה {arg_0} כלוגו", { arg_0: asset.description || String(asset.id) })}
          disabled={saving || uploading} onClick={() => { setError(""); setStagedUrl(asset.url); setStagedAssetId(asset.id); }}>
          <OwnedAssetImage asset={asset} />
        </button>;
      })}
    </div> : <p className={styles.note}><Copy text="עדיין אין תמונות שאפשר לבחור כלוגו." /></p>}
    {stagedUrl && <button type="button" className={styles.clear} disabled={saving || uploading} onClick={() => { setError(""); setStagedUrl(""); setStagedAssetId(null); }}><Copy text="להסיר את הלוגו" /></button>}
    {dirty && <div className={styles.actions}>
      {stagedUrl && <div className={styles.preview}><BusinessLogo src={stagedUrl} name={t("הלוגו של העסק")} className={styles.previewLogo} /><span><Copy text="תצוגה מקדימה של הלוגו" /></span></div>}
      <button type="button" className={styles.save} disabled={saving || uploading} onClick={() => void save()}><Copy text={saving ? "שומרים את הלוגו…" : "לשמור את הלוגו"} /></button>
      <button type="button" className={styles.cancel} disabled={saving || uploading} onClick={discard}><Copy text="לבטל את שינויי הלוגו" /></button>
    </div>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
  </section>;
}

function OwnedAssetImage({ asset }: { asset: Asset }) {
  // eslint-disable-next-line @next/next/no-img-element -- API-owned media URLs can use a configured host not known to next/image.
  return <img src={asset.url} alt="" />;
}
