"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { TRIAL_LABEL } from "@/lib/pricing";
import { ProviderLogo } from "./ProviderLogo";
import { CampaignArtwork } from "./ProcessCampaignArtwork";
import { BrandWordmark } from "./BrandWordmark";
import { PROCESS_GOALS, GENERAL_GOALS, PROCESS_SCHEDULES } from "./processScenarios";
import type { ProcessRole } from "./processExamples";
import { useProcessSequence } from "./useProcessSequence";
import scene from "./process-scenes.module.css";

type RoleProps = { role: ProcessRole | null };
const GOAL_TIMES = [2600,2600,2600] as const;
const LEARNING_TIMES = [2800,2800,4000] as const;
const PHONE_TIMES = [4200,3200] as const;
const TRIAL_TIMES = [2800,4200] as const;
function Tick() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>; }
function Cursor({ className = "" }: { className?: string }) { return <svg className={`${scene.cursor} ${className}`} viewBox="0 0 32 38" fill="none" aria-hidden="true"><path d="M4 3v27l7-7 6 11 6-3-6-11h10L4 3Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function Loop() { return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M25 11a10 10 0 0 0-17-2L5 12m0-7v7h7M7 21a10 10 0 0 0 17 2l3-3m0 7v-7h-7" /></svg>; }
function GoalIcon({ role, index = 0 }: { role: ProcessRole | null; index?: number }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{role === "fundraising" ? <path d="M24 39 10 25C-1 13 15 4 24 16c9-12 25-3 14 9Z" /> : role === "online_shop" || role === "physical_shop" ? <><path d="M6 10h5l6 22h19l5-16H13M19 40h1M34 40h1" /><circle cx="20" cy="39" r="2" /><circle cx="35" cy="39" r="2" /></> : role === "software" ? <><rect x="6" y="7" width="36" height="27" rx="4" /><path d="M17 41h14M24 34v7m-6-22 6 5 8-10" /></> : index === 1 ? <><rect x="7" y="10" width="34" height="31" rx="5" /><path d="M7 20h34M16 6v9M32 6v9m-15 17 5 5 9-11" /></> : <><circle cx="20" cy="16" r="8" /><path d="M5 41v-4a15 15 0 0 1 30 0v4m1-30a8 8 0 0 1 0 15m2 5a12 12 0 0 1 7 11" /></>}</svg>;
}

export function GoalsScene({ role, playing }: RoleProps & { playing: boolean }) {
  const { index, select } = useProcessSequence(GOAL_TIMES, playing);
  const goals = role ? PROCESS_GOALS[role] : GENERAL_GOALS;
  return <div className={`${scene.scene} ${scene.goals}`} data-goal-active={index}>
    <span className={scene.eyebrow}><Copy text="המטרות לחודש הקרוב" /></span>
    <div className={scene.goalList}>{goals.map((goal,i) => <button type="button" key={goal} aria-pressed={i===index} onMouseEnter={()=>select(i)} onFocus={()=>select(i)} onClick={()=>select(i)}><span className={scene.goalSymbol}><GoalIcon role={role} index={i} /></span><strong><Copy text={goal} /></strong><span className={scene.goalTick}>{i===index ? <Tick /> : <span />}</span></button>)}</div>
    <div className={scene.goalConnection}><span /><i /><span /></div>
    <p className={scene.goalMeaning}><GoalIcon role={role} /><Copy text="בודקים התקדמות לפי המטרות שבחרת" /></p>
  </div>;
}

export function PlanScene({ role }: RoleProps) {
  const {locale} = useLanguage();
  const schedule = role ? PROCESS_SCHEDULES[role] : {goal:"להגיע לקהל המתאים ולהוביל אותו לפעולה",tasks:["פוסט: מה אנחנו מציעים", "סרטון: כך זה עובד", "הזמנה ליצור קשר"]};
  return <div className={`${scene.scene} ${scene.planning}`}>
    <div className={scene.planGoal}><GoalIcon role={role} /><div><small><Copy text="מה רוצים להשיג" /></small><strong><Copy text={schedule.goal} /></strong></div></div>
    <div className={scene.planFlow} aria-hidden="true"><i /><i /><i /></div>
    <div className={scene.taskCalendar}><header><strong><Copy text="התוכנית לחודש הקרוב" /></strong><span><Copy text="לקראת החג" /></span></header><div className={scene.dayNames}>{Array.from({length:7},(_,i)=><span key={i}>{new Intl.DateTimeFormat(locale,{weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2026,10,1+i)))}</span>)}</div><div className={scene.calendarGrid} aria-hidden="true">{Array.from({length:21},(_,i)=><span key={i}>{i+10}</span>)}</div><div className={`${scene.scheduledTask} ${scene.taskOne}`}><small><Copy text="לפני החג" /></small><strong><Copy text={schedule.tasks[0]} /></strong></div><div className={`${scene.scheduledTask} ${scene.taskTwo}`}><strong><Copy text={schedule.tasks[1]} /></strong></div><div className={`${scene.scheduledTask} ${scene.taskThree}`}><strong><Copy text={schedule.tasks[2]} /></strong></div><div className={scene.holiday}><span /><Copy text="ערב חג" /></div></div>
    <div className={scene.continuousAnalysis} data-analysis="continuous"><Loop /><div><strong><Copy text="לומדים כל הזמן" /></strong><small><Copy text="התוצאות ממשיכות לעדכן את התוכנית לאורך החודש" /></small></div></div>
  </div>;
}

/** A concrete comparison, followed by its application. Clicks are kept distinct from purchases. */
export function LearningScene({ playing, reduced }: {playing: boolean; reduced: boolean}) {
  const {index} = useProcessSequence(LEARNING_TIMES, playing);
  const elapsed = useRef(0);
  const previousStage = useRef(index);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (previousStage.current !== index) { elapsed.current = 0; previousStage.current = index; }
    if (!playing) return;
    let frame = 0;
    let previousTime = performance.now();
    const advance = (now: number) => {
      elapsed.current += now - previousTime;
      previousTime = now;
      setProgress(Math.min(1, (index + Math.min(1, elapsed.current / LEARNING_TIMES[index])) / 2));
      if (index < 2 && elapsed.current < LEARNING_TIMES[index]) frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, index]);
  const growth = reduced ? 1 : progress;
  return <div className={`${scene.scene} ${scene.learning}`} data-learning-stage={index}>
    <div className={scene.comparison}>{[false,true].map(priced=><div key={String(priced)} className={scene.comparedPost} data-winner={priced}><small><Copy text={priced ? "עם מחיר" : "בלי מחיר"} /></small><div className={scene.comparedImage}><Image src="/showcase/bakery-challah-ai.png" fill sizes="220px" alt="" /><span><Copy text="חלות לשישי" /></span>{priced&&<strong dir="ltr">₪42</strong>}</div><div className={scene.clickCount}><span>{Math.round((priced ? 76 : 34) * growth)}</span><Copy text="לחיצות" /><i style={{"--click-width":`${(priced ? 90 : 40) * growth}%`} as CSSProperties} /></div></div>)}</div>
    <p className={scene.comparisonContext}><Copy text="אותו קהל · חשיפה דומה" /></p>
    <div className={scene.learningRule}><Tick /><strong><Copy text="בהשוואה הזאת, הפוסט עם המחיר הביא יותר לחיצות" /></strong></div>
    <div className={scene.nextPosts}><div><small><Copy text="מכאן ממשיכים" /></small><strong><Copy text="מציגים את המחיר גם בפוסטים הבאים" /></strong></div><div className={scene.updatedPosts}>{[{image:"/showcase/bakery-friday-order-ai.jpg",price:42},{image:"/showcase/bakery-bread-choice-ai.jpg",price:32},{image:"/showcase/bakery-challah-ai.png",price:42}].map((post,i)=><div key={i}><Image src={post.image} fill sizes="90px" alt="" /><span dir="ltr">₪{post.price}</span><i><Tick /></i></div>)}</div></div>
  </div>;
}

export function DataScene() {
  return <div className={`${scene.scene} ${scene.data}`}>
    <div className={scene.rawSources}><div><ProviderLogo provider="google-analytics" size={29}/><span>Google Analytics</span><i/><i/></div><div><ProviderLogo provider="facebook-instagram" size={25}/><span>Instagram · Facebook</span><i/><i/></div><div><ProviderLogo provider="ads-pixel" size={29}/><span>Meta Ads</span><i/><i/></div></div>
    <div className={scene.dataFlow} aria-hidden="true"><i/><i/><i/></div>
    <div className={scene.readableData}><span className={scene.eyebrow}><Copy text="התמונה החשובה, במקום אחד" /></span>{[{question:"כמה אנשים הגיעו לאתר?",value:"1,240",source:"Google Analytics"},{question:"כמה לחצו על המודעות?",value:"86",source:"Meta Ads"},{question:"כמה פניות נשלחו מהאתר?",value:"12",source:"Google Analytics"}].map(item=><div key={item.question}><p><Copy text={item.question}/></p><strong dir="ltr">{item.value}</strong><small dir="ltr">{item.source}</small></div>)}</div>
  </div>;
}

export function PhoneScene({ role, playing }: RoleProps & {playing:boolean}) {
  const {index,select}=useProcessSequence(PHONE_TIMES,playing);
  const t=useCopy();
  return <div className={scene.phoneScene}><div className={scene.approvalPhone} data-approved={index===1}><div className={scene.phoneStatus}><span>9:41</span><i/></div><div className={scene.phoneLogo}><BrandWordmark/></div><header><Copy text="הפוסט הבא שלך"/></header><div className={scene.phonePost}><CampaignArtwork role={role??"online_shop"} index={2}/></div><div className={scene.approvalState}>{index===1?<><span><Tick/></span><strong><Copy text="מאושר ומוכן לפרסום"/></strong></>:<><small><Copy text="הכול נראה טוב?"/></small><button type="button" onClick={()=>select(1)}><Copy text="לאשר את הפוסט"/></button></>}</div><Cursor className={scene.approvalCursor}/><span className={scene.phoneHome}/></div><button type="button" className={scene.replayApproval} onClick={()=>select(0)} aria-label={t("להציג שוב את אישור הפוסט")}><Loop/></button></div>;
}

/** The free trial offer stays visible while start and plan/content scenes alternate. */
export function TrialScene({ playing, reduced }: { playing: boolean; reduced: boolean }) {
  const { index } = useProcessSequence(TRIAL_TIMES, playing);
  const stage = reduced ? 1 : index;
  return <div className={`${scene.scene} ${scene.trial}`} data-trial-stage={stage}>
    <div className={scene.freeOffer}>
      <div><span className={scene.eyebrow}><Copy text={TRIAL_LABEL} /></span><strong dir="ltr">₪0</strong></div>
      <p><Copy text="זמן להכיר, לנסות ולהחליט" /></p>
    </div>
    <div className={scene.trialStory} key={stage}>
      {stage === 0 ? <div className={scene.trialStart}>
        <BrandWordmark />
        <strong><Copy text="בואו נראה מה אפשר לעשות בשבילך" /></strong>
        <div className={scene.trialStartAction}><Copy text={TRIAL_LABEL} /><Cursor className={scene.trialCursor} /></div>
      </div> : <div className={scene.trialWorking}>
        <div className={scene.trialPreparation}>
          <strong><Copy text="התוכנית שלך מוכנה. מתחילים ליצור את הפוסטים." /></strong>
          <div><span><Tick /></span><Copy text="התוכנית לחודש הקרוב" /></div>
          <div><span><Tick /></span><Copy text="הפוסט הראשון שלך" /></div>
        </div>
        <div className={scene.trialPost}><CampaignArtwork role="online_shop" index={0} /></div>
      </div>}
    </div>
    <div className={scene.trialProgress} aria-hidden="true">{[0,1].map(i => <span key={i} data-active={stage === i} data-complete={stage > i} />)}</div>
  </div>;
}
