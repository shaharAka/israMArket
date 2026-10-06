"use client";

import { NO_CARD_AT_SIGNUP, NO_COMMITMENT_LABEL, VAT_NOTE, formatPrice } from "@/lib/pricing";
import { useCopy } from "./LanguageProvider";

export function PriceAnswer() {
  const t = useCopy();
  return t("מהחודש השני: {arg_0} לחודש. {arg_1}.{arg_2} אם רוצים להמשיך, מפעילים מנוי לקראת סוף החודש החינמי.", {
    arg_0: formatPrice(), arg_1: t(VAT_NOTE), arg_2: NO_CARD_AT_SIGNUP ? " " + t("בהרשמה לא מבקשים כרטיס אשראי.") : "",
  });
}
export function CancellationAnswer() {
  const t = useCopy();
  return t("{arg_0}. אפשר לבטל בעמוד המנוי, ולמחוק את החשבון ואת כל המידע בכל רגע.", { arg_0: t(NO_COMMITMENT_LABEL) });
}
