"use client";

import { useEffect, useState } from "react";

/** Set by /account right before it sends the owner here after deleting the account. */
export const ACCOUNT_DELETED_FLAG = "isramarket_account_deleted";

/**
 * The toast that confirms an account deletion, shown once on the landing page. A flag in
 * sessionStorage rather than a query string, so the confirmation is not in the URL, a
 * reload does not repeat it and the landing page stays static.
 */
export function DeletedNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let flagged = false;
    try {
      flagged = window.sessionStorage.getItem(ACCOUNT_DELETED_FLAG) === "1";
      window.sessionStorage.removeItem(ACCOUNT_DELETED_FLAG);
    } catch {
      flagged = false;
    }
    if (!flagged) return;
    // Reading browser storage is only possible after mount; one render later is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
      {visible ? (
        <p className="rounded-full bg-[#2d3f32] px-5 py-2.5 text-sm font-bold text-white shadow-lg">
          החשבון וכל המידע נמחקו
        </p>
      ) : null}
    </div>
  );
}
