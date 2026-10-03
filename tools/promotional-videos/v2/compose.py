#!/usr/bin/env python3
"""V2 audience-first local cuts; v1 remains unchanged. No external services."""
import argparse, functools, hashlib, importlib.util, json, math, subprocess, time
from pathlib import Path
from PIL import Image

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('reel_v1',HERE.parent/'render.py')
v1=importlib.util.module_from_spec(spec); spec.loader.exec_module(v1)
Canvas,C,W,H,FPS=v1.Canvas,v1.C,v1.W,v1.H,v1.FPS
DATA=json.loads((HERE/'captions.json').read_text())
OUT=v1.ROOT/'.runtime/promotional-videos/exports-v2'
INK=C['ink']; BLUE=C['blue']; CREAM='#f4ede5'; CLAY='#be7855'; LIGHT='#e4b895'; COFFEE='#714934'
smooth=v1.smooth

def cup(c,x,y,w,h,color,fill=0,latte=False):
    """Front-elevation original ceramic illustration. x/y are top-left of body."""
    # Handle grows with cup, but all geometry stays in the same flat plane.
    c.circle((x+w*.76,y+h*.18,x+w*1.26,y+h*.76),None,color,round(w*.105))
    c.box((x,y,x+w,y+h),color,round(w*.15))
    c.circle((x,y-w*.1,x+w,y+w*.18),LIGHT)
    c.circle((x+w*.065,y-w*.055,x+w*.935,y+w*.13),'#9e674b')
    if fill>0:
        inset=.065+.16*(1-fill)
        c.circle((x+w*inset,y-w*.05,x+w*(1-inset),y+w*.12),'#d8b994' if latte else COFFEE)
        if latte and fill>.3:
            c.circle((x+w*.31,y-w*.023,x+w*.69,y+w*.085),'#f0dbc0')
    c.line([(x+w*.08,y+h*.78),(x+w*.08,y+h*.37)],'#d69a77',max(2,round(w*.017)))
    c.line([(x-w*.06,y+h+22),(x+w*1.17,y+h+22)],'#dbccbd',3)

def arrow(c,x1,y,x2,color=BLUE):
    c.line([(x1,y),(x2,y)],color,5)
    c.line([(x2+16,y-12),(x2,y),(x2+16,y+12)],color,5)

def title(c,platform,ix):
    scene=DATA[platform]['scenes'][ix]
    for i,line in enumerate(scene['lines']):
        # The owner takeaway stays comfortably inside the 800px readable column.
        size=61 if scene['kind'] in ('lesson','plan') else 69
        c.text(899,295+i*90,line,size,700,BLUE if i else INK,max_width=805)
    if scene['kind']!='end':
        c.text(898,211,'הדגמה',29,500,C['muted'])

@functools.lru_cache(None)
def top_layer(platform,ix):
    c=Canvas(); title(c,platform,ix); return c.finish()

def pair(c,t,large=True,fill=False,labels=False,spread=1):
    # One visual contrast: quantity/use. Large illustration, no dashboard miniatures.
    d=55*(1-spread)
    cup(c,191+d,843,208,184,CLAY,fill,'')
    cup(c,570-d,751,240,302,BLUE,fill,True)
    if labels:
        c.text(302,1167,'לקפה קצר',40,600,INK,'center')
        c.text(694,1167,'להפוך גדול',40,600,INK,'center')
    elif large:
        c.text(510,1232,'מה חשוב לדעת לפני שבוחרים?',35,500,C['soft'],'center',800)

def original_post(c,progress=0):
    c.box((135,580,900,1312),C['paper'],18)
    c.text(847,620,'כוסות קרמיקה בעבודת יד',42,600,max_width=665)
    c.line([(190,705),(845,705)],C['rule'],2)
    cup(c,241,849,174,171,CLAY,.25)
    cup(c,574,797,196,244,BLUE,.25,True)
    c.text(843,1158,'פרטים שלקוח רואה.',34,500,C['soft'])
    # A deliberate underline grows under the generic description, ready for the edit.
    c.line([(846,693),(846-620*smooth(progress),693)],C['sun'],8)

def useful_post(c,elapsed):
    c.box((135,580,900,1312),C['paper'],18)
    c.text(846,620,'איך בוחרים כוס',49,700,max_width=665)
    c.text(846,681,'לקפה שלכם?',49,700,BLUE,max_width=665)
    reveal=smooth(elapsed/.6)
    cup(c,236,887,177,157,CLAY,reveal)
    cup(c,576,823,195,228,BLUE,reveal,True)
    c.text(325,1153,'לקפה קצר',36,600,INK,'center')
    c.text(672,1153,'להפוך גדול',36,600,INK,'center')
    c.line([(204,1227),(835,1227)],C['rule'],2)
    c.text(838,1250,'שאלה אחת. הבדל שקל להבין.',26,500,C['soft'])

def plan(c,elapsed):
    c.text(896,575,'התוכנית של העסק',39,500,C['soft'])
    c.circle((867,680,888,701),C['sun'])
    c.text(849,646,'לעזור ללקוחות לבחור',52,700,max_width=715)
    # The product plan is one decision, not a grid of feature cards.
    c.line([(866,742),(866,793+110*smooth(elapsed/.8))],BLUE,4)
    c.circle((856,899,877,920),BLUE)
    c.text(831,878,'להראות את ההבדל בפוסט',43,600,max_width=686)
    c.text(831,963,'ממשיכים לפי שאלות הלקוחות',31,400,C['soft'],max_width=680)
    # Illustration shrinks into an execution detail of the larger plan.
    cup(c,291,1087,99,88,CLAY,1)
    cup(c,502,1049,112,127,BLUE,1,True)
    c.text(875,1325,'ישראמארקט',35,700,BLUE)

def outro(c,elapsed):
    c.text(516,650,'ישראמארקט',85,700,BLUE,'center')
    c.text(516,775,'מהעסק שלכם. לצעד הבא.',37,500,INK,'center')
    c.box((145,986,886,1097),BLUE,16)
    c.text(515,1012,'קבלו תוכנית לעסק שלכם',44,600,C['paper'],'center',700)
    # Signature motion only at the payoff: road first, walker second, store at the end.
    v1.store(c,683,1250,.75)
    pts=[(201+i*5.6,1430-55*math.sin((i/100)*math.pi/2)) for i in range(101)]
    n=max(2,round(101*smooth(elapsed/.65)))
    c.line(pts[:n],BLUE,4)
    if elapsed>.8:
        p=smooth((elapsed-.8)/2.7); x,y=pts[min(100,round(100*p))]
        walk=math.sin(elapsed*8)*5 if p<1 else 0
        # Arrive behind the store front so the road has a clear destination.
        if p<.87:
            c.circle((x-7,y-46,x+7,y-32),BLUE)
            c.line([(x,y-29),(x,y-12)],BLUE,5)
            c.line([(x,y-12),(x-8-walk,y)],BLUE,4)
            c.line([(x,y-12),(x+8+walk,y)],BLUE,4)
            c.line([(x-10,y-18),(x,y-28),(x+11,y-17)],BLUE,4)


def frame(platform,t):
    spec=DATA[platform]; scenes=spec['scenes']
    ix=next((i for i,s in enumerate(scenes) if s['start']<=t<s['end']),len(scenes)-1)
    scene=scenes[ix]; elapsed=t-scene['start']; kind=scene['kind']
    c=Canvas(fill=C['canvas'])
    # Warm studio floor keeps the object demonstration grounded and bold.
    if kind in ('question','question_fast','compare'):
        c.box((0,1110,1080,1580),CREAM)
    else:
        c.box((0,1580,1080,1920),'#f1f3f8')
    # Sun climbs slowly throughout, a small signature until the end card.
    rise=smooth(t/spec['duration'])
    sy=1570-290*rise
    if kind=='end': c.circle((705,sy-89,883,sy+89),C['sun'])
    if kind in ('question','question_fast'):
        # The shorter cut opens in motion: the small/large contrast resolves by 0.55s.
        speed=.55 if kind=='question_fast' else .9
        pair(c,t,large=False,fill=.4,labels=elapsed>=1.2,spread=smooth(elapsed/speed))
    elif kind=='before': original_post(c,elapsed/2)
    elif kind=='compare':
        pair(c,t,fill=smooth(elapsed/1.1),labels=True)
        c.text(899,596,'הבחירה מתחילה בשימוש.',38,500,C['soft'])
        # Connect each caption to the relevant cup without arrows through the artwork.
        p=smooth(elapsed/.6)
        c.line([(290,700),(290,700+72*p)],CLAY,3)
        c.line([(690,630),(690,630+58*p)],BLUE,3)
    elif kind=='lesson': useful_post(c,elapsed)
    elif kind=='plan': plan(c,elapsed)
    elif kind=='end': outro(c,elapsed)
    result=c.finish()
    result.alpha_composite(top_layer(platform,ix))
    return result.convert('RGB')

def captions(platform):
    data=DATA[platform]
    for narration in (False,True):
        srt='\n\n'.join(f"{i+1}\n{v1.srt_time(s['start'])} --> {v1.srt_time(s['end'])}\n"+(s['voice'] if narration else '\n'.join(s['lines'])) for i,s in enumerate(data['scenes']))+'\n'
        suffix='narration' if narration else 'captions'
        (OUT/f'{platform}-v2.{suffix}.he.srt').write_text(srt)
    (OUT/f'{platform}-v2.captions.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def contact(platform,decode=False):
    scenes=DATA[platform]['scenes']; sheet=Image.new('RGB',(1080,680*math.ceil(len(scenes)/3)),'white')
    from PIL import ImageDraw
    for i,s in enumerate(scenes):
        t=(s['start']+s['end'])/2; p=OUT/f'{platform}-v2-frame-{i+1:02}.png'
        if decode:
            subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(OUT/f'isramarket-{platform}-v2.mp4'),'-frames:v','1',str(p)],check=True)
            im=Image.open(p).convert('RGB')
        else: im=frame(platform,t); im.save(p)
        sheet.paste(im.resize((360,640),Image.Resampling.LANCZOS),((i%3)*360,(i//3)*680))
        ImageDraw.Draw(sheet).text(((i%3)*360+16,(i//3)*680+644),f'{platform} v2 / {t:.2f}s',font=v1.font(20),fill=INK)
    sheet.save(OUT/f'{platform}-v2-contact-sheet.jpg',quality=95)

def render(platform):
    start=time.monotonic(); duration=DATA[platform]['duration']; frames=round(duration*FPS)
    path=OUT/f'isramarket-{platform}-v2.mp4'
    proc=subprocess.Popen(['ffmpeg','-v','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','-',
      '-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-profile:v','high','-level','4.2','-movflags','+faststart',
      '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(path)],stdin=subprocess.PIPE)
    try:
        for i in range(frames):
            proc.stdin.write(frame(platform,i/FPS).tobytes())
            if i%150==0: print(f'{platform} v2: {i}/{frames}',flush=True)
    finally: proc.stdin.close()
    assert proc.wait()==0
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]))
    v=probe['streams'][0]
    assert (v['width'],v['height'],v['codec_name'],v['pix_fmt'],v['r_frame_rate'],int(v['nb_read_frames']))==(1080,1920,'h264','yuv420p','30/1',frames)
    assert abs(float(probe['format']['duration'])-duration)<.001
    atoms=v1.atoms(path); assert atoms.index('moov')<atoms.index('mdat')
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
    (OUT/f'{platform}-v2.ffprobe.json').write_text(json.dumps(probe,indent=2)+'\n')
    contact(platform,True); captions(platform)
    metadata=dict(file=path.name,duration_seconds=duration,frames=frames,width=1080,height=1920,fps=30,codec='h264',profile=v['profile'],pixel_format='yuv420p',faststart=True,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),render_verify_seconds=round(time.monotonic()-start,2),audio='none; optional timed narration provided, not synthesized',external_provider_fees_usd=0,source_base_revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),composition_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),caption_sha256=hashlib.sha256((HERE/'captions.json').read_bytes()).hexdigest())
    (OUT/f'{platform}-v2.manifest.json').write_text(json.dumps(metadata,indent=2)+'\n'); print(json.dumps(metadata,indent=2),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--preview',action='store_true');p.add_argument('--platform',choices=['all','instagram','tiktok'],default='all');args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    for platform in DATA if args.platform=='all' else [args.platform]:
        for i,s in enumerate(DATA[platform]['scenes']):
            assert len(s['lines'])<=2
            assert s['start']==(DATA[platform]['scenes'][i-1]['end'] if i else 0)
        assert DATA[platform]['scenes'][-1]['end']==DATA[platform]['duration']
        if args.preview: contact(platform)
        else: render(platform)
