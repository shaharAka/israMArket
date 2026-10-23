/** Signal / Punch is the selected product foundation; older studies remain available for comparison. */
export type DesignPalette = {
  id: string;
  name: string;
  description: string;
  canvas: string;
  paper: string;
  ink: string;
  muted: string;
  primary: string;
  soft: string;
  sun: string;
  support: string;
};

export const designPalettes: DesignPalette[] = [
  { id: "signal-punch", name: "Signal / Punch", description: "רקע חם, דיו כהה ודגש כתום", canvas: "#f7f5ef", paper: "#ffffff", ink: "#20221c", muted: "#716357", primary: "#a13c25", soft: "#ffe2d3", sun: "#ff7957", support: "#205944" },
  { id: "blue-sun", name: "כחול ושמש", description: "כחול חד, שמש צהובה, הרבה לבן", canvas: "#f6f7fb", paper: "#ffffff", ink: "#14203a", muted: "#4b5670", primary: "#2853c7", soft: "#eef2fd", sun: "#ffc44a", support: "#e66a4f" },
  { id: "sea-sun", name: "ים ושמש", description: "טורקיז עמוק, צהוב נקי וקורל", canvas: "#fcfefe", paper: "#ffffff", ink: "#16343c", muted: "#4b666c", primary: "#087c88", soft: "#eaf6f7", sun: "#f5ca38", support: "#e86752" },
  { id: "red-sun", name: "אדום של חנות", description: "אדום חי, שמש כתומה ודיו כחול", canvas: "#fffdfb", paper: "#ffffff", ink: "#23334b", muted: "#616573", primary: "#b83d3c", soft: "#fff0ed", sun: "#ffa544", support: "#3268bf" },
];

export function paletteColors(palette: DesignPalette) {
  return [
    { name: "רקע", token: "--im-canvas", value: palette.canvas, purpose: "מרווח לעבוד" },
    { name: "דיו", token: "--im-ink", value: palette.ink, purpose: "טקסט ברור" },
    { name: "בית", token: "--im-primary", value: palette.primary, purpose: "פעולות וסימנים" },
    { name: "דגש", token: "--im-sun", value: palette.sun, purpose: "הפרט שמכניס חיים" },
  ];
}

export const designPalette = paletteColors(designPalettes[0]);

export const designPrinciples = [
  { title: "העסק במרכז", text: "שם העסק, התמונות שלו והמילים של הבעלים נותנים למסך את האישיות שלו." },
  { title: "צבע שמכוון", text: "רקע חם נותן מקום לתוכן. דגש כתום מסמן את הבחירה ואת הצעד הבא." },
  { title: "מרווח לעבוד", text: "משימה אחת קדימה, הסבר קצר ופרטים כשמבקשים. העמוד נושם גם בטלפון." },
  { title: "תנועה עם סיבה", text: "לחיצה, שינוי והצלחה מקבלים תגובה קצרה. התוכן נשאר יציב בזמן שקוראים." },
] as const;
