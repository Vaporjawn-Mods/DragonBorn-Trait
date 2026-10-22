// Drives the Steam Workshop web page for this item, because steamcmd and the
// Steamworks API cannot add extra screenshots.
//
//   node steam_workshop.mjs login    one time: opens a window, YOU sign in to Steam (password + Steam Guard)
//   node steam_workshop.mjs status   headless: are we signed in, and what edit links does the item page show?
//   node steam_workshop.mjs probe    headless: open the edit-images page and save what it contains
//   node steam_workshop.mjs upload   headless: add the screenshots (adds each run, so run once)
//
// The sign-in lives in its own browser profile (~/.cache/ck3-workshop/steam-web-profile).
// Nothing reads your normal browser's cookies, and no password is ever typed by a script.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ITEM = '2759933312';
const ITEM_URL = `https://steamcommunity.com/sharedfiles/filedetails/?id=${ITEM}`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = ['trait-stats.jpg', 'thuum-decision.jpg', 'ingame-event.jpg'].map((f) => path.join(HERE, '..', 'images', f));
const PROFILE = path.join(os.homedir(), '.cache/ck3-workshop/steam-web-profile');
const OUT = path.join(os.homedir(), '.cache/ck3-workshop/web-probe');
fs.mkdirSync(PROFILE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const cmd = process.argv[2];
if (!['login', 'status', 'probe', 'upload'].includes(cmd)) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 11).join('\n'));
  process.exit(1);
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: cmd !== 'login',
  viewport: { width: 1280, height: 900 },
  args: cmd === 'login' ? [] : ['--mute-audio'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

const signedIn = async () => {
  const cookies = await ctx.cookies('https://steamcommunity.com');
  return cookies.some((c) => c.name === 'steamLoginSecure');
};

async function itemEditLinks() {
  await page.goto(ITEM_URL, { waitUntil: 'domcontentloaded' });
  return page.$$eval('a', (as) =>
    as
      .map((a) => ({ text: a.textContent.trim().replace(/\s+/g, ' '), href: a.href }))
      .filter((l) => /edit|manage|preview|upload/i.test(l.href + ' ' + l.text) && /steamcommunity\.com/.test(l.href)),
  );
}

try {
  if (cmd === 'login') {
    await page.goto('https://steamcommunity.com/login/home/?goto=' + encodeURIComponent('/sharedfiles/filedetails/?id=' + ITEM));
    console.log('A browser window opened. Sign in to Steam there (Steam Guard too). Waiting up to 10 minutes...');
    for (let i = 0; i < 300 && !(await signedIn()); i++) await page.waitForTimeout(2000);
    if (!(await signedIn())) throw new Error('timed out waiting for sign-in');
    await page.goto(ITEM_URL, { waitUntil: 'domcontentloaded' });
    console.log('Signed in. You can close the window; the session is saved.');
  } else if (cmd === 'status') {
    console.log('signed in:', await signedIn());
    console.log(JSON.stringify(await itemEditLinks(), null, 2));
  } else if (cmd === 'probe') {
    if (!(await signedIn())) throw new Error('not signed in; run: node steam_workshop.mjs login');
    const links = await itemEditLinks();
    console.log(JSON.stringify(links, null, 2));
    const target = links.find((l) => /image|preview|screenshot/i.test(l.text + l.href)) ?? links.find((l) => /edit/i.test(l.text + l.href));
    if (!target) throw new Error('no edit link found on the item page');
    await page.goto(target.href, { waitUntil: 'domcontentloaded' });
    fs.writeFileSync(path.join(OUT, 'edit-page.html'), await page.content());
    await page.screenshot({ path: path.join(OUT, 'edit-page.png'), fullPage: true });
    console.log('opened', page.url());
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          fileInputs: [...document.querySelectorAll('input[type=file]')].map((i) => ({ id: i.id, name: i.name, accept: i.accept, multiple: i.multiple })),
          buttons: [...document.querySelectorAll('button, input[type=submit], a.btn_green_white_innerfade, a.btn_blue_white_innerfade')].map((b) => (b.value || b.textContent).trim().replace(/\s+/g, ' ')).filter(Boolean),
          forms: [...document.querySelectorAll('form')].map((f) => ({ id: f.id, action: f.action, method: f.method, enctype: f.enctype })),
        })),
        null,
        2,
      ),
    );
    console.log('saved page + screenshot to', OUT);
  } else if (cmd === 'upload') {
    throw new Error('upload is written after probe shows the real form; see probe output');
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await ctx.close();
}
