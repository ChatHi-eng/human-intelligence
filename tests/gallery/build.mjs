// Builds tests/gallery/every-page.html from the pictures and lists that
// capture.spec.ts leaves in tests/gallery/shots. Run after a capture:
//   node tests/gallery/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');

const entries = [];
for (let n = 1; n <= 9; n += 1) {
  const file = path.join(shots, `manifest-${n}.json`);
  if (fs.existsSync(file)) entries.push(...JSON.parse(fs.readFileSync(file, 'utf8')));
}

// Who each page is written for. Kept here, by picture number, because it is a
// judgement about the wording on the page, not something the app knows.
const EXPERTS = 'experts';
const CUSTOMERS = 'customers';
const BOTH = 'both';
const ANYONE = 'anyone';
const audienceByNumber = {
  101: BOTH, 102: ANYONE, 103: ANYONE, 104: ANYONE, 105: CUSTOMERS,
  201: BOTH, 202: BOTH, 203: EXPERTS, 204: CUSTOMERS, 205: CUSTOMERS, 206: CUSTOMERS,
  207: CUSTOMERS, 208: CUSTOMERS, 209: CUSTOMERS, 210: CUSTOMERS, 211: BOTH,
  212: ANYONE, 213: ANYONE, 214: ANYONE,
  401: CUSTOMERS, 402: CUSTOMERS, 403: CUSTOMERS, 404: CUSTOMERS, 405: CUSTOMERS,
  515: BOTH, 601: BOTH, 602: ANYONE, 603: ANYONE, 604: ANYONE, 605: ANYONE,
};
const audienceLabel = {
  [EXPERTS]: 'Speaks to experts',
  [CUSTOMERS]: 'Speaks to customers',
  [BOTH]: 'Speaks to both',
  [ANYONE]: 'Account or legal',
};
const audienceOf = (file) => {
  const n = Number(file.slice(0, 3));
  // Everything in the applying (3xx) and expert (5xx) walks is for experts.
  return audienceByNumber[n] ?? EXPERTS;
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const groups = [];
for (const e of entries) {
  const name = e.group.replace(/^\d+\.\s*/, '');
  let g = groups.find((x) => x.name === name);
  if (!g) groups.push((g = { name, id: slug(name), items: [] }));
  g.items.push({ ...e, audience: audienceOf(e.file), id: `p${e.file.slice(0, 3)}` });
}

const count = (aud) => entries.filter((e) => audienceOf(e.file) === aud).length;
const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const card = (item) => `
      <figure class="page" id="${item.id}" data-audience="${item.audience}">
        <button class="shot" type="button" data-full="shots/${esc(item.file)}" data-title="${esc(item.title)}" aria-label="Open ${esc(item.title)} at full size">
          <img src="shots/${esc(item.file)}" alt="Screenshot: ${esc(item.title)}" loading="lazy">
        </button>
        <figcaption>
          <h3>${esc(item.title)}</h3>
          <p class="meta"><span class="tag tag-${item.audience}">${audienceLabel[item.audience]}</span><code>${esc(item.route)}</code></p>
          ${item.note ? `<p class="note">${esc(item.note)}</p>` : ''}
        </figcaption>
      </figure>`;

const html = `<title>Palam Every Page</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap">
<style>
  /* Layout: a review wall. A short findings note, then every screen as a
     phone-width picture in a wrapping grid, grouped by who is looking at it. */
  :root {
    --bg: #f4f8f6;
    --surface: #ffffff;
    --ink: #12211b;
    --ink-soft: #4d6159;
    --line: #d5e2dc;
    --accent: #0f6e56;
    --accent-ink: #ffffff;
    --mint: #e1f5ee;
    --experts-bg: #e1f5ee;   --experts-fg: #0b5642;
    --customers-bg: #e4ecfb; --customers-fg: #1f4391;
    --both-bg: #f6ecd2;      --both-fg: #6b4a05;
    --anyone-bg: #e9eeec;    --anyone-fg: #4d6159;
    --shadow: 0 1px 2px rgba(18, 33, 27, 0.06), 0 8px 24px rgba(18, 33, 27, 0.06);
    --display: 'Manrope', 'Segoe UI', system-ui, sans-serif;
    --body: 'Manrope', 'Segoe UI', system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e1613; --surface: #17221e; --ink: #e8f1ed; --ink-soft: #9db3aa; --line: #2a3a34;
      --accent: #4fc3a1; --accent-ink: #06231b; --mint: #17352c;
      --experts-bg: #17352c; --experts-fg: #8fe0c5;
      --customers-bg: #1b2a4a; --customers-fg: #a9c2f5;
      --both-bg: #3a2f12; --both-fg: #ecd08a;
      --anyone-bg: #24312c; --anyone-fg: #a9bbb3;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0e1613; --surface: #17221e; --ink: #e8f1ed; --ink-soft: #9db3aa; --line: #2a3a34;
    --accent: #4fc3a1; --accent-ink: #06231b; --mint: #17352c;
    --experts-bg: #17352c; --experts-fg: #8fe0c5;
    --customers-bg: #1b2a4a; --customers-fg: #a9c2f5;
    --both-bg: #3a2f12; --both-fg: #ecd08a;
    --anyone-bg: #24312c; --anyone-fg: #a9bbb3;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
    color-scheme: dark;
  }

  * { box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: var(--body);
    font-size: 15px;
    line-height: 1.55;
    padding-block: 32px 64px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  .wrap { max-width: 1240px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
  h1, h2, h3 { font-family: var(--display); text-wrap: balance; margin: 0; }
  h1 { font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
  h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  h3 { font-size: 15px; font-weight: 600; }
  p { margin: 0; }
  a { color: var(--accent); }
  code { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); overflow-wrap: anywhere; }

  header { display: flex; flex-direction: column; gap: 10px; }
  .wordmark { font-family: var(--display); font-weight: 700; font-size: 20px; color: var(--accent); letter-spacing: -0.02em; }
  .lede { color: var(--ink-soft); max-width: 68ch; }

  .findings { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .findings ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; max-width: 78ch; }
  .findings li::marker { color: var(--accent); font-weight: 700; }

  .controls { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding-block: 10px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
  body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .row-label { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); margin-right: 4px; }
  .chip { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; text-decoration: none; }
  .chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .chip:focus-visible, .shot:focus-visible, .close:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .chip .n { font-weight: 500; opacity: 0.75; margin-left: 4px; font-variant-numeric: tabular-nums; }

  section { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 120px; }
  .section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
  .section-head .n { color: var(--ink-soft); font-size: 13px; font-variant-numeric: tabular-nums; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; align-items: start; }
  .page { margin: 0; display: flex; flex-direction: column; gap: 10px; min-width: 0; scroll-margin-top: 130px; }
  .shot { display: block; width: 100%; padding: 0; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--surface); box-shadow: var(--shadow); cursor: zoom-in; max-height: 520px; position: relative; }
  .shot img { display: block; width: 100%; height: auto; }
  .shot.tall::after { content: "Open to see the rest"; position: absolute; inset: auto 0 0; padding: 36px 12px 10px; font: 600 12px var(--body); color: var(--ink); text-align: center; background: linear-gradient(to bottom, transparent, var(--surface) 62%); }
  figcaption { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
  .tag { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 3px 8px; border-radius: 6px; }
  .tag-experts { background: var(--experts-bg); color: var(--experts-fg); }
  .tag-customers { background: var(--customers-bg); color: var(--customers-fg); }
  .tag-both { background: var(--both-bg); color: var(--both-fg); }
  .tag-anyone { background: var(--anyone-bg); color: var(--anyone-fg); }
  .note { font-size: 13px; color: var(--ink-soft); }
  .page:target .shot { outline: 3px solid var(--accent); outline-offset: 3px; }

  dialog { border: 0; padding: 0; background: var(--surface); color: var(--ink); border-radius: 16px; width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 24px); box-shadow: var(--shadow); }
  dialog::backdrop { background: rgba(8, 16, 13, 0.7); }
  .dialog-bar { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .dialog-bar h3 { font-size: 14px; }
  .close { font: inherit; font-weight: 600; font-size: 13px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
  dialog img { display: block; width: 100%; height: auto; }
  footer { color: var(--ink-soft); font-size: 13px; max-width: 78ch; }
</style>

<div class="wrap">
  <header>
    <span class="wordmark">palam</span>
    <h1>Every page, as it stands today</h1>
    <p class="lede">${entries.length} screens from the app and the website, taken on ${today} at phone size. Each one is tagged by who its wording speaks to, so you can see where the app talks to experts, to customers, or to both. The people and numbers in the pictures are samples, not real accounts.</p>
  </header>

  <div class="findings">
    <h2>Where things stand</h2>
    <ol>
      <li><strong>The first screen now speaks to both sides.</strong> <a href="#p101">Welcome</a> opens with "Talk to a human who knows" for customers, then invites people to apply as an expert. It matches the website's <a href="#p601">landing page</a>.</li>
      <li><strong>Customer booking is on.</strong> An <a href="#p206">expert profile</a> has a Book session button, and the <a href="#p207">booking page</a> offers paid sessions and free 15-minute intros.</li>
      <li><strong>Payments are still in test mode.</strong> The <a href="#p208">payment step</a> says so and gives the test card. Real cards are refused until Stripe is switched to live keys.</li>
      <li><strong>A new account lands on Home, not in the application.</strong> <a href="#p201">Home</a> shows the experts, with a "Become an expert" card at the top for anyone who has not applied.</li>
    </ol>
  </div>

  <div class="controls">
    <div class="row" role="group" aria-label="Filter by who the page speaks to">
      <span class="row-label">Show</span>
      <button class="chip" type="button" id="f-all" data-filter="all" aria-pressed="true">All<span class="n">${entries.length}</span></button>
      <button class="chip" type="button" id="f-experts" data-filter="experts" aria-pressed="false">Experts<span class="n">${count(EXPERTS)}</span></button>
      <button class="chip" type="button" id="f-customers" data-filter="customers" aria-pressed="false">Customers<span class="n">${count(CUSTOMERS)}</span></button>
      <button class="chip" type="button" id="f-both" data-filter="both" aria-pressed="false">Both<span class="n">${count(BOTH)}</span></button>
      <button class="chip" type="button" id="f-anyone" data-filter="anyone" aria-pressed="false">Account or legal<span class="n">${count(ANYONE)}</span></button>
    </div>
    <div class="row">
      <span class="row-label">Jump to</span>
      ${groups.map((g) => `<a class="chip" href="#${g.id}">${esc(g.name)}</a>`).join('\n      ')}
    </div>
  </div>

  ${groups
    .map(
      (g) => `<section id="${g.id}">
    <div class="section-head"><h2>${esc(g.name)}</h2><span class="n">${g.items.length} screens</span></div>
    <div class="grid">${g.items.map(card).join('')}
    </div>
  </section>`,
    )
    .join('\n\n  ')}

  <footer>
    <p>Not shown: the emails Palam sends, the Stripe payment and payout pages, the video call room, and the cover image editor. Messaging and phone sessions are switched off and have no screens to show.</p>
  </footer>
</div>

<dialog id="viewer" aria-labelledby="viewer-title">
  <div class="dialog-bar">
    <h3 id="viewer-title"></h3>
    <button class="close" type="button" id="viewer-close">Close</button>
  </div>
  <img id="viewer-img" alt="">
</dialog>

<script>
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewer-img');
  const viewerTitle = document.getElementById('viewer-title');
  document.querySelectorAll('.shot').forEach((b) => {
    const img = b.querySelector('img');
    const mark = () => { if (img.naturalHeight / img.naturalWidth > 2.2) b.classList.add('tall'); };
    if (img.complete) mark(); else img.addEventListener('load', mark);
    b.addEventListener('click', () => {
      viewerImg.src = b.dataset.full;
      viewerImg.alt = 'Screenshot: ' + b.dataset.title;
      viewerTitle.textContent = b.dataset.title;
      viewer.showModal();
      viewer.scrollTop = 0;
    });
  });
  document.getElementById('viewer-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });

  const chips = document.querySelectorAll('[data-filter]');
  const apply = (filter) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
    document.querySelectorAll('.page').forEach((p) => { p.hidden = filter !== 'all' && p.dataset.audience !== filter; });
    document.querySelectorAll('section').forEach((s) => { s.hidden = !s.querySelector('.page:not([hidden])'); });
  };
  chips.forEach((c) => c.addEventListener('click', () => apply(c.dataset.filter)));
  // A link to one screen shows it even if a filter was hiding it.
  window.addEventListener('hashchange', () => {
    const target = document.getElementById(location.hash.slice(1));
    if (target && target.hidden) { apply('all'); target.scrollIntoView(); }
  });
</script>
`;

fs.writeFileSync(path.join(here, 'every-page.html'), html);
console.log(`every-page.html: ${entries.length} screens in ${groups.length} groups`);
console.log(JSON.stringify(entries.map((e) => `shots/${e.file}`)));
