export type MotionAssetId = "press" | "choose" | "save" | "copy" | "upload" | "prepare" | "reveal" | "publish" | "milestone";
export type MotionCategory = "feedback" | "progress" | "delight";
export type MotionMood = "quiet" | "playful";

export const motionAssets: { id: MotionAssetId; title: string; description: string; category: MotionCategory; duration: string; where: string; action: string }[] = [
  { id: "press", title: "לחיצה עם אופי", description: "לחיצה קטנה, תגובה מיידית.", category: "feedback", duration: "160 ms", where: "כפתורים ופעולות יומיומיות", action: "לנסות לחיצה" },
  { id: "choose", title: "זאת הבחירה שלי", description: "האפשרות שבחרתם מקבלת סימן קטן.", category: "feedback", duration: "320 ms", where: "בחירת קהל, סגנון או רעיון", action: "לבחור סגנון" },
  { id: "save", title: "נשמר במקום", description: "סימנייה מתקפלת, והשינוי נשמר.", category: "feedback", duration: "480 ms", where: "שמירת עריכה או תשובה", action: "לשמור את הטיוטה" },
  { id: "copy", title: "מוכן להדבקה", description: "שני דפים נפרדים, והטקסט אצלכם.", category: "feedback", duration: "400 ms", where: "העתקת פוסט או קישור", action: "להעתיק את הטקסט" },
  { id: "upload", title: "תמונה נכנסת", description: "התמונה נוחתת בעדינות באלבום.", category: "progress", duration: "520 ms", where: "אחרי שהעלאת תמונה הצליחה", action: "לנסות הוספת תמונה" },
  { id: "prepare", title: "משהו טוב בהכנה", description: "שלוש נקודות שעובדות בזמן שמחכים.", category: "progress", duration: "1.2 s", where: "מחקר ויצירת תוכן", action: "להכין רעיון לדוגמה" },
  { id: "reveal", title: "עוד קצת פרטים", description: "הפרטים נפתחים במקום שבו ביקשתם.", category: "progress", duration: "260 ms", where: "הסברים, מקורות ועזרה", action: "לפתוח את הרעיון" },
  { id: "publish", title: "יוצא לדרך", description: "מטוס נייר קטן שולח את העבודה קדימה.", category: "delight", duration: "640 ms", where: "אחרי אישור פרסום או תזמון", action: "לנסות שליחה" },
  { id: "milestone", title: "העסק יוצא לדרך", description: "השמש עולה מעל הדוכן שלנו.", category: "delight", duration: "1.8 s", where: "הפוסט הראשון או השלמת משימה", action: "להשלים את המשימה" },
];
