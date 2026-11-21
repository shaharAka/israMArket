/** Re-cut the original social films and their scores with local Chrome and ffmpeg.
 * Run from any directory. The campaign language stays Hebrew across UI locales.
 */
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const directory = path.join(publicDir, "showcase/campaign-cuts");
const scratch = await mkdtemp(path.join(os.tmpdir(), "campaign-scores-"));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const subject of ["flowers", "water", "interior"]) await render(subject);
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}

async function render(subject) {
  const page = await browser.newPage();
  const moving = subject === "interior";
  const input = moving ? path.join(publicDir, "showcase/designer-human-motion-ai.mp4") : path.join(directory, subject + "-art.webp");
  const image = await readFile(input);
  const font = await readFile(path.join(publicDir, "fonts/signal/SecularOne.ttf"));
  await page.setContent('<canvas width="720" height="1280"></canvas>');
  await page.evaluate(async ({ photo, typeface, moving }) => {
    const face = new FontFace("CampaignDisplay", 'url(data:font/ttf;base64,' + typeface + ')');
    await face.load();
    document.fonts.add(face);
    if (moving) {
      const clip = document.createElement("video");
      clip.muted = true;
      const loaded = new Promise(resolve => clip.addEventListener("loadeddata", resolve, { once: true }));
      clip.src = "data:video/mp4;base64," + photo;
      await loaded;
      window.art = clip;
    } else {
      const img = new Image();
      img.src = 'data:image/webp;base64,' + photo;
      await img.decode();
      window.art = img;
    }
  }, { photo: image.toString("base64"), typeface: font.toString("base64"), moving });
  const output = path.join(directory, subject + ".mp4");
  const track = path.join(scratch, subject + ".pcm");
  await writeFile(track, score(subject));
  const encoder = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", "24",
    "-i", "pipe:0", "-f", "f32le", "-ar", "44100", "-ac", "1", "-i", track, "-c:a", "aac", "-b:a", "96k", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
  { stdio: ["pipe", "ignore", "inherit"] });
  const done = once(encoder, "close");
  const frames = 168;
  for (let frame = 0; frame < frames; frame++) {
    const data = await page.evaluate(drawFrame, { subject, t: frame / 24 });
    const buffer = Buffer.from(data.split(",")[1], "base64");
    if (frame === 76) await sharp(buffer).webp({ quality: 87 }).toFile(path.join(directory, subject + "-poster.webp"));
    if (!encoder.stdin.write(buffer)) await once(encoder.stdin, "drain");
  }
  encoder.stdin.end();
  const [code] = await done;
  if (code !== 0) throw new Error("Film export failed for " + subject);
  await page.close();
}

async function drawFrame({ subject, t }) {
  const canvas = document.querySelector("canvas");
  const c = canvas.getContext("2d");
  const photo = window.art;
  const w = canvas.width, h = canvas.height;
  const smooth = n => 1 - (1 - Math.min(1, Math.max(0, n))) ** 3;
  function box(x, y, a, b, color) { c.fillStyle = color; c.fillRect(x, y, a, b); }
  function type(value, x, y, size, color, family = 'CampaignDisplay', align = "right", direction = "rtl") {
    c.save(); c.fillStyle = color; c.font = size + 'px ' + family;
    c.direction = direction; c.textAlign = align; c.fillText(value, x, y); c.restore();
  }
  function line(x1, y1, x2, y2, color, thickness = 2) {
    c.beginPath(); c.strokeStyle = color; c.lineWidth = thickness; c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function cover(x, y, width, height, focus = .5) {
    const scale = Math.max(width / photo.width, height / photo.height);
    const sw = width / scale, sh = height / scale;
    c.drawImage(photo, (photo.width - sw) * focus, (photo.height - sh) * .5, sw, sh, x, y, width, height);
  }
  function botanical(cx, cy, radius, progress, ink) {
    for (let petal = 0; petal < 5; petal++) {
      c.save(); c.translate(cx, cy); c.rotate(petal * Math.PI * .4);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-radius * .85, -radius * .98, -radius * .22, -radius * 1.35, radius * .15, -radius);
      c.bezierCurveTo(radius * .77, -radius * 1.22, radius * .69, -radius * .28, 0, 0);
      c.strokeStyle = ink; c.lineWidth = 2.5; c.setLineDash([radius * 5, radius * 5]);
      c.lineDashOffset = (1 - progress) * radius * 5; c.stroke(); c.restore();
    }
  }
  if (subject === "flowers") {
    const wine = "#47150e", cream = "#ffedcd", citron = "#e8ef93";
    box(0, 0, w, h, wine);
    // Tissue paper opens in three leaves. Each reveals the same stationary photograph.
    for (let panel = 0; panel < 3; panel++) {
      const reveal = smooth((t - panel * .07) / .75);
      c.save(); c.beginPath(); c.rect(panel * w / 3, (1 - reveal) * 1045, w / 3 + 1, 1045 * reveal);
      c.clip(); cover(0, 0, w, 1045); c.restore();
    }
    box(0, 1045, w, 235, cream);
    const header = c.createLinearGradient(0, 0, 0, 240);
    header.addColorStop(0, "rgba(52,7,6,.78)"); header.addColorStop(1, "rgba(52,7,6,0)");
    c.fillStyle = header; c.fillRect(0, 0, w, 240);
    type("גבעול", 670, 92, 69, cream);
    type("FLOWER STUDIO", 42, 77, 20, cream, "monospace", "left", "ltr");
    line(43, 112, 677, 112, cream, 1);
    const closing = smooth((t - 4.35) / .7);
    c.save(); c.beginPath(); c.rect(0, 1039, w, 241); c.clip();
    type("פרחים לשישי.", 675, 1186 + closing * 235, 104, wine);
    type("זר לאיסוף ביום שישי", 675, 1243 + closing * 235, 31, wine);
    type("שומרים זר.", 675, 950 + closing * 235, 103, wine);
    type("ההזמנות פתוחות עד יום חמישי", 675, 1008 + closing * 235, 30, wine);
    c.restore();
    botanical(95, 1112, 36, smooth(t / 1.9), wine);
    if (closing > 0) {
      c.save(); c.globalAlpha = closing;
      box(33, 883, 195, 116, citron);
      type("לאיסוף", 130, 933, 32, wine, "CampaignDisplay", "center");
      type("בשישי", 130, 974, 34, wine, "CampaignDisplay", "center");
      c.restore();
    }
  } else if (subject === "interior") {
    const cream = "#fae3b9", graphite = "#292721", terra = "#a94028";
    const target = t < 1.6 ? 1.9 + t : .25 + t;
    const sought = new Promise(resolve => photo.addEventListener("seeked", resolve, { once: true }));
    photo.currentTime = target;
    await sought;
    box(0, 0, w, h, cream);
    c.drawImage(photo, 0, 0, 720, 1010, 0, 0, 720, 1010);
    const ramp = c.createLinearGradient(0, 0, 0, 170);
    ramp.addColorStop(0, "rgba(31,20,11,.78)"); ramp.addColorStop(1, "rgba(31,20,11,0)");
    c.fillStyle = ramp; c.fillRect(0, 0, w, 170);
    type("צד אור", 675, 81, 54, cream);
    type("MATERIAL STUDY", 40, 65, 21, cream, "monospace", "left", "ltr");
    line(40, 104, 675, 104, cream, 1);
    const reveal = smooth((t - 3.6) / .9);
    c.save(); c.beginPath(); c.rect(0, 1010, w, 185); c.clip();
    type("אותו קיר.", 673, 1131 - 180 * reveal, 101, graphite);
    type("אור אחר.", 673, 1311 - 180 * reveal, 101, terra); c.restore();
    type(t < 4.6 ? "צבע בוחרים באור של הבית." : "לתיאום פגישת צבע בבית", 677, 1240, 37, graphite);
    for(let i = 0; i < 4; i++) box(45 + i * 47, 1158, 37, 37, ["#64351d","#a45122","#c18149","#f1c282"][i]);
  } else {
    const blue = "#082760", bright = "#ecff62", white = "#ffffff";
    box(0, 0, w, h, blue);
    const opening = smooth(t / 1.1);
    for (let strip = 0; strip < 8; strip++) {
      const p = smooth((t - strip * .045) / .85);
      c.save(); c.beginPath(); c.rect(0, strip * 137, w * p, 138); c.clip(); cover(0, 0, w, 1096, .50); c.restore();
    }
    const shade = c.createLinearGradient(0, 0, 0, 550);
    shade.addColorStop(0, "rgba(0,14,55,.83)"); shade.addColorStop(1, "rgba(0,14,55,0)");
    c.fillStyle = shade; c.fillRect(0, 0, w, 550);
    type("קו מים", 674, 90, 64, white);
    type("SWIM CLUB", 42, 70, 22, white, "monospace", "left", "ltr");
    line(43, 115, 677, 115, bright, 2);
    const closing = smooth((t - 4.25) / .75);
    c.save(); c.beginPath(); c.rect(12, 139, 688, 316); c.clip();
    type("עד הקיר", 675, 250 - closing * 320, 115, white);
    type("ובחזרה.", 675, 356 - closing * 320, 115, bright);
    type("מתחילים", 675, 572 - closing * 320, 110, white);
    type("לשחות.", 675, 677 - closing * 320, 112, bright); c.restore();
    box(0, 1095, w, 185, bright);
    type(closing > .48 ? "להרשמה לשיעור היכרות" : "שיעורי שחייה למתחילים", 673, 1232, 46, blue);
    // Lap markings move through the type composition like a starting clock.
    for (let i = 0; i <= 24; i++) {
      const x = 45 + i * 26;
      const length = i % 4 === 0 ? 36 : 15;
      line(x, 1148, x, 1148 - length, blue, i % 4 === 0 ? 3 : 1);
    }
    const lane = Math.min(1, t / 5.8);
    line(43, 1153, 43 + 623 * lane * opening, 1153, blue, 5);
  }
  return canvas.toDataURL("image/jpeg", .93);
}

/** Short original scores. Transients mark the cuts; ambient playback on the site is muted. */
function score(subject) {
  const rate = 44100;
  const audio = new Float32Array(7 * rate);
  let random = 38149657;
  function note(time, hz, duration, gain, texture = 0) {
    const start = Math.round(time * rate);
    const samples = Math.min(Math.round(duration * rate), audio.length - start);
    let air = 0;
    for (let n = 0; n < samples; n++) {
      const t = n / rate;
      const phase = 2 * Math.PI * hz * t;
      random = (1664525 * random + 1013904223) >>> 0;
      air = air * .72 + (random / 4294967296 - .5) * .28;
      const ring = Math.sin(phase) + .24 * Math.sin(phase * 2.003) * Math.exp(-8 * t)
        + .15 * Math.sin(phase * 3.02) * Math.exp(-15 * t);
      const shape = (1 - Math.exp(-140 * t)) * Math.exp(-4.6 * t / duration)
        * Math.min(1, (samples - n) / 350);
      audio[start + n] += gain * shape * (ring + texture * air * Math.exp(-22 * t));
    }
  }
  if (subject === "flowers") {
    for (const [start, pitch] of [[.04,220],[.22,329.63],[.48,392],[1.65,294],[2.45,246.94],[3.22,329.63],[4.38,392],[4.63,440],[5.36,329.63],[6.1,220]])
      note(start, pitch, .91, .18, 1.4);
  } else if (subject === "water") {
    for (const beat of [0,.58,1.16,1.74,2.32,2.9,3.48,4.06,4.64,5.22,5.8,6.38])
      note(beat, beat % 1.16 < .1 ? 98 : 147, .32, .19, 3);
    for (const [start,hz] of [[.11,587],[.30,784],[1.43,392],[3.19,440],[4.32,587],[4.53,784],[6.12,587]])
      note(start, hz, .67, .12);
  } else {
    for (const [start, hz] of [[.13,164.81],[1.66,246.94],[2.72,329.63],[3.7,293.66],[4.22,246.94],[5.45,164.81]])
      note(start, hz, 1.37, .19, 2.4);
  }
  return Buffer.from(audio.buffer);
}
