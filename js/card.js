// מרכיבה את כרטיס הברכה בקנבס: איור מוכן מראש + השם + שורת משנה.
// הכל בדפדפן — אין שום קריאה לשרת.
import { mulberry32 } from './greeting.js';

const W = 1080;
const H = 1350;

// per emotion level: card paper, ink, accent (confetti + subline)
const PALETTE = {
  1: { bg: '#E7ECF1', ink: '#26335E', accent: '#6F86A3', confetti: ['#9FB3C8', '#C9D5E1', '#7E93AE'] },
  2: { bg: '#FDE9DE', ink: '#26335E', accent: '#D9694F', confetti: ['#F4A68C', '#F9CDB6', '#F2B544'] },
  3: { bg: '#FFF2D3', ink: '#26335E', accent: '#C9821E', confetti: ['#F2B544', '#F4A68C', '#E98AA0'] },
  4: { bg: '#FBE4EC', ink: '#26335E', accent: '#C4506C', confetti: ['#E98AA0', '#F6B8C8', '#C9A7E8'] },
  5: { bg: '#EEE4FC', ink: '#26335E', accent: '#7B55C9', confetti: ['#B79BEB', '#F6B8C8', '#8FD3C4', '#F2B544'] },
};

const cache = new Map();
function loadImage(src) {
  if (!cache.has(src)) {
    cache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image ${src}`));
      img.src = src;
    }));
  }
  return cache.get(src);
}

async function fontsReady() {
  // pass Hebrew sample text so the browser fetches the Hebrew unicode-range subset
  await Promise.all([
    document.fonts.load('800 100px Rubik', 'מזל טוב'),
    document.fonts.load('500 40px Rubik', 'יום הולדת'),
    document.fonts.load('400 30px Rubik', 'ברכי'),
  ]);
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function confetti(ctx, colors, seed) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    ctx.save();
    ctx.globalAlpha = 0.35 + rnd() * 0.35;
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI);
    const s = 8 + rnd() * 12;
    if (rnd() < 0.5) {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      rounded(ctx, -s / 2, -s / 5, s, s / 2.5, 3);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Largest font size (≤ max) at which `text` fits in `width`. */
function fit(ctx, text, weight, max, min, width) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px Rubik`;
    if (ctx.measureText(text).width <= width) return size;
  }
  return min;
}

/**
 * @param {{name:string, level:number}} a
 * @param {'a'|'b'} variant  which of the two illustrations for this level
 * @param {string} subline   already-inflected Hebrew subline
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCard(a, variant, subline) {
  const P = PALETTE[a.level];
  const [art, avatar, logo] = await Promise.all([
    loadImage(`img/cards/l${a.level}${variant}.webp`),
    loadImage('img/brachi/avatar.webp'),
    loadImage('img/logo42.png'),
    fontsReady(),
  ]);

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.direction = 'rtl';

  // paper + confetti
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  confetti(ctx, P.confetti, a.level * 101 + (variant === 'b' ? 7 : 0) + a.name.length);

  // photo frame: white mat with a soft shadow, art inset
  const fx = 78, fy = 84, fs = 924;
  ctx.save();
  ctx.shadowColor = 'rgba(38, 51, 94, 0.18)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#FFFFFF';
  rounded(ctx, fx, fy, fs, fs, 44);
  ctx.fill();
  ctx.restore();
  ctx.save();
  rounded(ctx, fx + 16, fy + 16, fs - 32, fs - 32, 30);
  ctx.clip();
  ctx.drawImage(art, fx + 16, fy + 16, fs - 32, fs - 32);
  ctx.restore();

  // בס״ד, top corner, the way Brachi heads every document
  ctx.fillStyle = P.ink;
  ctx.globalAlpha = 0.55;
  ctx.textAlign = 'right';
  ctx.font = '500 26px Rubik';
  ctx.fillText('בס״ד', W - 46, 56);
  ctx.globalAlpha = 1;

  // headline
  const head = `מזל טוב, ${a.name.trim()}!`;
  ctx.textAlign = 'center';
  ctx.fillStyle = P.ink;
  const hs = fit(ctx, head, 800, 104, 56, W - 120);
  ctx.font = `800 ${hs}px Rubik`;
  ctx.fillText(head, W / 2, 1128);

  // subline
  ctx.fillStyle = P.accent;
  const ss = fit(ctx, subline, 500, 44, 28, W - 140);
  ctx.font = `500 ${ss}px Rubik`;
  ctx.fillText(subline, W / 2, 1196);

  // footer: Brachi's signature on the right, 42 on the left
  const fyb = 1262;
  ctx.save();
  ctx.beginPath();
  ctx.arc(W - 88, fyb + 26, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD9C7';
  ctx.fill();
  ctx.clip();
  ctx.drawImage(avatar, W - 118, fyb - 4, 60, 60);
  ctx.restore();
  ctx.fillStyle = P.ink;
  ctx.globalAlpha = 0.75;
  ctx.textAlign = 'right';
  ctx.font = '500 28px Rubik';
  ctx.fillText('ברכי · מחלקת ברכות', W - 132, fyb + 36);
  ctx.globalAlpha = 0.85;
  const lh = 62;
  ctx.drawImage(logo, 70, fyb - 6, (logo.width / logo.height) * lh, lh);
  ctx.globalAlpha = 1;

  return cv;
}

export const toBlob = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));
