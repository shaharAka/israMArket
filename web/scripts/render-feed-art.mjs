/** Eight independently art-directed, silent feed editions. Rebuild locally with Chrome.
 * Each composition is exported as a single portable post with its original Hebrew copy.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const output = path.join(publicDir, "showcase/creative-strip");
const font = (
  await readFile(path.join(publicDir, "fonts/signal/SecularOne.ttf"))
).toString("base64");
const briefs = {
  clay: ["creative-strip/clay-photo.webp"],
  bicycle: ["creative-strip/bicycle-photo.webp"],
  frames: ["creative-strip/frames-photo.webp"],
  coffee: ["creative-strip/coffee-photo.webp"],
  vinyl: [],
  community: ["community-next-box-ai.jpg"],
  software: [],
  linen: ["clothing-weekend-look-ai.jpg", "clothing-size-detail-ai.jpg"],
};
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setContent('<canvas width="864" height="1080"></canvas>');
  await page.evaluate(async (data) => {
    const face = new FontFace(
      "Display",
      "url(data:font/ttf;base64," + data + ")",
    );
    document.fonts.add(await face.load());
  }, font);
  for (const [name, files] of Object.entries(briefs)) {
    const images = await Promise.all(
      files.map(async (file) =>
        (await readFile(path.join(publicDir, "showcase", file))).toString(
          "base64",
        ),
      ),
    );
    const data = await page.evaluate(paint, { name, images });
    await sharp(Buffer.from(data.split(",")[1], "base64"))
      .webp({ quality: 90 })
      .toFile(path.join(output, name + ".webp"));
  }
} finally {
  await browser.close();
}

async function paint({ name, images }) {
  const c = document.querySelector("canvas").getContext("2d");
  const pics = await Promise.all(
    images.map(async (source) => {
      const i = new Image();
      i.src =
        "data:image/" +
        (source.startsWith("/9j") ? "jpeg" : "webp") +
        ";base64," +
        source;
      await i.decode();
      return i;
    }),
  );
  const box = (x, y, w, h, col) => {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  };
  const line = (x, y, xx, yy, col, width = 2) => {
    c.beginPath();
    c.strokeStyle = col;
    c.lineWidth = width;
    c.moveTo(x, y);
    c.lineTo(xx, yy);
    c.stroke();
  };
  const circle = (x, y, r, col) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
  };
  function text(
    str,
    x,
    y,
    size,
    col,
    { font = "Display", align = "right", dir = "rtl", max = 780 } = {},
  ) {
    c.save();
    c.direction = dir;
    c.font = size + "px " + font;
    c.fillStyle = col;
    c.textAlign = align;
    const width = c.measureText(str).width;
    if (width > max) c.font = Math.floor((size * max) / width) + "px " + font;
    c.fillText(str, x, y);
    c.restore();
  }
  function photo(i, x, y, w, h, focusX = 0.5, focusY = 0.5) {
    const pic = pics[i],
      scale = Math.max(w / pic.width, h / pic.height),
      sw = w / scale,
      sh = h / scale;
    c.drawImage(
      pic,
      (pic.width - sw) * focusX,
      (pic.height - sh) * focusY,
      sw,
      sh,
      x,
      y,
      w,
      h,
    );
  }
  const latin = { font: "monospace", align: "left", dir: "ltr" };
  if (name === "clay") {
    const lilac = "#dfd4ee",
      ink = "#40283e";
    box(0, 0, 864, 1080, lilac);
    text("עפר", 793, 91, 62, ink);
    text("HAND / THROWN", 55, 69, 22, ink, latin);
    line(52, 116, 811, 116, ink);
    photo(0, 65, 152, 734, 595, 0.54, 0.52);
    text("כוס מהידיים שלך.", 805, 879, 97, ink, {
      font: "Georgia, serif",
      max: 754,
    });
    line(56, 934, 808, 934, ink);
    text("סדנת אובניים למתחילים", 807, 1007, 40, ink);
    text("לקביעת מקום", 57, 1003, 29, ink, { align: "left" });
  } else if (name === "bicycle") {
    const mint = "#c7f2cf",
      ink = "#151f26";
    box(0, 0, 864, 1080, mint);
    photo(0, 0, 0, 864, 790, 0.5, 0.58);
    box(44, 47, 159, 66, ink);
    text("הילוך", 182, 96, 42, mint);
    c.save();
    c.translate(728, 462);
    c.rotate(-0.15);
    circle(0, 0, 87, "#e9ff57");
    text("מוסך", 0, -3, 33, ink, { align: "center" });
    text("אופניים", 0, 37, 33, ink, { align: "center" });
    c.restore();
    box(0, 771, 864, 309, ink);
    text("ההילוכים קופצים?", 811, 895, 85, mint);
    line(55, 935, 807, 935, "#719083");
    text("בואו לכיוון הילוכים.", 805, 1017, 54, "#effbda");
    for (let i = 0; i < 10; i++)
      line(62 + i * 11, 974, 69 + i * 11, 996, mint, 3);
  } else if (name === "frames") {
    const butter = "#f4e8ac",
      navy = "#182747";
    box(0, 0, 864, 1080, butter);
    photo(0, 0, 0, 864, 1080, 0.48, 0.52);
    text("מבט שני", 806, 96, 70, navy, { font: "Georgia, serif" });
    text("EYEWEAR", 48, 75, 26, navy, latin);
    box(0, 797, 864, 283, butter);
    line(53, 829, 811, 829, navy, 2);
    text("איך זה נראה עליי?", 806, 926, 77, navy, { font: "Georgia, serif" });
    text("בואו למדוד בחנות.", 806, 1010, 42, navy);
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.ellipse(86 + 70 * i, 978, 32, 21, 0, 0, Math.PI * 2);
      c.strokeStyle = navy;
      c.lineWidth = 4;
      c.stroke();
    }
    line(118, 974, 124, 974, navy, 4);
  } else if (name === "coffee") {
    const red = "#aa311c",
      paper = "#f8e8cd";
    box(0, 0, 864, 1080, red);
    photo(0, 0, 0, 864, 689, 0.5, 0.47);
    box(46, 41, 169, 58, paper);
    text("מקור", 191, 85, 40, red);
    text("שישי על הבר.", 802, 814, 100, paper);
    line(57, 856, 807, 856, paper);
    text("טועמים שלושה סוגי קפה.", 805, 933, 49, paper);
    text("שמרו מקום לבוקר טעימות.", 805, 1005, 38, paper);
  } else if (name === "vinyl") {
    const pink = "#ff9dcb",
      night = "#251525",
      glow = "#ecff62";
    box(0, 0, 864, 1080, night);
    c.save();
    c.beginPath();
    c.rect(0, 0, 864, 748);
    c.clip();
    circle(476, 213, 449, pink);
    for (let r = 95; r < 440; r += 9) {
      c.beginPath();
      c.arc(476, 213, r, 0, Math.PI * 2);
      c.strokeStyle = night;
      c.lineWidth = r % 3 === 0 ? 2.5 : 1;
      c.stroke();
    }
    circle(476, 213, 83, glow);
    circle(476, 213, 8, night);
    c.restore();
    box(0, 694, 864, 386, night);
    text("תדר לילה", 807, 800, 94, pink);
    text("בס אחרי חצות.", 807, 902, 90, glow);
    line(54, 945, 807, 945, pink);
    text("חמישי · תקליטים כל הלילה", 807, 1017, 38, pink);
    text("לכרטיסים", 50, 1015, 28, glow, { align: "left" });
  } else if (name === "community") {
    const paper = "#f6edd2",
      ink = "#30473c",
      orange = "#f39b54";
    box(0, 0, 864, 1080, paper);
    text("ארגז לשישי", 802, 89, 64, ink);
    line(58, 118, 809, 118, ink);
    c.save();
    c.translate(420, 436);
    c.rotate(-0.055);
    box(-353, -260, 706, 520, ink);
    photo(0, -340, -248, 680, 490);
    c.restore();
    c.save();
    c.translate(151, 708);
    c.rotate(-0.09);
    box(-111, -40, 222, 80, orange);
    text("מחפשים מתנדבים", 0, 10, 24, ink, { align: "center" });
    c.restore();
    text("יש לכם שעה בשישי?", 809, 886, 75, ink);
    text("מצטרפים לאריזת סלי מזון.", 808, 974, 43, ink);
  } else if (name === "software") {
    const paper = "#edf1e9",
      ink = "#172d43",
      blue = "#344c9b",
      accent = "#ec6744";
    box(0, 0, 864, 1080, paper);
    text("מסלול", 801, 91, 64, ink);
    text("PROJECT PLANNING", 55, 74, 22, ink, latin);
    line(54, 119, 810, 119, ink);
    for (let i = 0; i < 7; i++)
      line(83 + i * 113, 200, 83 + i * 113, 662, "#b9c4be");
    [
      [83, 241, 342, blue],
      [196, 345, 343, accent],
      [423, 449, 228, "#9ab653"],
      [536, 553, 226, ink],
    ].forEach(([x, y, w, col]) => {
      box(x, y, w, 60, col);
      circle(x + 30, y + 30, 7, paper);
    });
    text("דדליין אחד.", 807, 788, 99, ink);
    text("כל הצוות בתמונה.", 807, 886, 94, blue);
    line(56, 929, 807, 929, ink);
    text("קובעים הדגמה של מסלול.", 806, 1003, 45, ink);
  } else if (name === "linen") {
    const cream = "#f5ead8",
      blue = "#183d80";
    box(0, 0, 864, 1080, cream);
    photo(0, 0, 0, 529, 754, 0.52, 0.5);
    photo(1, 535, 0, 329, 754, 0.55, 0.5);
    box(35, 33, 104, 63, cream);
    text("קפל", 122, 81, 43, blue);
    text("גזרה רפויה.", 810, 869, 94, blue, { font: "Georgia, serif" });
    text("בלי לנחש מידה.", 810, 962, 91, blue, { font: "Georgia, serif" });
    text("למדריך המידות של חולצת הפשתן", 806, 1040, 38, blue);
  }
  return c.canvas.toDataURL("image/png");
}
