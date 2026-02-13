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

  await page.goto('http://localhost:8081/shopping', { waitUntil: 'networkidle2', timeout: 20000 });
  await delay(3000);
  
  const clicked = await page.evaluate(() => {
    const elements = document.querySelectorAll('div, span, p, a');
    for (const el of elements) {
      if (el.textContent.includes('Spesa Settimanale') && el.textContent.length < 100) {
        el.click();
        return el.tagName + ': ' + el.textContent.substring(0, 50);
      }
    }
    return null;
  });
  console.log('Clicked:', clicked);
  await delay(4000);
  
  const content = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log('Content:', content.substring(0, 150));
  
  if (content.includes('Latte') || content.includes('Mele') || content.includes('Pomodori')) {
    console.log('Successfully navigated to list detail!');
  }
  
  await page.screenshot({ path: 'assets/store/screenshot-shopping.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
