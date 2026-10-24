"use client";

import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { TRIAL_LABEL } from "@/lib/pricing";
import { ProviderLogo } from "./ProviderLogo";
import { CampaignArtwork } from "./ProcessCampaignArtwork";
import { BrandWordmark } from "./BrandWordmark";
import { PROCESS_GOALS, GENERAL_GOALS, PROCESS_SCHEDULES } from "./processScenarios";
import type { ProcessRole } from "./processExamples";
import { useProcessSequence } from "./useProcessSequence";
import { TargetIcon } from "./LandingQaScenes";
import scene from "./process-scenes.module.css";

type RoleProps = { role: ProcessRole | null };
const GOAL_TIMES = [4200,4200,4200] as const;
const PHONE_TIMES = [4200,3200] as const;
const TRIAL_TIMES = [2800,4200] as const;
function Tick() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>; }
function Cursor({ className = "" }: { className?: string }) { return <svg className={`${scene.cursor} ${className}`} viewBox="0 0 32 38" fill="none" aria-hidden="true"><path d="M4 3v27l7-7 6 11 6-3-6-11h10L4 3Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function Loop() { return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M25 11a10 10 0 0 0-17-2L5 12m0-7v7h7M7 21a10 10 0 0 0 17 2l3-3m0 7v-7h-7" /></svg>; }

/** The goal itself sits at the centre of the target; its rim selects the next example. */
export function GoalsScene({ role, playing }: RoleProps & { playing: boolean }) {
  const { index, revision, select } = useProcessSequence(GOAL_TIMES, playing);
  const goals = role ? PROCESS_GOALS[role] : GENERAL_GOALS;
  const t = useCopy();
  return <div className={`${scene.scene} ${scene.goals}`} data-goal-active={index}>
    <div className={scene.goalDial}>
      <svg className={scene.goalDialDrawing} viewBox="0 0 400 400" fill="none" aria-hidden="true">
        <circle className={scene.goalDialTrack} cx="200" cy="200" r="165" />
        <path className={scene.goalDialInner} d="M108 92a142 142 0 0 1 184 0" />
        <path className={scene.goalDialTicks} d="M200 24v22M24 200h22M354 200h22" />
        <circle className={scene.goalDialIndicator} cx="200" cy="200" r="165" />
      </svg>
      <div className={scene.goalFocusCopy} key={`${role}-${index}-${revision}`}>
        <strong><Copy text={goals[index]} /></strong>
      </div>
      <div className={scene.goalDialChoices} role="group" aria-label={t("המטרות לחודש הקרוב")}>
        {goals.map((goal, i) => <button type="button" key={i} className={scene.goalDialChoice} data-goal={i} aria-label={t(goal)} title={t(goal)} aria-pressed={i === index} onFocus={() => select(i)} onClick={() => select(i)}>
          <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><circle cx="18" cy="18" r="12" /><circle cx="18" cy="18" r="4" /></svg>
        </button>)}
      </div>
    </div>
    <p className={scene.goalMeaning}><Copy text="בודקים התקדמות לפי המטרות שבחרת"/></p>
  </div>;
}

export function PlanScene({ role }: RoleProps) {
  const {locale} = useLanguage();
  const schedule = role ? PROCESS_SCHEDULES[role] : {goal:"להגיע לקהל המתאים ולהוביל אותו לפעולה",tasks:["פוסט: מה אנחנו מציעים", "סרטון: כך זה עובד", "הזמנה ליצור קשר"]};
  return <div className={`${scene.scene} ${scene.planning}`}>
    <div className={scene.planGoal}><TargetIcon/><div><small><Copy text="מה רוצים להשיג" /></small><strong><Copy text={schedule.goal} /></strong></div></div>
    <div className={scene.planFlow} aria-hidden="true"><i /><i /><i /></div>
    <div className={scene.taskCalendar}><header><strong><Copy text="התוכנית לחודש הקרוב" /></strong><span><Copy text="לקראת החג" /></span></header><div className={scene.dayNames}>{Array.from({length:7},(_,i)=><span key={i}>{new Intl.DateTimeFormat(locale,{weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2026,10,1+i)))}</span>)}</div><div className={scene.calendarGrid} aria-hidden="true">{Array.from({length:21},(_,i)=><span key={i}>{i+10}</span>)}</div><div className={`${scene.scheduledTask} ${scene.taskOne}`}><small><Copy text="לפני החג" /></small><strong><Copy text={schedule.tasks[0]} /></strong></div><div className={`${scene.scheduledTask} ${scene.taskTwo}`}><strong><Copy text={schedule.tasks[1]} /></strong></div><div className={`${scene.scheduledTask} ${scene.taskThree}`}><strong><Copy text={schedule.tasks[2]} /></strong></div><div className={scene.holiday}><span /><Copy text="ערב חג" /></div></div>
    <div className={scene.continuousAnalysis} data-analysis="continuous"><Loop /><div><strong><Copy text="לומדים כל הזמן" /></strong><small><Copy text="התוצאות ממשיכות לעדכן את התוכנית לאורך החודש" /></small></div></div>
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
  return <div className={scene.phoneScene}><div className={scene.approvalPhone} data-approved={index===1}><div className={scene.phoneScreen}><div className={scene.phoneStatus} aria-hidden="true"><span>9:41</span><svg viewBox="0 0 44 12" fill="currentColor"><path d="M1 8h2v3H1Zm4-3h2v6H5Zm4-3h2v9H9Zm4-2h2v11h-2Z"/><path d="M20 4q4-4 8 0l-1 1q-3-3-6 0Zm2 2q2-2 4 0l-2 3Z"/><rect x="32" y="2" width="10" height="8" rx="2" fill="none" stroke="currentColor"/><path d="M34 4h6v4h-6ZM43 5h1v2h-1Z"/></svg></div><div className={scene.phoneLogo}><BrandWordmark/></div><header><Copy text="הפוסט הבא שלך"/></header><div className={scene.phonePost}><CampaignArtwork role={role??"online_shop"} index={2}/></div><div className={scene.approvalState}>{index===1?<><span><Tick/></span><strong><Copy text="מאושר ומוכן לפרסום"/></strong></>:<><small><Copy text="הכול נראה טוב?"/></small><button type="button" onClick={()=>select(1)}><Copy text="לאשר את הפוסט"/></button></>}</div><Cursor className={scene.approvalCursor}/><span className={scene.phoneHome}/></div></div><button type="button" className={scene.replayApproval} onClick={()=>select(0)} aria-label={t("להציג שוב את אישור הפוסט")}><Loop/></button></div>;
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
