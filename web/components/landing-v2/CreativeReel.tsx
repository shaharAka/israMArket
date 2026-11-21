import { Copy } from "@/components/language/LanguageProvider";
import { CampaignFilm, type FilmName } from "./CampaignFilm";
import styles from "./creative-reel.module.css";

const WORK: FilmName[] = ["ink", "water", "interior", "flowers"];

export function CreativeReel() {
  return <section id="creative-reel" className={styles.section} aria-labelledby="creative-reel-title">
    <div className="lv2-wrap">
      <header className={styles.intro}>
        <h2 id="creative-reel-title"><Copy text="מה יראו הלקוחות שלך?" /></h2>
        <p><Copy text="מסדנת הדפס ועד סטודיו לעיצוב פנים. לכל עסק יש סיפור משלו והזמנה שמתאימה לקהל שלו." /></p>
      </header>
      <div className={styles.gallery}>
        {WORK.map(film => <figure key={film} data-work={film}>
          <CampaignFilm film={film} previewSrc={film === "ink" ? "/showcase/campaign-cuts/ink-preview.mp4" : undefined} size="(max-width: 680px) 46vw, 25vw" />
        </figure>)}
      </div>
    </div>
  </section>;
}
