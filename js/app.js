import {
  LEVELS, LENGTHS, SENDERS, ROLES, TENURES, LOVES, TRAITS,
  compose, brachiAfter, cardSubline, chipText, mulberry32,
} from './greeting.js';
import { renderCard, toBlob } from './card.js';

const chat = document.getElementById('chat');
const composer = document.getElementById('composer');
const statusEl = document.getElementById('status');
const STATUS_IDLE = 'מחלקת ברכות · 42';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 120) : ms));

let runId = 0; // bumps on restart so a stale flow stops talking
class Restarted extends Error {}

// ------------------------------------------------------------------ dom bits
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function scrollDown() {
  requestAnimationFrame(() => chat.scrollTo({ top: chat.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' }));
}

function guard(id) {
  if (id !== runId) throw new Restarted();
}

async function typing(ms, id) {
  const t = el('div', 'msg b typing');
  t.setAttribute('aria-label', 'ברכי מקלידה');
  t.append(el('span'), el('span'), el('span'));
  chat.append(t);
  statusEl.textContent = 'מקלידה…';
  scrollDown();
  await sleep(ms);
  t.remove();
  statusEl.textContent = STATUS_IDLE;
  guard(id);
}

async function say(text, id, delay) {
  await typing(delay ?? Math.min(950, 300 + text.length * 11), id);
  const m = el('div', 'msg b', text);
  chat.append(m);
  scrollDown();
  return m;
}

function me(text) {
  chat.append(el('div', 'msg u', text));
  scrollDown();
}

function sticker(pose, alt) {
  const img = el('img', 'sticker');
  img.src = `img/brachi/${pose}.webp`;
  img.alt = alt;
  chat.append(img);
  scrollDown();
  return img;
}

function button(label, cls = 'chip', onClick) {
  const b = el('button', cls, label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function setComposer(...nodes) {
  composer.replaceChildren(...nodes);
}

// --------------------------------------------------------------- questions

/** Single choice. options: [[value,label], ...]; ghost: [[value,label], ...] */
function askChips(options, ghost = []) {
  return new Promise((resolve) => {
    const wrap = el('div', 'chips');
    const pickIt = (v, label) => {
      setComposer();
      me(label);
      resolve(v);
    };
    for (const [v, label] of options) wrap.append(button(label, 'chip', () => pickIt(v, label)));
    for (const [v, label] of ghost) wrap.append(button(label, 'chip ghost', () => pickIt(v, label)));
    setComposer(wrap);
    wrap.querySelector('button')?.focus({ preventScroll: true });
  });
}

/** Multi choice, up to `max`. Resolves to array of values (maybe empty). */
function askMulti(options, max, { doneLabel = 'זהו, המשך', skipLabel = 'דלגי' } = {}) {
  return new Promise((resolve) => {
    const chosen = new Set();
    const wrap = el('div', 'chips');
    const done = button(doneLabel, 'chip primary', () => finish());
    done.disabled = true;
    const finish = () => {
      const vals = [...chosen];
      setComposer();
      me(vals.map((v) => options.find(([k]) => k === v)[1]).join(' · '));
      resolve(vals);
    };
    for (const [v, label] of options) {
      const b = button(label, 'chip', () => {
        if (chosen.has(v)) chosen.delete(v);
        else if (chosen.size < max) chosen.add(v);
        else return;
        b.setAttribute('aria-pressed', chosen.has(v));
        done.disabled = chosen.size === 0;
        wrap.classList.toggle('full', chosen.size >= max);
      });
      b.setAttribute('aria-pressed', 'false');
      wrap.append(b);
    }
    const skip = button(skipLabel, 'chip ghost', () => {
      setComposer();
      me(skipLabel);
      resolve(null);
    });
    const row = el('div', 'chips-actions');
    row.append(done, skip);
    setComposer(wrap, row);
  });
}

/** Free text. Resolves to the string, or null if skipped. */
function askText({ placeholder = '', skipLabel = null, maxLength = 80 } = {}) {
  return new Promise((resolve) => {
    const form = el('form', 'inrow');
    const input = el('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.autocomplete = 'off';
    input.enterKeyHint = 'send';
    input.setAttribute('aria-label', placeholder || 'תשובה');
    const send = button('', 'send', null);
    send.type = 'submit';
    send.setAttribute('aria-label', 'שליחה');
    send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2z"/></svg>';
    form.append(input, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        return;
      }
      setComposer();
      me(v);
      resolve(v);
    });
    const nodes = [form];
    if (skipLabel) {
      const row = el('div', 'chips-actions');
      row.append(button(skipLabel, 'chip ghost', () => {
        setComposer();
        me(skipLabel);
        resolve(null);
      }));
      nodes.push(row);
    }
    setComposer(...nodes);
    input.focus({ preventScroll: true });
  });
}

/** The emotion dial. Resolves to 1..5. */
function askLevel(start = 3) {
  return new Promise((resolve) => {
    const box = el('div', 'dial');
    const face = el('div', 'dial-face');
    const label = el('div', 'dial-label');
    const note = el('div', 'dial-note');
    const range = el('input');
    range.type = 'range';
    range.min = '1';
    range.max = '5';
    range.step = '1';
    range.value = String(start);
    range.setAttribute('aria-label', 'עוצמת הרגש');
    const ticks = el('div', 'dial-ticks');
    for (let i = 1; i <= 5; i++) {
      const t = button(LEVELS[i].emoji, 'tick', () => {
        range.value = String(i);
        update();
      });
      t.setAttribute('aria-label', LEVELS[i].label);
      ticks.append(t);
    }
    const update = () => {
      const L = LEVELS[+range.value];
      face.textContent = L.emoji;
      label.textContent = L.label;
      note.textContent = L.note;
      box.dataset.level = range.value;
      range.setAttribute('aria-valuetext', L.label);
      [...ticks.children].forEach((t, i) => t.classList.toggle('on', i + 1 === +range.value));
    };
    range.addEventListener('input', update);
    const ok = button('זה, בדיוק', 'chip primary', () => {
      const v = +range.value;
      setComposer();
      me(`${LEVELS[v].emoji} ${LEVELS[v].label}`);
      resolve(v);
    });
    const top = el('div', 'dial-top');
    top.append(face, el('div', 'dial-text'));
    top.lastChild.append(label, note);
    box.append(top, range, ticks, ok);
    update();
    setComposer(box);
  });
}

// ------------------------------------------------------------------- flow

const G = (s, g) => chipText(s, g);

async function run() {
  const id = ++runId;
  const A = { loves: [] };
  chat.querySelectorAll('.msg, .sticker, .result').forEach((n) => n.remove());
  setComposer();

  await say('שלום שלום! אני ברכי 👋', id, 500);
  await say('מנהלת את מחלקת הברכות של 42. יש לי ארבע דקות בין בר מצווה לשבע ברכות — אז בואו נתקתק.', id);
  await say('את מי מברכים היום?', id);
  guard(id);
  A.name = await askText({ placeholder: 'שם החוגג/ת', maxLength: 30 });
  guard(id);

  await say(`${A.name}! שם יפה, בלי עין הרע.`, id);
  await say('הוא או היא? (שאלה דקדוקית בלבד)', id);
  A.gender = await askChips([['m', 'הוא'], ['f', 'היא']]);
  guard(id);
  const g = A.gender;

  await say(G('«ומה הוא עושה|ומה היא עושה» אצלנו?', g), id);
  A.role = await askChips(
    Object.entries(ROLES).filter(([k]) => k !== 'other').map(([k, r]) => [k, r.chip]),
    [['other', ROLES.other.chip], [null, 'דלגי']],
  );
  guard(id);
  if (A.role === 'other') {
    await say('תכתבו לי במילה-שתיים, אני רושמת.', id);
    A.roleFree = await askText({ placeholder: G('«למשל: מנהל המשרד|למשל: מנהלת המשרד»', g), maxLength: 40 });
    guard(id);
  }
  await say(A.role ? G(ROLES[A.role].react, g) : 'בסדר, לא חוקרת.', id);

  await say(G('«כמה זמן הוא איתנו|כמה זמן היא איתנו»?', g), id);
  A.tenure = await askChips(Object.entries(TENURES).map(([k, t]) => [k, G(t.chip, g)]), [[null, 'דלגי']]);
  guard(id);
  if (A.tenure && TENURES[A.tenure].react !== 'רשמתי.') await say(G(TENURES[A.tenure].react, g), id);

  await say(G('«מה הוא הכי אוהב|מה היא הכי אוהבת»? עד שלושה — זו ברכה, לא ביוגרפיה.', g), id);
  const loves = await askMulti(Object.entries(LOVES).map(([k, l]) => [k, l.chip]), 3);
  guard(id);
  A.loves = loves || [];
  await say(loves ? (loves.length === 3 ? 'שלושה, בדיוק כמו שביקשתי. אני אוהבת סדר.' : 'רשמתי.') : 'בסדר, לא חוקרת.', id);

  await say(G('ובמילה אחת — «איך הוא|איך היא»?', g), id);
  A.trait = await askChips(
    Object.entries(TRAITS).filter(([k]) => k !== 'other').map(([k, t]) => [k, G(t.chip, g)]),
    [['other', TRAITS.other.chip], [null, 'דלגי']],
  );
  guard(id);
  if (A.trait === 'other') {
    await say('נו? אני מקשיבה.', id);
    A.traitFree = await askText({ placeholder: G('«למשל: הכי נדיב|למשל: הכי נדיבה»', g), maxLength: 40 });
    guard(id);
  }

  await say(G('יש משהו שרק אנחנו יודעים? בדיחה פנימית, סיפור מהמשרד… (צוחקים «איתו, לא עליו|איתה, לא עליה», כן?)', g), id);
  A.joke = await askText({ placeholder: 'למשל: הפעם ההיא עם המקרן', skipLabel: 'אין, דלגי', maxLength: 90 });
  guard(id);
  await say(A.joke ? 'חחח. טוב, זה נכנס. בזהירות.' : 'בסדר, נשמור על זה נקי.', id);

  await say('עכשיו החלק החשוב. כמה רגש שמים?', id);
  A.level = await askLevel(3);
  guard(id);
  const levelReact = {
    1: 'ענייני. אני מוציאה את החותמת.',
    2: 'חמים ונעים. בדיוק כמו שאני אוהבת.',
    3: 'מחמם לב. בחירה של אנשים עם טעם.',
    4: 'מרגש. אני כבר מרגישה את זה בגרון.',
    5: 'תביאו טישו?! טוב. אני מביאה גליל.',
  };
  await say(levelReact[A.level], id);

  await say('ובאיזה אורך?', id);
  A.length = await askChips(Object.entries(LENGTHS).map(([k, l]) => [k, l.chip]));
  guard(id);

  await say('וממי הברכה?', id);
  A.sender = await askChips(Object.entries(SENDERS).map(([k, s]) => [k, s.chip]));
  guard(id);
  if (A.sender === 'me') {
    await say('ואיך לחתום?', id);
    A.myName = await askText({ placeholder: 'השם שלך', skipLabel: 'בלי שם', maxLength: 30 });
    guard(id);
  }

  await say('מעולה. תנו לי שנייה…', id, 400);
  await produce(A, id);
}

// --------------------------------------------------------------- the result

const WORKING = [
  'פותחת קובץ חדש…',
  'מחפשת את הניסוח המושלם…',
  'סופרת נרות…',
  'בודקת שגיאות כתיב, בעזרת השם…',
  'מגהצת את המשפטים…',
  'מתייעצת עם השכנה…',
  'מעבירה לאישור הנהלה… אושר.',
];
const WORKING_BY_LEVEL = {
  1: ['מחתימה טפסים…', 'מדפיסה בשלושה עותקים…'],
  5: ['מביאה טישו…', 'שמה טישו ליד המקלדת…'],
};

async function produce(A, id) {
  const rnd = mulberry32(Date.now() % 100000);
  const lines = [...(WORKING_BY_LEVEL[A.level] || []), ...WORKING].sort(() => rnd() - 0.5).slice(0, 3);
  if (A.length === 'long') lines.push('יצא ארוך, מכינה כוס מים לנואם…');

  const work = sticker('typing', 'ברכי מקלידה במהירות');
  const bubble = el('div', 'msg b working');
  chat.append(bubble);
  scrollDown();
  for (const line of lines) {
    bubble.textContent = line;
    statusEl.textContent = line;
    await sleep(750);
    guard(id);
  }
  work.remove();
  bubble.remove();
  statusEl.textContent = STATUS_IDLE;

  const state = { A, seed: 1 + Math.floor(rnd() * 9999), variant: rnd() < 0.5 ? 'a' : 'b' };
  const pose = A.level === 5 ? 'tissues' : A.level === 1 ? 'stamp' : 'tada';
  const poseAlt = { tissues: 'ברכי מוחה דמעה', stamp: 'ברכי עם חותמת', tada: 'ברכי מגישה עוגה' }[pose];

  const result = el('section', 'result');
  result.setAttribute('aria-label', 'הברכה');
  const stk = el('img', 'sticker');
  stk.src = `img/brachi/${pose}.webp`;
  stk.alt = poseAlt;

  const textBubble = el('div', 'msg b greeting');
  const text = el('div', 'greeting-text');
  text.contentEditable = 'true';
  text.spellcheck = false;
  text.setAttribute('aria-label', 'טקסט הברכה, אפשר לערוך');
  const copyBtn = button('📋 העתקת הטקסט', 'mini', () => copyText(text, copyBtn));
  const hint = el('span', 'hint', 'אפשר לערוך לפני שמעתיקים');
  const tools = el('div', 'bubble-tools');
  tools.append(copyBtn, hint);
  textBubble.append(text, tools);

  const cardBubble = el('figure', 'msg b cardmsg');
  const img = el('img', 'cardimg');
  img.alt = `כרטיס ברכה ל${A.name}`;
  cardBubble.append(img);

  const after = el('div', 'msg b');
  result.append(stk, textBubble, cardBubble, after);

  await typing(700, id);
  chat.append(result);

  let blob = null;
  let blobUrl = null;
  const drawText = () => {
    text.textContent = compose(state.A, state.seed);
  };
  const drawCard = async () => {
    const cv = await renderCard(state.A, state.variant, cardSubline(state.A));
    blob = await toBlob(cv);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(blob);
    img.src = blobUrl;
  };
  drawText();
  after.textContent = brachiAfter(state.A, state.seed);
  await drawCard();
  guard(id);

  const fileName = () => `ברכה ל${state.A.name}.png`;
  const flash = (node) => {
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
  };

  const share = async () => {
    const file = new File([blob], fileName(), { type: 'image/png' });
    const payload = { files: [file], text: text.innerText };
    if (navigator.canShare && navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
      } catch { /* user closed the sheet */ }
    } else download();
  };
  const download = () => {
    const a = el('a');
    a.href = blobUrl;
    a.download = fileName();
    document.body.append(a);
    a.click();
    a.remove();
  };
  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text.innerText)}`, '_blank', 'noopener');
  };

  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));

  const actions = el('div', 'actions');
  const primary = el('div', 'actions-primary');
  primary.append(
    canShareFiles
      ? button('📤 שיתוף', 'act primary', share)
      : button('⬇️ הורדה', 'act primary', download),
    button('💬 וואטסאפ', 'act', whatsapp),
    button('📋 העתקה', 'act', () => copyText(text, copyBtn)),
  );
  const tweaks = el('div', 'chips tweaks');
  const more = button('➕ יותר רגש', 'chip', () => bump(1));
  const less = button('➖ פחות רגש', 'chip', () => bump(-1));
  const shorter = button('✂️ קצר יותר', 'chip', () => resize(-1));
  const longer = button('📜 ארוך יותר', 'chip', () => resize(1));
  const syncTweaks = () => {
    more.disabled = state.A.level >= 5;
    less.disabled = state.A.level <= 1;
    shorter.disabled = state.A.length === 'short';
    longer.disabled = state.A.length === 'long';
  };
  tweaks.append(
    button('🔄 ניסוח אחר', 'chip', () => {
      state.seed += 1;
      drawText();
      flash(textBubble);
    }),
    button('🎨 תמונה אחרת', 'chip', async () => {
      state.variant = state.variant === 'a' ? 'b' : 'a';
      await drawCard();
      flash(cardBubble);
    }),
    more, less, shorter, longer,
    button('✏️ ברכה חדשה', 'chip ghost', () => run().catch(swallow)),
  );
  actions.append(primary, tweaks);
  setComposer(actions);
  syncTweaks();
  // the action panel just took its height from the chat; land on the top of
  // the result (Brachi + first line of the greeting), not on the card below
  requestAnimationFrame(() => {
    chat.scrollTo({ top: result.offsetTop - 8, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  const LEVEL_QUIPS = {
    1: 'ענייני. לקחתי את כל הרגש ושמתי אותו בתיק.',
    2: 'חמים. הורדתי קצת, שלא יתרגשו יותר מדי.',
    3: 'מחמם לב. אמצע הדרך, כמו שצריך.',
    4: 'מרגש. אני כבר צריכה טישו.',
    5: 'זהו, אין יותר מזה. זה כבר לא רגש, זה מזג אוויר.',
  };
  async function bump(d) {
    state.A = { ...state.A, level: Math.max(1, Math.min(5, state.A.level + d)) };
    syncTweaks();
    drawText();
    after.textContent = LEVEL_QUIPS[state.A.level];
    const np = state.A.level === 5 ? 'tissues' : state.A.level === 1 ? 'stamp' : 'tada';
    stk.src = `img/brachi/${np}.webp`;
    await drawCard();
    flash(textBubble);
    flash(cardBubble);
  }
  function resize(d) {
    const order = ['short', 'medium', 'long'];
    const i = Math.max(0, Math.min(2, order.indexOf(state.A.length) + d));
    state.A = { ...state.A, length: order[i] };
    syncTweaks();
    drawText();
    after.textContent = i === 2 ? 'ארוך יותר. אני מביאה כוס מים לנואם.' : i === 0 ? 'קצר ולעניין. ככה אני אוהבת.' : 'באמצע. לא קצר מדי, לא נאום.';
    flash(textBubble);
  }
}

async function copyText(node, btn) {
  const t = node.innerText;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const ta = el('textarea');
    ta.value = t;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = '✓ הועתק';
  statusEl.textContent = 'הועתק. תדביקו בזהירות.';
  setTimeout(() => {
    btn.textContent = old;
    statusEl.textContent = STATUS_IDLE;
  }, 1800);
}

function swallow(e) {
  if (!(e instanceof Restarted)) console.error(e);
}

document.getElementById('restart').addEventListener('click', () => run().catch(swallow));
run().catch(swallow);
