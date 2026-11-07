"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCopy } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { ProductWordmark } from "@/components/landing-v2/ProductWordmark";
import form from "@/components/start/form.module.css";
import auth from "@/app/login/auth.module.css";

export function AuthCard({ title, children, focusTitle = false }: { title: React.ReactNode; children: React.ReactNode; focusTitle?: boolean }) {
  const t = useCopy();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusTitle) heading.current?.focus({ preventScroll: true }); }, [focusTitle]);
  return (
    <div className={`auth-blue ${auth.page}`}>
      <header className={auth.bar}>
        <div className={auth.barRow}>
          <Link href="/" className={auth.brand} aria-label={t("ישראמארקט, לעמוד הבית")}>
            <ProductWordmark />
          </Link>
          <ProductUtilities inline />
        </div>
      </header>
      <main className={auth.main}>
        <div className={auth.card}>
          <h1 ref={heading} tabIndex={-1} className={auth.title}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue,
  dir,
  autoComplete,
  value,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  /** "ltr" for an email or a password: typed left to right, so it should read that way. */
  dir?: "ltr" | "rtl";
  autoComplete?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const t = useCopy();
  return (
    <label className="block">
      <span className={form.label}>{t(label)}</span>
      {/* 16px on phones: iOS zooms the page into any field smaller than that (form.input). */}
      <input
        name={name}
        type={type}
        placeholder={placeholder ? t(placeholder) : placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={event => onChange?.(event.target.value)}
        dir={dir}
        autoComplete={autoComplete}
        required
        className={`${form.input} ${dir === "ltr" ? "text-left" : ""}`}
      />
    </label>
  );
}
