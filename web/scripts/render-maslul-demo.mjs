/** Reproducible, fictional project-software demo. No customer screens or provider calls. */
import sharp from 'sharp';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const out=new URL('../public/showcase/',import.meta.url);
const messages={
 he:{title:'השקת האתר',todo:'לביצוע',doing:'בעבודה',done:'הושלם',task:'בדיקת דף הבית',other:'חיבור הטופס',owner:'דנה',note:'כל הצוות רואה מה מתקדם'},
 en:{title:'Website launch',todo:'To do',doing:'In progress',done:'Done',task:'Review homepage',other:'Connect the form',owner:'Dana',note:'One shared view of the work'},
 ar:{title:'إطلاق الموقع',todo:'للتنفيذ',doing:'قيد العمل',done:'مكتمل',task:'مراجعة الصفحة الرئيسية',other:'ربط النموذج',owner:'دانا',note:'الفريق كله يرى تقدم العمل'},
 ru:{title:'Запуск сайта',todo:'Задачи',doing:'В работе',done:'Готово',task:'Проверить главную',other:'Подключить форму',owner:'Дана',note:'Вся команда видит прогресс'}
};
const text=(x,y,t,size=16,color='#244c44',weight=400)=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${t}</text>`;
const rect=(x,y,w,h,fill,r=10)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
for(const [locale,m] of Object.entries(messages)){
 const dir=join(tmpdir(),'isramarket-maslul-'+locale);await mkdir(dir,{recursive:true});
 for(let frame=0;frame<120;frame++){
  const t=frame/15;
  // A real changing board: move the same task from To do, through In progress, to Done.
  const move=t<1.4?0:t<2.5?(t-1.4)/1.1:t<4.1?1:t<5.2?1+(t-4.1)/1.1:2;
  const ease=v=>v*v*(3-2*v);
  const x=30+144*(Math.floor(move)+ease(move%1));
  const settled=move===0||move===1||move===2;
  const zoom=t<.8?1:1+Math.min(.06,(t-.8)*.025);
  const cx=x+104,cy=331;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600">
  ${rect(0,0,480,600,'#e6eee9',0)}
  <g transform="translate(240 300) scale(${zoom}) translate(-240 -300)">
  ${rect(14,56,452,460,'#fff',18)}${rect(14,56,452,56,'#24594f',18)}${rect(14,86,452,26,'#24594f',0)}
  ${text(32,92,'maslul',29,'#fff',700)}${text(32,149,m.title,24,'#17372f',700)}
  ${text(32,177,m.note,14,'#607970')}
  ${[m.todo,m.doing,m.done].map((label,i)=>`${rect(25+i*144,212,136,264,['#f0eef8','#f8eadc','#e2f1e9'][i])}${rect(36+i*144,226,8,8,['#9584b9','#db975d','#4f977a'][i],4)}${text(50+i*144,235,label,13,'#334a43',600)}${text(136+i*144,235,String(i===Math.round(move)?1:0),12,'#607970')}`).join('')}
  ${rect(34,365,118,71,'#fff',8)}${text(44,390,m.other,11)}${rect(44,404,49,5,'#d8e4dd',3)}
  <g transform="translate(${x} ${settled?270:260})">${rect(0,4,126,88,'#244c4420',9)}${rect(0,0,126,88,'#fff',9)}${rect(10,12,36,5,move>=2?'#4f977a':'#8e7cb2',3)}${text(10,39,m.task,11,'#244c44',600)}${rect(10,54,22,22,'#d8e8e1',11)}${text(17,70,'D',12)}${text(40,70,m.owner,11,'#607970')}</g>
  ${move>=2?`<circle cx="${x+111}" cy="282" r="12" fill="#4f977a"/><path d="m${x+105} 282 4 4 8-9" fill="none" stroke="white" stroke-width="2"/>`:''}
  <g transform="translate(${cx} ${cy+(settled?10:-8)})"><path d="M0 0v30l8-8 6 12 6-3-6-11h12Z" fill="white" stroke="#17372f" stroke-width="2"/>${!settled?'<circle cx="7" cy="8" r="15" fill="none" stroke="#6b8c7f" stroke-width="2" opacity=".6"/>':''}</g>
  </g></svg>`;
  const buffer=await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(join(dir,String(frame).padStart(3,'0')+'.png'),buffer);
  if(frame===87)await sharp(buffer).jpeg({quality:85}).toFile(new URL(`maslul-project-demo-${locale}.jpg`,out).pathname);
 }
 const video=new URL(`maslul-project-demo-${locale}.mp4`,out);
 const r=spawnSync('/opt/homebrew/bin/ffmpeg',['-y','-loglevel','error','-framerate','15','-i',join(dir,'%03d.png'),'-c:v','libx264','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',video.pathname],{encoding:'utf8'});
 if(r.status!==0)throw new Error(r.stderr);
 await rm(dir,{recursive:true});
 console.log(`Rendered ${locale}: 8 seconds, 120 frames`);
}
