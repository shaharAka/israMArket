#!/usr/bin/env python3
"""V3 plan-first local cuts; v1 remains unchanged. No external services."""
import argparse, functools, hashlib, importlib.util, json, math, subprocess, time
from pathlib import Path
from PIL import Image

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('reel_v1',HERE.parent/'render.py')
v1=importlib.util.module_from_spec(spec); spec.loader.exec_module(v1)
Canvas,C,W,H,FPS=v1.Canvas,v1.C,v1.W,v1.H,v1.FPS
DATA=json.loads((HERE/'captions.json').read_text())
OUT=v1.ROOT/'.runtime/promotional-videos/exports-v3'
INK=C['ink']; BLUE=C['blue']; CREAM='#f4ede5'; CLAY='#be7855'; LIGHT='#e4b895'; COFFEE='#714934'
smooth=v1.smooth

OLIVE='#46503a'; CLAY='#b46d4c'; CREAM='#f4ecdf'

def room(c,x,y,w,h,progress=0):
    """Original conceptual top-down room, never a client before/after."""
    c.box((x,y,x+w,y+h),CREAM,9)
    c.line([(x+14,y+h-14),(x+14,y+14),(x+w-14,y+14),(x+w-14,y+h-14)],OLIVE,3)
    # Existing furniture rearranges, making her practical approach visible.
    shift=48*smooth(progress)
    c.box((x+36+shift,y+39,x+36+shift+w*.29,y+h*.62),CLAY,8)
    c.line([(x+50+shift,y+50),(x+50+shift,y+h*.56)],'#e5b89b',3)
    c.box((x+w*.56,y+h*.52,x+w*.80,y+h*.77),OLIVE,7)
    c.circle((x+w*.65,y+28,x+w*.82,y+28+w*.17),'#a5a37a')
    c.line([(x+w*.43,y+h-17),(x+w*.43,y+h*.65),(x+w*.48,y+h*.40)],'#bca785',3)

def row(c,y,label,value=None,active=False):
    c.text(841,y,label,28,500,C['soft'])
    if value:
        c.text(841,y+44,value,39,600,OLIVE,max_width=675)
    else:
        c.line([(245,y+78),(841,y+78)],'#dfd5c7',3)
    if active: c.circle((856,y+58,873,y+75),CLAY)

def sheet(c):
    c.box((119,532,909,1353),CREAM,18)
    c.text(853,563,'תוכנית השיווק של תמר',48,700,OLIVE,max_width=680)
    c.text(853,635,'מעצבת פנים עצמאית · הדגמה',28,500,C['soft'])
    c.line([(173,695),(855,695)],'#d9ccbb',2)

def title(c,platform,ix):
    scene=DATA[platform]['scenes'][ix]
    for i,line in enumerate(scene['lines']):
        size=56 if len(line)>23 else 63
        c.text(898,286+i*85,line,size,700,BLUE if i else INK,max_width=799)
    # IsraMarket identity is always present; TikTok names it in the main copy at 2.5s.
    c.circle((877,217,897,237),C['sun'])
    c.text(857,202,'ישראמארקט',29,700,BLUE)

@functools.lru_cache(None)
def top_layer(platform,ix):
    c=Canvas(); title(c,platform,ix); return c.finish()

def outro(c,elapsed):
    c.text(514,681,'ישראמארקט',84,700,BLUE,'center')
    c.text(514,795,'העסק שלכם. האופי שלכם. הכיוון שלכם.',32,500,INK,'center',792)
    c.box((145,987,888,1101),BLUE,16)
    c.text(516,1013,'קבלו תוכנית לעסק שלכם',44,600,C['paper'],'center',700)
    # Small brand signature, not a retail-sales metaphor for this service business.
    c.circle((710,1240-28*smooth(elapsed/3),858,1388-28*smooth(elapsed/3)),C['sun'])
    v1.store(c,661,1260,.65)

def frame(platform,t):
    spec=DATA[platform]; scenes=spec['scenes']
    ix=next((i for i,s in enumerate(scenes) if s['start']<=t<s['end']),len(scenes)-1)
    scene=scenes[ix]; elapsed=t-scene['start']; kind=scene['kind']
    c=Canvas(fill=C['canvas']); c.box((0,1580,1080,1920),'#f1f3f8')
    if kind=='end': outro(c,elapsed)
    else:
        sheet(c)
        if kind=='unfinished':
            row(c,722,'למי פונים')
            row(c,875,'מה מיוחד בגישה שלי')
            room(c,206,1062,426,208)
            c.text(850,1092,'העבודה',30,600,OLIVE)
            c.text(850,1142,'של תמר',30,500,OLIVE)
        elif kind in ('audience','approach','action','learn'):
            row(c,722,'למי פונים','משפחות בדירות קטנות',kind=='audience')
            has_approach=kind!='audience'
            # On the fast cut, the second field joins the first during this scene.
            if platform=='tiktok' and kind=='approach' and elapsed<.8: has_approach=False
            row(c,879,'הגישה של תמר','מתחילים ממה שכבר יש' if has_approach else None,kind=='approach')
            if kind=='learn':
                row(c,1050,'מה נבדוק','פניות שמתאימות לשירות',True)
                c.text(842,1237,'שאלה להמשך, לא תוצאה שנמדדה',27,400,C['soft'],max_width=680)
            else:
                row(c,1050,'הצעד הקרוב','להראות סידור אחר לסלון' if kind=='action' else None,kind=='action')
                c.text(842,1237,'תוכנית לעסק, פעולה אחת בכל פעם',27,400,C['soft'],max_width=680)
        elif kind=='execution':
            c.text(850,721,'הצעד בתוכנית: להראות סידור אחר לסלון',32,600,OLIVE,max_width=690)
            # Execution stays within the same plan sheet; the title never disappears.
            room(c,218,797,584,236,min(1,elapsed/2))
            c.text(840,1061,'פוסט בסגנון של תמר',27,500,C['soft'])
            c.text(840,1112,'לפני שקונים עוד רהיט,',39,600,OLIVE,max_width=680)
            c.text(840,1171,'אפשר לבדוק סידור אחר.',39,600,OLIVE,max_width=680)
            c.text(840,1286,'איור רעיוני · לא פרויקט לקוח',25,400,C['soft'])
    result=c.finish(); result.alpha_composite(top_layer(platform,ix)); return result.convert('RGB')

def captions(platform):
    data=DATA[platform]
    for narration in (False,True):
        srt='\n\n'.join(f"{i+1}\n{v1.srt_time(s['start'])} --> {v1.srt_time(s['end'])}\n"+(s['voice'] if narration else '\n'.join(s['lines'])) for i,s in enumerate(data['scenes']))+'\n'
        suffix='narration' if narration else 'captions'
        (OUT/f'{platform}-v3.{suffix}.he.srt').write_text(srt)
    (OUT/f'{platform}-v3.captions.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def contact(platform,decode=False):
    scenes=DATA[platform]['scenes']; sheet=Image.new('RGB',(1080,680*math.ceil(len(scenes)/3)),'white')
    from PIL import ImageDraw
    for i,s in enumerate(scenes):
        t=(s['start']+s['end'])/2; p=OUT/f'{platform}-v3-frame-{i+1:02}.png'
        if decode:
            subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(OUT/f'isramarket-{platform}-v3.mp4'),'-frames:v','1',str(p)],check=True)
            im=Image.open(p).convert('RGB')
        else: im=frame(platform,t); im.save(p)
        sheet.paste(im.resize((360,640),Image.Resampling.LANCZOS),((i%3)*360,(i//3)*680))
        ImageDraw.Draw(sheet).text(((i%3)*360+16,(i//3)*680+644),f'{platform} v3 / {t:.2f}s',font=v1.font(20),fill=INK)
    sheet.save(OUT/f'{platform}-v3-contact-sheet.jpg',quality=95)

def render(platform):
    start=time.monotonic(); duration=DATA[platform]['duration']; frames=round(duration*FPS)
    path=OUT/f'isramarket-{platform}-v3.mp4'
    proc=subprocess.Popen(['ffmpeg','-v','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','-',
      '-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-profile:v','high','-level','4.2','-movflags','+faststart',
      '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(path)],stdin=subprocess.PIPE)
    try:
        for i in range(frames):
            proc.stdin.write(frame(platform,i/FPS).tobytes())
            if i%150==0: print(f'{platform} v3: {i}/{frames}',flush=True)
    finally: proc.stdin.close()
    assert proc.wait()==0
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]))
    v=probe['streams'][0]
    assert (v['width'],v['height'],v['codec_name'],v['pix_fmt'],v['r_frame_rate'],int(v['nb_read_frames']))==(1080,1920,'h264','yuv420p','30/1',frames)
    assert abs(float(probe['format']['duration'])-duration)<.001
    atoms=v1.atoms(path); assert atoms.index('moov')<atoms.index('mdat')
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
    (OUT/f'{platform}-v3.ffprobe.json').write_text(json.dumps(probe,indent=2)+'\n')
    contact(platform,True); captions(platform)
    metadata=dict(file=path.name,duration_seconds=duration,frames=frames,width=1080,height=1920,fps=30,codec='h264',profile=v['profile'],pixel_format='yuv420p',faststart=True,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),render_verify_seconds=round(time.monotonic()-start,2),audio='none; optional timed narration provided, not synthesized',external_provider_fees_usd=0,source_base_revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),composition_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),caption_sha256=hashlib.sha256((HERE/'captions.json').read_bytes()).hexdigest())
    (OUT/f'{platform}-v3.manifest.json').write_text(json.dumps(metadata,indent=2)+'\n'); print(json.dumps(metadata,indent=2),flush=True)

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
