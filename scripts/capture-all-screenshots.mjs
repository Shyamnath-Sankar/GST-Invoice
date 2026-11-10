import fs from 'node:fs';
import path from 'node:path';

class HailClient {
  constructor(port = 12306) {
    this.port = port;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/?role=mcp`);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (err) => reject(err));
      this.ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'result' && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.result?.isError) {
              reject(new Error(JSON.stringify(msg.result)));
            } else {
              resolve(msg.result);
            }
          }
        } catch (e) {
          console.error('Failed to parse incoming message:', e);
        }
      });
    });
  }

  async call(tool, args = {}, timeoutMs = 30000) {
    const id = `req_${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout calling tool ${tool}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });

      this.ws.send(JSON.stringify({
        type: 'call',
        id,
        tool,
        args,
        client: 'screenshot-bot'
      }));
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function saveScreenshot(client, filename) {
  const res = await client.call('screenshot', {});
  const imgData = res.content?.find(c => c.type === 'image' || c.data);
  if (imgData && imgData.data) {
    const buffer = Buffer.from(imgData.data, 'base64');
    const outPath = path.join('docs', 'screenshots', filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
  } else {
    console.error(`Failed to capture screenshot for ${filename}:`, res);
  }
}

async function run() {
  const client = new HailClient();
  await client.connect();

  console.log('--- STARTING SCREENSHOT CAPTURE PROCESS ---');

  // 1. Login Page
  console.log('Capturing Login Page...');
  await client.call('navigate', { url: 'http://localhost:3000/' });
  await sleep(1000);
  let page = await client.call('read_page', {});
  const signoutMatch = page.content[0].text.match(/\[(ref_\d+)\] button "Sign out"/);
  if (signoutMatch) {
    await client.call('click', { ref: signoutMatch[1] });
    await sleep(1500);
  }
  await client.call('navigate', { url: 'http://localhost:3000/login' });
  await sleep(1500);
  await saveScreenshot(client, '01-login-screen.jpg');

  // Login again
  page = await client.call('read_page', {});
  const emailRef = page.content[0].text.match(/\[(ref_\d+)\] textbox "Email"/)?.[1];
  const passRef = page.content[0].text.match(/\[(ref_\d+)\] textbox "Password"/)?.[1];
  const submitRef = page.content[0].text.match(/\[(ref_\d+)\] button "Sign in"/)?.[1];
  if (emailRef && passRef && submitRef) {
    await client.call('type', { ref: emailRef, text: 'login@genrecai.com', clear: true });
    await client.call('type', { ref: passRef, text: 'genrecai', clear: true });
    await client.call('click', { ref: submitRef });
    await sleep(2500);
  }

  // 2. Dashboard
  console.log('Capturing Dashboard...');
  await client.call('navigate', { url: 'http://localhost:3000/' });
  await sleep(2000);
  await saveScreenshot(client, '02-dashboard-screen.jpg');

  // 3. Settings - Business & GST
  console.log('Capturing Settings - Business...');
  await client.call('navigate', { url: 'http://localhost:3000/settings' });
  await sleep(2000);
  await saveScreenshot(client, '03-settings-business.jpg');

  // 4. Settings - Tax Rates
  console.log('Capturing Settings - Tax Rates...');
  page = await client.call('read_page', {});
  let tabRef = page.content[0].text.match(/\[(ref_\d+)\] tab "Tax rates"/)?.[1];
  if (tabRef) {
    await client.call('click', { ref: tabRef });
    await sleep(1500);
    await saveScreenshot(client, '04-settings-rates.jpg');
  }

  // 5. Settings - HSN / SAC Codes
  console.log('Capturing Settings - HSN / SAC Codes...');
  page = await client.call('read_page', {});
  tabRef = page.content[0].text.match(/\[(ref_\d+)\] tab "HSN \/ SAC codes"/)?.[1];
  if (tabRef) {
    await client.call('click', { ref: tabRef });
    await sleep(1500);
    await saveScreenshot(client, '05-settings-hsn.jpg');
  }

  // 6. Parties List & Form
  console.log('Capturing Parties Management...');
  await client.call('navigate', { url: 'http://localhost:3000/parties' });
  await sleep(2000);
  await saveScreenshot(client, '06-parties-screen.jpg');

  // 7. Sales List
  console.log('Capturing Sales List...');
  await client.call('navigate', { url: 'http://localhost:3000/sales' });
  await sleep(2500);
  await saveScreenshot(client, '07-sales-list.jpg');

  // 8. Sales New Invoice Editor
  console.log('Capturing Sales New Invoice Editor...');
  await client.call('navigate', { url: 'http://localhost:3000/sales/new' });
  await sleep(2000);
  page = await client.call('read_page', {});
  let text = page.content[0].text;
  let custRef = text.match(/\[(ref_\d+)\] textbox "Customer"/)?.[1];
  let descRef = text.match(/\[(ref_\d+)\] textbox "Description line 1"/)?.[1];
  let rateRef = text.match(/\[(ref_\d+)\] textbox "Rate line 1"/)?.[1];
  let qtyRef = text.match(/\[(ref_\d+)\] textbox "Quantity line 1"/)?.[1];
  if (custRef && descRef && rateRef) {
    await client.call('type', { ref: custRef, text: 'Apex Events Corp', clear: true });
    await client.call('type', { ref: descRef, text: 'Buffet Catering Dinner Service', clear: true });
    if (qtyRef) await client.call('type', { ref: qtyRef, text: '150', clear: true });
    await client.call('type', { ref: rateRef, text: '500', clear: true });
    await sleep(1500);
  }
  await saveScreenshot(client, '08-sales-new-invoice.jpg');

  // 9. Purchases List
  console.log('Capturing Purchases List...');
  await client.call('navigate', { url: 'http://localhost:3000/purchases' });
  await sleep(2500);
  await saveScreenshot(client, '09-purchases-list.jpg');

  // 10. Purchases New Bill Editor
  console.log('Capturing Purchases New Bill Editor...');
  await client.call('navigate', { url: 'http://localhost:3000/purchases/new' });
  await sleep(2000);
  page = await client.call('read_page', {});
  text = page.content[0].text;
  let billRef = text.match(/\[(ref_\d+)\] textbox "Supplier bill number"/)?.[1];
  let suppRef = text.match(/\[(ref_\d+)\] textbox "Supplier"/)?.[1];
  let pDescRef = text.match(/\[(ref_\d+)\] textbox "Description line 1"/)?.[1];
  let pRateRef = text.match(/\[(ref_\d+)\] textbox "Rate line 1"/)?.[1];
  if (billRef && suppRef && pDescRef && pRateRef) {
    await client.call('type', { ref: billRef, text: 'INV-SUP-4521', clear: true });
    await client.call('type', { ref: suppRef, text: 'Cauvery Spices & Provisions', clear: true });
    await client.call('type', { ref: pDescRef, text: 'Vegetables & Provisions for Wedding', clear: true });
    await client.call('type', { ref: pRateRef, text: '18500', clear: true });
    await sleep(1500);
  }
  await saveScreenshot(client, '10-purchases-new-bill.jpg');

  // 11. Settings - Audit Log
  console.log('Capturing Settings - Audit Log...');
  await client.call('navigate', { url: 'http://localhost:3000/settings' });
  await sleep(2000);
  page = await client.call('read_page', {});
  tabRef = page.content[0].text.match(/\[(ref_\d+)\] tab "Audit log"/)?.[1];
  if (tabRef) {
    await client.call('click', { ref: tabRef });
    await sleep(1500);
    await saveScreenshot(client, '11-audit-log.jpg');
  }

  client.close();
  console.log('--- ALL SCREENSHOTS CAPTURED SUCCESSFULLY ---');
}

run().catch(console.error);
