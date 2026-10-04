#!/usr/bin/env python3
"""Deterministic, local IsraMarket reels. No network, browsers or customer data.
Requires ffmpeg/ffprobe on PATH and the two pinned Python packages.
Artwork is drawn at 2x and downsampled; captions are independently editable JSON/SRT.
"""
from __future__ import annotations
import argparse, functools, hashlib, json, math, os, shutil, struct, subprocess, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / '.runtime/promotional-videos/exports'
FONT = HERE / 'assets/Heebo.ttf'
W,H,FPS = 1080,1920,30
C = dict(canvas='#f6f7fb',paper='#ffffff',ink='#14203a',soft='#516078',muted='#68748a',rule='#e6eaf2',blue='#2853c7',pale='#edf1fc',sun='#ffc44a',sand='#fff4d7',clay='#c58060')
SPEC = json.loads((HERE/'captions.json').read_text())

@functools.lru_cache(None)
def font(size, weight=500):
    f=ImageFont.truetype(str(FONT),size,layout_engine=ImageFont.Layout.BASIC)
    f.set_variation_by_axes([weight])
    return f

class Canvas:
    def __init__(self, width=W, height=H, scale=2, fill=None):
        self.s=scale
        self.im=Image.new('RGBA',(width*scale,height*scale),fill or (0,0,0,0))
        self.d=ImageDraw.Draw(self.im)
    def box(self,xy,fill,r=0,outline=None,width=1):
        xy=tuple(round(v*self.s) for v in xy)
        self.d.rounded_rectangle(xy,r*self.s,fill,outline,width*self.s)
    def circle(self,xy,fill,outline=None,width=1):
        self.d.ellipse(tuple(round(v*self.s) for v in xy),fill,outline,width*self.s)
    def line(self,pts,fill,width=2):
        self.d.line([(round(x*self.s),round(y*self.s)) for x,y in pts],fill=fill,width=round(width*self.s),joint='curve')
    def polygon(self,pts,fill):
        self.d.polygon([(round(x*self.s),round(y*self.s)) for x,y in pts],fill=fill)
    def text(self,x,y,text,size=40,weight=500,color=None,align='right',max_width=None):
        visual=get_display(text,base_dir='R')
        f=font(size*self.s,weight)
        bbox=self.d.textbbox((0,0),visual,font=f)
        width=self.d.textlength(visual,font=f)/self.s
        if max_width is not None and width>max_width:
            raise ValueError(f'Text overflow {width:.1f}>{max_width}: {text}')
        if align=='right': x-=width
        elif align=='center': x-=width/2
        self.d.text((round(x*self.s),round(y*self.s)),visual,font=f,fill=color or C['ink'])
    def finish(self):
        return self.im.resize((self.im.width//self.s,self.im.height//self.s),Image.Resampling.LANCZOS)

def cup(c,x,y,s=1,color=None):
    color=color or C['clay']
    c.circle((x+99*s,y+21*s,x+164*s,y+92*s),None,color,max(2,round(10*s)))
    c.box((x,y,x+123*s,y+122*s),color,round(22*s))
    c.circle((x,y-13*s,x+123*s,y+18*s),'#e7c7b5')
    c.circle((x+10*s,y-7*s,x+114*s,y+11*s),'#81583f')
    c.line([(x-13*s,y+137*s),(x+146*s,y+137*s)],'#dbc7b9',max(2,round(4*s)))

def sheet(c, active='התוכנית'):
    c.box((112,637,910,1268),'#e9edf6',22)
    c.box((112,625,910,1256),C['paper'],22,C['rule'],1)
    for label,x in [('התוכנית',849),('פוסטים',620),('תוצאות',425)]:
        c.text(x,650,label,30,700 if label==active else 400,C['blue'] if label==active else C['muted'])
    c.line([(153,717),(868,717)],C['rule'],2)
    c.text(862,747,'הדגמה · עסק לדוגמה',27,500,C['muted'])

def plan_rows(c, next_step=False):
    c.text(861,795,'התוכנית של הסטודיו',48,700,max_width=695)
    c.text(861,873,'מה רוצים לקדם',29,500,C['muted'])
    c.text(861,918,'כלי קרמיקה לקפה בבית',39,600,max_width=695)
    c.line([(162,993),(861,993)],C['rule'],2)
    c.circle((838,1038,857,1057),C['sun'])
    c.text(820,1026,'הצעד הבא' if next_step else 'הצעד הראשון',29,600,C['soft'])
    if next_step:
        c.text(861,1080,'להסביר איך בוחרים כוס',39,600,max_width=695)
        c.text(861,1150,'לפי השאלות שמגיעות מלקוחות',29,400,C['soft'],max_width=695)
    else:
        c.text(861,1080,'להציג את ההבדל בין הכוסות',37,600,max_width=695)
        c.text(861,1150,'למי: אוהבי קפה בבית',29,400,C['soft'])

def content(kind):
    c=Canvas()
    if kind in ('hook','hook_fast'):
        # A plan sheet is the hero even in the hook; the folded corner makes it tactile.
        c.box((168,675,855,1216),C['paper'],16,C['rule'],2)
        c.polygon([(761,675),(855,769),(761,769)],C['pale'])
        c.text(794,733,'התוכנית שלכם',47,700)
        c.line([(226,829),(793,829)],C['rule'],2)
        if kind=='hook':
            for y,label in [(874,'מה לקדם'),(972,'למי לפנות'),(1070,'מה עושים עכשיו')]:
                c.circle((768,y+15,787,y+34),C['blue'])
                c.text(739,y,label,40,500)
        else:
            c.text(795,873,'מטרה אחת.',50,700,C['blue'])
            c.text(795,955,'פעולה קרובה.',50,700)
            c.text(795,1094,'פוסט שיש לו תפקיד.',34,500,C['soft'])
    elif kind in ('plan','next'):
        sheet(c)
        plan_rows(c,kind=='next')
    elif kind=='post':
        sheet(c,'פוסטים')
        c.text(861,795,'הפוסט מתוך התוכנית',43,700,max_width=695)
        c.box((154,887,443,1179),'#f3e8dd',12)
        cup(c,186,995,1.28)
        c.text(861,889,'איזו כוס מתאימה',37,600,max_width=377)
        c.text(861,943,'לקפה שלכם?',37,600,max_width=377)
        c.text(861,1014,'מהתמונות שלכם',27,400,C['soft'])
        c.text(861,1060,'לטקסט ולעיצוב',27,400,C['soft'])
        c.box((526,1133,861,1210),C['blue'],12)
        c.text(694,1145,'לבדוק ולאשר',31,600,C['paper'],'center')
    elif kind=='evidence':
        sheet(c,'תוצאות')
        c.text(861,798,'מה יודעים עד עכשיו?',43,700,max_width=695)
        c.text(861,887,'כניסות לאתר',34,600)
        c.text(178,890,'לא נמדד',31,500,C['muted'],'left')
        c.line([(165,955),(861,955)],C['rule'],2)
        c.text(861,979,'שאלות שמגיעות מלקוחות',34,600,max_width=695)
        c.text(861,1039,'להוסיף את מה שאתם יודעים',29,400,C['soft'])
        c.box((153,1131,870,1218),C['sand'],12)
        c.text(833,1150,'מכאן בוחרים מה לשפר',32,600,max_width=635)
    elif kind=='end':
        c.text(514,686,'ישראמארקט',83,700,C['blue'],'center',790)
        c.text(514,803,'תוכנית שיווק שממשיכה איתכם',37,400,C['ink'],'center',790)
        c.box((158,988,870,1100),C['blue'],16)
        c.text(514,1013,'קבלו תוכנית לעסק שלכם',43,600,C['paper'],'center',665)
        c.text(514,1158,'מהעסק שלכם. לצעד הבא.',32,500,C['soft'],'center')
    return c.finish()

@functools.lru_cache(None)
def scene_layer(platform,index):
    scene=SPEC[platform]['scenes'][index]
    c=Canvas()
    for n,line in enumerate(scene['lines']):
        c.text(900,335+n*100,line,70 if platform=='instagram' else 72,700,
               C['blue'] if n==1 else C['ink'],max_width=792)
    c.im.alpha_composite(content(scene['kind']).resize((W*2,H*2),Image.Resampling.LANCZOS))
    return c.finish()

def smooth(v):
    v=max(0,min(1,v)); return v*v*(3-2*v)

def store(c,x,y,s=1):
    # Front elevation: flat roof, rectangular sign, striped market awning and open display.
    c.box((x+10*s,y+46*s,x+198*s,y+208*s),C['paper'],5,C['blue'],3)
    c.box((x+14*s,y,x+194*s,y+47*s),C['blue'],6)
    c.text(x+104*s,y+7*s,'העסק שלכם',max(12,round(23*s)),600,C['paper'],'center')
    c.polygon([(x,y+50*s),(x+208*s,y+50*s),(x+224*s,y+94*s),(x-16*s,y+94*s)],C['paper'])
    for i in range(6):
        xa=x-16*s+i*40*s
        c.box((xa,y+64*s,xa+20*s,y+101*s),C['blue'],3)
    c.line([(x-16*s,y+102*s),(x+224*s,y+102*s)],C['blue'],3)
    c.box((x+33*s,y+118*s,x+112*s,y+182*s),C['pale'],4,C['blue'],2)
    c.box((x+135*s,y+112*s,x+177*s,y+208*s),C['blue'],3)
    c.circle((x+143*s,y+158*s,x+149*s,y+164*s),C['sun'])
    c.line([(x+25*s,y+185*s),(x+119*s,y+185*s)],C['blue'],4)
    c.circle((x+48*s,y+142*s,x+72*s,y+176*s),C['sun'])
    c.circle((x+79*s,y+152*s,x+100*s,y+176*s),C['clay'])

PATH=[]
for i in range(251):
    u=i/250
    # A flat road rising gently to the store entrance; it actually ends at the door.
    PATH.append((146+645*u,1492-66*u+31*math.sin(u*math.pi*2)))

@functools.lru_cache(None)
def base():
    c=Canvas(fill=C['canvas'])
    c.circle((870,223,895,248),C['sun'])
    c.text(849,208,'ישראמארקט',32,700,C['blue'])
    # Warm horizon, kept away from all essential captions.
    c.box((0,1570,1080,1920),'#f1f3f8')
    return c.finish()

def footer(t,duration):
    c=Canvas()
    rise=smooth(t/duration)
    sy=1481-158*rise
    c.circle((713,sy-83,879,sy+83),C['sun'])
    # Cover the sun below the horizon, making its rise physically coherent.
    c.box((698,1462,903,1570),(0,0,0,0))
    n=max(2,round(251*smooth(t/1.8)))
    c.line(PATH[:n],C['blue'],5)
    if t>2.0:
        p=smooth((t-2)/(duration-5))
        pos=PATH[min(250,round(250*p))]
        # Walking figure follows only a road already fully drawn. Arms/legs move subtly.
        x,y=pos; phase=math.sin(t*7)*5*(1 if p<1 else 0)
        c.circle((x-8,y-49,x+8,y-33),C['blue'])
        c.line([(x,y-31),(x,y-12)],C['blue'],6)
        c.line([(x,y-12),(x-9-phase,y)],C['blue'],5)
        c.line([(x,y-12),(x+9+phase,y)],C['blue'],5)
        c.line([(x-12,y-20+phase),(x,y-29),(x+12,y-20-phase)],C['blue'],4)
    store(c,694,1302,.65)
    return c.finish()

def frame(platform,t):
    spec=SPEC[platform]; scenes=spec['scenes']
    ix=next((i for i,s in enumerate(scenes) if s['start']<=t<s['end']),len(scenes)-1)
    result=base().copy()
    result.alpha_composite(footer(t,spec['duration']))
    elapsed=t-scenes[ix]['start']
    transition=.34 if platform=='instagram' else .22
    if ix and elapsed<transition:
        a=smooth(elapsed/transition)
        result.alpha_composite(Image.blend(scene_layer(platform,ix-1),scene_layer(platform,ix),a))
    else:
        result.alpha_composite(scene_layer(platform,ix))
    return result.convert('RGB')

def srt_time(s):
    ms=round(s*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); sec,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{sec:02},{ms:03}'

def write_captions(platform):
    scenes=SPEC[platform]['scenes']
    srt='\n\n'.join(f"{i+1}\n{srt_time(s['start'])} --> {srt_time(s['end'])}\n"+'\n'.join(s['lines']) for i,s in enumerate(scenes))+'\n'
    (OUT/f'{platform}.he.srt').write_text(srt)
    (OUT/f'{platform}.captions.json').write_text(json.dumps(SPEC[platform],ensure_ascii=False,indent=2)+'\n')

def contact(platform,decode=False):
    scenes=SPEC[platform]['scenes']
    sheet=Image.new('RGB',(360*3,680*math.ceil(len(scenes)/3)),'#ffffff')
    for i,s in enumerate(scenes):
        t=(s['start']+s['end'])/2
        path=OUT/f'{platform}-frame-{i+1:02}.png'
        if decode:
            subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(OUT/f'isramarket-{platform}.mp4'),'-frames:v','1',str(path)],check=True)
            im=Image.open(path).convert('RGB')
        else:
            im=frame(platform,t); im.save(path)
        sheet.paste(im.resize((360,640),Image.Resampling.LANCZOS),((i%3)*360,(i//3)*680))
        d=ImageDraw.Draw(sheet)
        d.text(((i%3)*360+16,(i//3)*680+645),f'{platform}  /  {t:.2f}s',font=font(20),fill=C['ink'])
    sheet.save(OUT/f'{platform}-contact-sheet.jpg',quality=94)

def atoms(path):
    result=[]
    with path.open('rb') as f:
        while header:=f.read(8):
            size,kind=struct.unpack('>I4s',header)
            if size==1: size=struct.unpack('>Q',f.read(8))[0]; skip=size-16
            else: skip=size-8
            result.append(kind.decode('ascii'))
            if size==0: break
            f.seek(skip,1)
    return result

def render(platform):
    start=time.monotonic(); duration=SPEC[platform]['duration']; frames=round(duration*FPS)
    target=OUT/f'isramarket-{platform}.mp4'
    command=['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','rawvideo','-vcodec','rawvideo',
        '-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium',
        '-crf','18','-pix_fmt','yuv420p','-profile:v','high','-level','4.2','-movflags','+faststart',
        '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(target)]
    p=subprocess.Popen(command,stdin=subprocess.PIPE)
    try:
        for i in range(frames):
            p.stdin.write(frame(platform,i/FPS).tobytes())
            if i%150==0: print(f'{platform}: {i}/{frames} frames',flush=True)
    finally:
        p.stdin.close()
    if p.wait()!=0: raise RuntimeError('ffmpeg failed')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(target)]))
    v=probe['streams'][0]
    assert (v['width'],v['height'],v['pix_fmt'],v['codec_name'],v['r_frame_rate'],int(v['nb_read_frames']))==(W,H,'yuv420p','h264','30/1',frames)
    assert abs(float(probe['format']['duration'])-duration)<.001
    atomlist=atoms(target); assert atomlist.index('moov')<atomlist.index('mdat')
    (OUT/f'{platform}.ffprobe.json').write_text(json.dumps(probe,indent=2)+'\n')
    write_captions(platform); contact(platform,decode=True)
    elapsed=time.monotonic()-start
    metadata=dict(platform=platform,file=str(target),duration_seconds=duration,frames=frames,width=W,height=H,fps=FPS,
        codec=v['codec_name'],pixel_format=v['pix_fmt'],profile=v['profile'],level=v['level'],faststart=True,mp4_atoms=atomlist,
        audio='none; silent-first review export',bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        render_and_verification_seconds=round(elapsed,2),external_provider_fees_usd=0,source_revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),caption_sha256=hashlib.sha256((HERE/'captions.json').read_bytes()).hexdigest())
    (OUT/f'{platform}.manifest.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps(metadata,indent=2),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--platform',choices=['instagram','tiktok','all'],default='all'); parser.add_argument('--preview',action='store_true')
    args=parser.parse_args(); OUT.mkdir(parents=True,exist_ok=True)
    for platform in (SPEC if args.platform=='all' else [args.platform]):
        if args.preview: contact(platform)
        else: render(platform)
