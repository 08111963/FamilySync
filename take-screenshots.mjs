import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const API = 'http://localhost:5000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 400, height: 720 },
    deviceScaleFactor: 2.7  // 400*2.7=1080, 720*2.7=1944 ≈ 1920
  });
  const page = await context.newPage();
  
  // Register user
  const email = `store_${Date.now()}@test.com`;
  const regRes = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Marco Rossi', email, password: 'TestPass123!' })
  });
  const regData = await regRes.json();
  const token = regData.token || regData.accessToken;
  console.log('Registered:', email, 'Token:', !!token);

  // Create family
  const famRes = await fetch(`${API}/api/families`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ name: 'Famiglia Rossi' })
  });
  const famData = await famRes.json();
  const familyId = famData.id || famData.family?.id;
  console.log('Family created:', familyId);

  // Create calendar events
  for (const ev of [
    { title: 'Riunione scuola', startDate: '2026-02-15T09:00:00Z', endDate: '2026-02-15T10:00:00Z', color: '#FF6B6B' },
    { title: 'Compleanno Nonna', startDate: '2026-02-20T18:00:00Z', endDate: '2026-02-20T22:00:00Z', color: '#4ECDC4' },
    { title: 'Visita pediatra', startDate: '2026-02-18T15:00:00Z', endDate: '2026-02-18T16:00:00Z', color: '#FFE66D' },
  ]) {
    await fetch(`${API}/api/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ familyId, ...ev })
    });
  }
  console.log('Events created');

  // Create shopping list
  const shopRes = await fetch(`${API}/api/shopping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ familyId, name: 'Spesa Settimanale' })
  });
  const shopData = await shopRes.json();
  const listId = shopData.id || shopData.list?.id;
  console.log('Shopping list:', listId);

  for (const item of [
    { name: 'Latte', quantity: 2, unit: 'litri', category: 'Latticini' },
    { name: 'Pane integrale', quantity: 1, unit: 'pz', category: 'Panetteria' },
    { name: 'Mele', quantity: 6, unit: 'pz', category: 'Frutta' },
    { name: 'Pomodori', quantity: 4, unit: 'pz', category: 'Verdura' },
    { name: 'Pasta', quantity: 2, unit: 'pz', category: 'Dispensa' },
  ]) {
    await fetch(`${API}/api/shopping/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(item)
    });
  }
  console.log('Shopping items created');

  // Create chores
  for (const chore of [
    { title: 'Lavare i piatti', points: 10, frequency: 'daily' },
    { title: 'Aspirapolvere', points: 20, frequency: 'weekly' },
    { title: 'Pulire il bagno', points: 15, frequency: 'weekly' },
  ]) {
    await fetch(`${API}/api/chores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ familyId, ...chore })
    });
  }
  console.log('Chores created');

  // Login via UI
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Try to find email input
  const emailInput = page.locator('input[type="email"], [placeholder*="email" i], [placeholder*="Email"]').first();
  const passInput = page.locator('input[type="password"], [placeholder*="password" i], [placeholder*="Password"]').first();
  
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(email);
    await passInput.fill('TestPass123!');
    // Find login button
    const loginBtn = page.locator('text=/Accedi|Login|Entra/i').first();
    await loginBtn.click();
    await page.waitForTimeout(3000);
  }
  
  console.log('Logged in, taking screenshots...');
  await page.waitForTimeout(2000);

  // Screenshot 1: Home
  await page.screenshot({ path: 'assets/store/screenshot-home.png', fullPage: false });
  console.log('Home screenshot taken');

  // Screenshot 2: Calendar tab
  const calTab = page.locator('[aria-label*="Calendar" i], [aria-label*="Calendario" i], text=/Calendario/i').first();
  if (await calTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await calTab.click();
  } else {
    // Try tab bar by position - Calendar is typically 2nd tab
    const tabs = page.locator('[role="tab"], [role="button"]');
    const tabCount = await tabs.count();
    console.log('Found', tabCount, 'tabs');
    // Try clicking on text
    await page.locator('text="Calendario"').first().click().catch(() => {});
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'assets/store/screenshot-calendar.png', fullPage: false });
  console.log('Calendar screenshot taken');

  // Screenshot 3: Shopping tab
  await page.locator('text="Spesa"').first().click().catch(async () => {
    await page.locator('[aria-label*="Spesa" i], [aria-label*="Shopping" i]').first().click().catch(() => {});
  });
  await page.waitForTimeout(2000);
  // Try clicking on the shopping list to see items
  await page.locator('text="Spesa Settimanale"').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'assets/store/screenshot-shopping.png', fullPage: false });
  console.log('Shopping screenshot taken');

  // Screenshot 4: Chores tab
  await page.locator('text="Faccende"').first().click().catch(async () => {
    await page.locator('[aria-label*="Faccende" i], [aria-label*="Chores" i]').first().click().catch(() => {});
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'assets/store/screenshot-chores.png', fullPage: false });
  console.log('Chores screenshot taken');

  // Screenshot 5: Family tab
  await page.locator('text="Famiglia"').first().click().catch(async () => {
    await page.locator('[aria-label*="Famiglia" i], [aria-label*="Family" i]').first().click().catch(() => {});
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'assets/store/screenshot-family.png', fullPage: false });
  console.log('Family screenshot taken');

  // Screenshot 6: Chat tab
  await page.locator('text="Chat"').first().click().catch(async () => {
    await page.locator('[aria-label*="Chat" i]').first().click().catch(() => {});
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'assets/store/screenshot-chat.png', fullPage: false });
  console.log('Chat screenshot taken');

  await browser.close();
  console.log('Done! All screenshots saved.');
}

main().catch(e => { console.error(e); process.exit(1); });
