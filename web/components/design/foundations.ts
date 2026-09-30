/** Shared semantic decisions. Keep product identity separate from a business's own brand. */
export const designPalette = [
  { name: "נייר", token: "--im-canvas", value: "#f9f8f3", purpose: "רקע העבודה" },
  { name: "דיו", token: "--im-ink", value: "#242820", purpose: "טקסט ופעולה ראשית" },
  { name: "מרווה", token: "--im-sage", value: "#e8eee2", purpose: "בחירה והתקדמות" },
  { name: "שמש", token: "--im-sun", value: "#eee2b6", purpose: "רגע שצריך לשים לב אליו" },
] as const;

export const designPrinciples = [
  { title: "העסק במרכז", text: "שם העסק, התמונות שלו והמילים של הבעלים נותנים למסך את האישיות שלו." },
  { title: "קו אחד שמוביל", text: "מסלול מחבר בין משימות. קו ידני מופיע כשיש לו תפקיד: להוביל, לסמן או לאשר." },
  { title: "מרווח לעבוד", text: "משימה אחת קדימה, הסבר קצר ופרטים כשמבקשים. העמוד נושם גם בטלפון." },
  { title: "תנועה עם סיבה", text: "לחיצה, שינוי והצלחה מקבלים תגובה קצרה. התוכן נשאר יציב בזמן שקוראים." },
] as const;
