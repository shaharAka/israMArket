/** Public example campaign. The dates, artwork and visits come from workshopCampaign. */
export const editorialCopy = {
  example: "קמפיין לדוגמה",
  studio: "סטודיו דיו טרי",
  project: "הרשמה לסדנת הדפס",
  photoAlt: "ידיים מעבירות דיו כחול וכתום על רשת ההדפסה בסטודיו.",
  posterAlt: "מודעת ההרשמה של דיו טרי, עם דג כחול על רקע כתום.",
  benefit: "פותחים את השבוע ויודעים מה לקדם.",
  benefitBody: "הרעיון, הנוסח והתמונה כבר מחכים לכם בלוח הפרסום. אתם בודקים מה מתאים לעסק ומחליטים מה לפרסם.",
  stepTitle: "ככה זה עובד",
  question: "מה קורה בסדנה שלכם?",
  answer: "כל משתתף בוחר שני צבעים, מדפיס בעצמו ולוקח הביתה את ההדפס שלו.",
  goal: "היעד לחודש",
  goalValue: "8 הרשמות לסדנה",
  ready: "מוכן לאישור",
  outcomes: "התוכנית, הפוסטים והתוצאות",
  compare: "תצוגת התוצרים",
  grid: "בשורה",
  stacked: "בטור",
  audience: "למי זה מתאים?",
  mobile: "הפוסט הבא איתכם גם בנייד.",
  mobileBody: "פותחים את התוכנית בדפדפן של הטלפון, בודקים את הפוסט ומאשרים אותו גם בין פגישות.",
  nextPost: "הפוסט הבא",
  inspectPost: "לאשר את הפוסט",
  approved: "אושר. מוכן לפרסום",
};

export const editorialSteps = [
  { id: "research", title: "מספרים על העסק", body: "כמה שאלות על מה אתם מציעים, למי ומה מייחד אתכם." },
  { id: "connections", title: "מחברים את הערוצים", body: "אתם בוחרים אילו חשבונות לחבר. אפשר להתחיל גם בלי חיבורים." },
  { id: "goals", title: "בוחרים יעד לחודש", body: "בוחרים מה רוצים להשיג ואיך למדוד את ההתקדמות." },
  { id: "plan", title: "עוברים על התוכנית והפוסטים", body: "מקבלים הצעות לפרסום לכל ערוץ. אתם עורכים, מאשרים ומפרסמים." },
] as const;

export const editorialOutcomes = [
  { id: "campaign", title: "יודעים מה לפרסם השבוע", body: "לכל פרסום יש נושא, ערוץ ותאריך מוצע בלוח החודשי." },
  { id: "posts", title: "מקבלים פוסט מוכן לאישור", body: "טקסט ועיצוב שמתאימים לערוץ. אפשר לערוך כל פוסט לפני הפרסום." },
  { id: "learning", title: "מחליטים מה לנסות בשבוע הבא", body: "כשמחברים נתוני אתר, רואים אילו ערוצים הביאו יותר ביקורים ומה כדאי לנסות בהמשך." },
] as const;

export const editorialAudiences = [
  { label: "חנויות ועסקים מקומיים", description: "מציגים מוצר חדש ומזמינים לקנות באתר או להגיע לחנות.", image: "/showcase/creative-strip/frames-photo.webp", alt: "מסגרת משקפיים בגוון ענבר, מתוך קמפיין לדוגמה לחנות אופטיקה." },
  { label: "נותני שירות", description: "מראים איך אתם עובדים ומזמינים לקוחות לקבוע פגישה.", image: "/showcase/campaign-cuts/interior-poster.webp", alt: "בחירת גוון על קיר, מתוך קמפיין לדוגמה לייעוץ בעיצוב פנים." },
  { label: "תוכנה וסטארטאפים", description: "מדגימים את המוצר ומזמינים צוותים לנסות אותו.", image: "/showcase/software-owner-focus-ai.jpg", alt: "עבודה על מחשב, מתוך קמפיין לדוגמה למוצר תוכנה." },
  { label: "עמותות וגיוס תרומות", description: "מראים מה התרומה מאפשרת ומזמינים אנשים להצטרף לעשייה.", image: "/showcase/nonprofit-volunteer-detail-ai.png", alt: "אריזת סיוע בידי מתנדבים, מתוך קמפיין לדוגמה לעמותה." },
] as const;
