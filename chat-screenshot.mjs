import puppeteer from 'puppeteer-core';

const CHROMIUM = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'chatscreen_qy9kpw@test.com', password: 'ChatTest123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  const user = loginData.user;
  console.log('Got token for', user.name);

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 720, deviceScaleFactor: 2.7 });
  
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(1000);
  
  await page.evaluate((authData) => {
    localStorage.setItem('@family_sync_auth', JSON.stringify(authData));
  }, { accessToken: token, user });
  
  const routes = [
    { path: '', name: 'home' },
    { path: 'calendar', name: 'calendar' },
    { path: 'shopping', name: 'shopping' },
    { path: 'chores', name: 'chores' },
    { path: 'family', name: 'family' },
    { path: 'chat', name: 'chat' },
  ];
  
  for (const route of routes) {
    await page.goto(`http://localhost:8081/${route.path}`, { waitUntil: 'networkidle2', timeout: 20000 });
    await delay(4000);
    const content = await page.evaluate(() => document.body.innerText.substring(0, 100));
    console.log(`${route.name}: ${content.substring(0, 60)}`);
    await page.screenshot({ path: `assets/store/screenshot-${route.name}.png`, fullPage: false });
    console.log(`  -> saved`);
  }
  
  await browser.close();
  console.log('All done!');
}

main().catch(e => { console.error(e); process.exit(1); });
