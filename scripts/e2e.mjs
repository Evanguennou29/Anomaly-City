// Test de bout en bout (headless) d'ANOMALY CITY.
// - Sert le build `dist/` sous le sous-chemin /anomaly-city/ (comme GitHub Pages).
// - Lance Edge en headless, vérifie le chargement sans erreur console,
//   déclenche les trois incidents, teste la réinitialisation et le rendu mobile.
// Usage : npm run build && node scripts/e2e.mjs
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const SUBPATH = '/anomaly-city';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function findEdge() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('Aucun navigateur Chromium (Edge/Chrome) trouvé.');
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === SUBPATH) pathname = '/';
      else if (pathname.startsWith(SUBPATH + '/')) pathname = pathname.slice(SUBPATH.length);
      else {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      if (pathname === '/') pathname = '/index.html';
      const filePath = join(DIST, pathname);
      if (!filePath.startsWith(DIST)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, timeout, label, ...args) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 200 }, ...args);
  } catch (err) {
    throw new Error(`Échec en attendant « ${label} » : ${err?.message ?? err}`);
  }
}

// Clic fiable : trouve et clique le bouton dans la même évaluation synchrone,
// ce qui évite les courses avec les re-rendus React (8 Hz).
async function clickButtonByText(page, text) {
  const ok = await page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll('button'));
    const el = els.find((e) => (e.textContent || '').includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`Bouton introuvable : ${text}`);
}

const detectionCount = (page) =>
  page.evaluate(() => (document.body.innerText.match(/Anomalie détectée/g) || []).length);

const anomalyDistricts = (page) =>
  page.evaluate(() => document.querySelectorAll('.district-card.status-anomaly').length);

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('dist/ introuvable — lancez `npm run build` avant ce script.');
  }
  await mkdir(join(__dirname, '..', 'docs'), { recursive: true });

  const { server, port } = await startServer();
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`[e2e] serveur statique sur ${BASE}${SUBPATH}/`);

  const browser = await puppeteer.launch({
    executablePath: findEdge(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const consoleErrors = [];
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const failures = [];
  const check = (cond, label) => {
    if (cond) console.log(`  ✔ ${label}`);
    else {
      console.log(`  ✘ ${label}`);
      failures.push(label);
    }
  };

  try {
    // 1) Chargement + entraînement du modèle (bouton « Lancer » activé).
    await page.setViewport({ width: 1360, height: 900 });
    await page.goto(`${BASE}${SUBPATH}/`, { waitUntil: 'domcontentloaded' });
    await waitFor(
      page,
      () => {
        const b = Array.from(document.querySelectorAll('button')).find((e) =>
          (e.textContent || '').includes('Lancer la simulation'),
        );
        return !!b && !b.disabled;
      },
      90000,
      "entraînement du modèle terminé (bouton Lancer activé)",
    );
    check(true, "le modèle s'entraîne dans le navigateur et le bouton « Lancer » devient actif");

    // Attendre la fin de l'auto-évaluation (métriques réellement calculées).
    await waitFor(page, () => document.body.innerText.toLowerCase().includes('précision'), 20000, 'métriques calculées');
    check(true, 'les métriques réelles (précision/rappel/F1) sont calculées et affichées');

    // 2) Lancer la simulation.
    await clickButtonByText(page, 'Lancer la simulation');
    await waitFor(page, () => document.body.innerText.includes('Simulation lancée'), 5000, 'simulation lancée');
    await sleep(1500);
    check(true, 'simulation démarrée');

    // 3) Les trois scénarios, chacun isolé par une réinitialisation.
    const scenarios = ['Panne électrique', 'Embouteillage', 'Attaque réseau'];
    for (const label of scenarios) {
      const before = await detectionCount(page);
      await clickButtonByText(page, label);
      // NB : `label` est passé en ARGUMENT (et non interpolé dans le corps de la
      // fonction) car puppeteer sérialise la fonction par toString() ; une variable
      // de fermeture serait `undefined` côté page.
      await waitFor(page, (t) => document.body.innerText.includes(t + ' déclenché'), 4000, `${label} déclenché`, label);
      await waitFor(
        page,
        (bc) => (document.body.innerText.match(/Anomalie détectée/g) || []).length > bc,
        12000,
        `détection après ${label}`,
        before,
      );
      check((await anomalyDistricts(page)) > 0, `${label} : détection + quartiers marqués en anomalie`);

      // Capture d'écran du premier incident en cours (pour le README).
      if (label === scenarios[0]) {
        await sleep(600);
        await page.screenshot({ path: join(__dirname, '..', 'docs', 'screenshot.png') });
      }

      // Réinitialisation (depuis l'état "en cours").
      await clickButtonByText(page, 'Réinitialiser');
      await waitFor(page, () => document.body.innerText.includes('réinitialisée'), 5000, 'réinitialisation');
      await waitFor(page, () => document.querySelector('.chart-empty') !== null, 5000, 'historique vidé');
    }

    // 4) État après réinitialisation.
    const overlayAfter = await page.evaluate(() => !!document.querySelector('.stage-overlay'));
    check(overlayAfter, "la simulation revient à l'écran d'accueil après réinitialisation");
    check((await anomalyDistricts(page)) === 0, 'aucun quartier ne reste en anomalie après réinitialisation');
    check(
      await page.evaluate(() => document.body.innerText.includes('réinitialisée')),
      'le journal consigne la réinitialisation',
    );

    // 5) Rendu mobile.
    const mobile = await browser.newPage();
    await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobile.goto(`${BASE}${SUBPATH}/`, { waitUntil: 'domcontentloaded' });
    await waitFor(
      mobile,
      () => {
        const b = Array.from(document.querySelectorAll('button')).find((e) =>
          (e.textContent || '').includes('Lancer la simulation'),
        );
        return !!b && !b.disabled;
      },
      90000,
      'entraînement sur mobile',
    );
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(overflow <= 1, `pas de débordement horizontal sur mobile (delta=${overflow}px)`);
    const cols = await mobile.evaluate(() =>
      getComputedStyle(document.querySelector('.main-layout')).gridTemplateColumns.split(' ').length,
    );
    check(cols === 1, `mise en page mobile sur une colonne (${cols} colonne(s))`);
    await mobile.screenshot({ path: join(__dirname, '..', 'docs', 'screenshot-mobile.png') });
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }

  const fatalConsole = consoleErrors.filter((e) => !/favicon|net::ERR/i.test(e));
  if (fatalConsole.length) {
    console.log('\n[e2e] Erreurs console :');
    for (const e of fatalConsole) console.log('  - ' + e);
    failures.push(`erreurs console : ${fatalConsole.length}`);
  }

  console.log('\n[e2e] Résultat : ' + (failures.length ? 'ÉCHEC' : 'SUCCÈS'));
  if (failures.length) {
    for (const f of failures) console.log('  ✘ ' + f);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[e2e] Erreur :', err);
  process.exitCode = 1;
});
