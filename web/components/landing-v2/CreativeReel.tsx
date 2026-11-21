import { Copy } from "@/components/language/LanguageProvider";
import { CAMPAIGN_FILMS, CampaignFilm, type FilmName } from "./CampaignFilm";
import styles from "./creative-reel.module.css";

const WORK: { film: FilmName; sector: string }[] = [
  { film: "ink", sector: "סדנת הדפס" },
  { film: "water", sector: "בית ספר לשחייה" },
  { film: "interior", sector: "סטודיו לעיצוב פנים" },
  { film: "flowers", sector: "חנות פרחים" },
];

export function CreativeReel() {
  return <section id="creative-reel" className={styles.section} aria-labelledby="creative-reel-title">
    <div className="lv2-wrap">
      <header className={styles.intro}>
        <h2 id="creative-reel-title"><Copy text="מה יראו הלקוחות שלך?" /></h2>
        <p><Copy text="מסדנת הדפס ועד סטודיו לעיצוב פנים. לכל עסק יש סיפור משלו והזמנה שמתאימה לקהל שלו." /></p>
      </header>
      <div className={styles.gallery}>
        {WORK.map(({ film, sector }) => <figure key={film} data-work={film}>
          <CampaignFilm film={film} autoPreview={film === "interior"} size="(max-width: 680px) 46vw, 25vw" />
          <figcaption>
            <span><Copy text={sector} /></span>
            <h3><Copy text={CAMPAIGN_FILMS[film].title} /></h3>
            <p><Copy text={CAMPAIGN_FILMS[film].caption} /></p>
          </figcaption>
        </figure>)}
      </div>
    </div>
  </section>;
}
