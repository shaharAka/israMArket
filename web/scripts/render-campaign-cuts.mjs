/** Re-cut the original silent social films with local Chrome and ffmpeg.
 * Run from any directory. The campaign language stays Hebrew across UI locales.
 */
import { once } from "node:events";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const directory = path.join(publicDir, "showcase/campaign-cuts");
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const subject of ["flowers", "water", "interior", "ink"]) await render(subject);
  await previews();
} finally {
  await browser.close();
}

async function render(subject) {
  const page = await browser.newPage();
  const moving = subject === "interior" || subject === "ink";
  const input = subject === "ink" ? path.join(publicDir, "showcase/dyo-tari/film.mp4") : moving ? path.join(publicDir, "showcase/designer-human-motion-ai.mp4") : path.join(directory, subject + "-art.webp");
  const image = await readFile(input);
  const detail = moving ? null : await readFile(path.join(directory, subject + "-detail.webp"));
  const font = await readFile(path.join(publicDir, "fonts/signal/SecularOne.ttf"));
  await page.setContent('<canvas width="720" height="1280"></canvas>');
  await page.evaluate(async ({ photo, typeface, moving, alternate }) => {
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
      const detailPhoto = new Image();
      detailPhoto.src = 'data:image/webp;base64,' + alternate;
      await detailPhoto.decode();
      window.detail = detailPhoto;
    }
  }, { photo: image.toString("base64"), typeface: font.toString("base64"), moving, alternate: detail?.toString("base64") });
  const output = path.join(directory, subject === "ink" ? "ink-preview.mp4" : subject + ".mp4");
  const encoder = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", "24",
    "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
  { stdio: ["pipe", "ignore", "inherit"] });
  const done = once(encoder, "close");
  const frames = 168;
  for (let frame = 0; frame < frames; frame++) {
    const data = await page.evaluate(drawFrame, { subject, t: frame / 24 });
    const buffer = Buffer.from(data.split(",")[1], "base64");
    if (subject !== "ink" && frame === (subject === "flowers" ? 95 : subject === "water" ? 32 : 76)) await sharp(buffer).webp({ quality: 87 }).toFile(path.join(directory, subject + "-poster.webp"));
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
  function cover(x, y, width, height, focus = .5, source = photo) {
    const scale = Math.max(width / source.width, height / source.height);
    const sw = width / scale, sh = height / scale;
    c.drawImage(source, (source.width - sw) * focus, (source.height - sh) * .5, sw, sh, x, y, width, height);
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
  // Conversion lines sit within x 84–600 / y 360–960, clear of feed captions and controls.
  function safeType(value, y, size, color, align = "right") {
    c.save(); c.direction = "rtl"; c.textAlign = align; c.fillStyle = color;
    c.font = size + "px CampaignDisplay";
    const width = c.measureText(value).width;
    if (width > 516) c.font = Math.floor(size * 516 / width) + "px CampaignDisplay";
    c.fillText(value, align === "right" ? 600 : 342, y);
    c.restore();
  }
  if (subject === "flowers") {
    const wine = "#47150e", cream = "#ffedcd", citron = "#e8ef93";
    box(0, 0, w, h, wine);
    if (t < 1.55) {
      // Petal texture, the tying gesture, then the completed handoff make three separate plates.
      c.drawImage(photo, 40, 92, 610, 820, 0, 0, w, 968);
      box(0, 968, w, 312, cream);
      safeType("פרחים", 725, 126, cream);
      safeType("לשישי.", 846, 126, cream);
      botanical(337, 1114, 75, smooth(t / .95), wine);
    } else if (t < 3.25) {
      cover(0, 0, w, 1280, .49, window.detail);
      box(83, 850, 441, 85, cream);
      type("אורזים בסטודיו.", 493, 910, 48, wine);
    } else if (t < 4.65) {
      cover(0, 0, w, 1090);
      box(0, 1090, w, 190, cream);
      botanical(100, 1179, 43, 1, wine);
      type("פרחים לשישי.", 638, 1216, 83, wine);
    } else {
      // An order slip is the last shot. The name of the action is central and held for reading.
      cover(0, 0, w, h, .5, window.detail);
      const reveal = smooth((t - 4.65) / .28);
      c.save(); c.translate(0, (1 - reveal) * 620);
      box(0, 302, w, 702, cream);
      line(80, 386, 637, 386, wine, 1);
      botanical(132, 504, 35, 1, wine);
      safeType("גבעול", 530, 45, wine);
      safeType("רוצים זר לשישי?", 659, 76, wine);
      safeType("שלחו לנו הודעה", 747, 69, wine);
      box(83, 788, 520, 78, citron);
      safeType("עד חמישי. איסוף בשישי.", 842, 40, wine, "center");
      line(80, 927, 637, 927, wine, 1);
      c.restore();
    }
    if (t < 4.65) {
      const shade = c.createLinearGradient(0, 0, 0, 170);
      shade.addColorStop(0, "rgba(52,7,6,.77)"); shade.addColorStop(1, "rgba(52,7,6,0)");
      c.fillStyle = shade; c.fillRect(0, 0, w, 170);
      type("גבעול", 661, 94, 65, cream);
      type("FLOWER STUDIO", 43, 77, 20, cream, "monospace", "left", "ltr");
      line(43, 114, 673, 114, cream, 1);
    }
  } else if (subject === "ink") {
    const cream = "#f7eecb", blue = "#193681", orange = "#ec5027";
    const sought = new Promise(resolve => photo.addEventListener("seeked", resolve, { once: true }));
    photo.currentTime = .003 + t;
    await sought;
    box(0, 0, w, h, cream);
    type("דיו טרי", 662, 96, 62, blue);
    type("HAIFA PRINT CLUB", 46, 75, 23, blue, "monospace", "left", "ltr");
    line(44, 120, 671, 120, blue, 2);
    safeType("שני צבעים.", 272, 103, blue);
    safeType("דג אחד.", 382, 118, orange);
    c.drawImage(photo, 0, 133, 762, 453, 0, 424, 720, 445);
    box(0, 903, w, 377, blue);
    safeType("ערב הדפס רשת בחיפה", 1011, 59, cream);
    type("19:00", 72, 1140, 89, cream, "monospace", "left", "ltr");
    type("להרשמה לסדנה", 642, 1127, 35, cream);
  } else if (subject === "interior") {
    const cream = "#fae3b9", graphite = "#292721", terra = "#92391f";
    const sought = new Promise(resolve => photo.addEventListener("seeked", resolve, { once: true }));
    photo.currentTime = .55 + t;
    await sought;
    box(0, 0, w, h, cream);
    // One continuous take. Both sample strips come from this same frame of the actual wall.
    c.drawImage(photo, 0, 80, 720, 750, 0, 0, 720, 750);
    c.drawImage(photo, 15, 30, 77, 48, 0, 1084, 360, 196);
    c.drawImage(photo, 503, 158, 77, 48, 360, 1084, 360, 196);
    const ramp = c.createLinearGradient(0, 0, 0, 186);
    ramp.addColorStop(0, "rgba(31,20,11,.80)"); ramp.addColorStop(1, "rgba(31,20,11,0)");
    c.fillStyle = ramp; c.fillRect(0, 0, w, 186);
    type("צד אור", 668, 87, 58, cream);
    type("MATERIAL STUDY", 40, 66, 21, cream, "monospace", "left", "ltr");
    line(40, 110, 675, 110, cream, 1);
    type("בצל", 279, 1172, 45, cream);
    type("בשמש", 598, 1172, 45, graphite);
    if (t < 4.32) {
      safeType(t < 2.05 ? "אותו גוון." : "אור אחר לגמרי.", 873, 86, t < 2.05 ? graphite : terra);
      safeType("איך הוא ייראה אצלכם בסלון?", 947, 40, graphite);
    } else {
      safeType("לפני שצובעים,", 833, 64, terra);
      safeType("מנסים את הגוונים בבית.", 897, 54, graphite);
      safeType("שלחו הודעה לקביעת ייעוץ צבע.", 961, 37, graphite);
    }
  } else {
    const blue = "#082760", bright = "#ecff62", white = "#ffffff";
    box(0, 0, w, h, blue);
    const underwater = t >= 2.04 && t < 4.56;
    if (t < 4.56) {
      cover(0, 0, w, h, underwater ? .48 : .5, underwater ? window.detail : photo);
      const shade = c.createLinearGradient(0, 0, 0, 400);
      shade.addColorStop(0, "rgba(0,14,55,.78)"); shade.addColorStop(1, "rgba(0,14,55,0)");
      c.fillStyle = shade; c.fillRect(0, 0, w, 400);
      if (underwater) {
        box(0, 824, 637, 111, bright);
        type("התנועה שמתחת למים.", 603, 900, 52, blue);
        line(0, 947, 400 * smooth((t - 2.04) / 1.2), 947, white, 3);
      } else {
        safeType("עד הקיר", 287, 105, white);
        safeType("ובחזרה.", 393, 111, bright);
      }
    } else {
      cover(0, 0, w, 495, .5, window.detail);
      cover(0, 939, w, 341, .5, photo);
      const slide = smooth((t - 4.56) / .25);
      c.save(); c.translate(w * (1 - slide), 0);
      box(0, 388, w, 575, bright);
      for (let i = 0; i <= 23; i++) {
        const x = 44 + i * 27;
        line(x, 446, x, i % 4 === 0 ? 414 : 433, blue, i % 4 === 0 ? 3 : 1);
      }
      safeType("סדנת חתירה", 608, 92, blue);
      safeType("לשחיינים.", 701, 91, blue);
      line(83, 753, 600, 753, blue, 2);
      safeType("שלחו הודעה להרשמה", 838, 47, blue);
      c.restore();
    }
    type("קו מים", 665, 91, 60, white);
    type("SWIM CLUB", 42, 72, 22, white, "monospace", "left", "ltr");
    line(43, 115, 677, 115, bright, 2);
  }
  return canvas.toDataURL("image/jpeg", .93);
}


// Separate inline framing preserves the full-size master when the visitor opens a film.
async function previews() {
  const transcode = async args => {
    const child = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "inherit"] });
    const [code] = await once(child, "close");
    if (code) throw new Error("Inline film export failed");
  };
  const settings = ["-an", "-c:v", "libx264", "-crf", "25", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  await transcode(["-loop", "1", "-framerate", "24", "-t", "2.0", "-i", path.join(directory, "flowers-art.webp"),
    "-loop", "1", "-framerate", "24", "-t", "2.25", "-i", path.join(directory, "flowers-detail.webp"),
    "-loop", "1", "-framerate", "24", "-t", "2.75", "-i", path.join(directory, "flowers-art.webp"),
    "-filter_complex", "[0:v]crop=700:423:35:80,scale=800:484,setsar=1[a];[1:v]scale=800:-1,crop=800:484:0:300,setsar=1[b];[2:v]scale=800:-1,crop=800:484:0:220,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0",
    ...settings, path.join(directory, "flowers-hero.mp4")]);
}
