import Image from "next/image";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import styles from "./creative-reel.module.css";

const MEDIA = "/showcase/dyo-tari";

export function CreativeReel() {
  const t = useCopy();

  return <section id="creative-reel" className={styles.section} aria-labelledby="creative-reel-title">
    <div className="lv2-wrap">
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}><Copy text="דוגמה לקידום סדנת הדפס בחיפה" /></p>
          <h2 id="creative-reel-title"><Copy text="רעיון אחד, תוכן לכל ערוץ." /></h2>
        </div>
        <p><Copy text="סרטון, פוסט וסטורי באותה שפה עיצובית, כל אחד בפורמט שמתאים לו." /></p>
      </header>
      <div className={styles.gallery}>
        <figure className={styles.film}>
          <video
            controls
            playsInline
            preload="none"
            poster={`${MEDIA}/film-poster.webp`}
            width={1280}
            height={720}
            aria-label={t("סרטון קצר לסדנת הדפס רשת של דיו טרי")}
          >
            <source src={`${MEDIA}/film.mp4`} type="video/mp4" />
            <a href={`${MEDIA}/film.mp4`}><Copy text="לצפייה בסרטון" /></a>
          </video>
          <figcaption><Copy text="סרטון" /></figcaption>
        </figure>
        <figure>
          <Image src={`${MEDIA}/feed.webp`} width={864} height={1080} sizes="(max-width: 760px) 55vw, 24vw"
            alt={t("פוסט כתום עם איור דג וכיתוב ״הדיו עוד רטוב״")} />
          <figcaption><Copy text="פוסט" /></figcaption>
        </figure>
        <figure>
          <Image src={`${MEDIA}/story.webp`} width={720} height={1280} sizes="(max-width: 760px) 40vw, 17vw"
            alt={t("סטורי כחול שמציג את ההדפס שאפשר להכין בסדנה")} />
          <figcaption><Copy text="סטורי" /></figcaption>
        </figure>
      </div>
    </div>
  </section>;
}
