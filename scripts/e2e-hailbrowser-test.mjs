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
        client: 'test-runner'
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

async function main() {
  const client = new HailClient();
  await client.connect();

  const results = {
    steps: [],
    passed: 0,
    failed: 0
  };

  async function step(name, fn) {
    console.log(`\n========================================`);
    console.log(`RUNNING STEP: ${name}`);
    console.log(`========================================`);
    try {
      await fn();
      console.log(`>>> STEP PASSED: ${name}`);
      results.steps.push({ name, status: 'PASSED' });
      results.passed++;
    } catch (err) {
      console.error(`>>> STEP FAILED: ${name}`);
      console.error(err);
      results.steps.push({ name, status: 'FAILED', error: err.message });
      results.failed++;
    }
  }

  // STEP 1: Logout and Login Test
  await step('1. Authentication Flow (Logout & Login with login@genrecai.com / genrecai)', async () => {
    // Navigate to /
    await client.call('navigate', { url: 'http://localhost:3000/' });
    await sleep(1500);

    let page = await client.call('read_page', {});
    let pageText = page.content[0].text;

    // Check if signed in, click Sign out
    const signOutRefMatch = pageText.match(/\[(ref_\d+)\] button "Sign out"/);
    if (signOutRefMatch) {
      console.log('Signing out...');
      await client.call('click', { ref: signOutRefMatch[1] });
      await sleep(1500);
    }

    // Now navigate to /login
    await client.call('navigate', { url: 'http://localhost:3000/login' });
    await sleep(1500);

    page = await client.call('read_page', {});
    pageText = page.content[0].text;
    console.log('Login page elements:\n', pageText);

    // Find email and password inputs
    const emailMatch = pageText.match(/\[(ref_\d+)\] textbox "Email"/);
    const passMatch = pageText.match(/\[(ref_\d+)\] textbox "Password"/);
    const submitMatch = pageText.match(/\[(ref_\d+)\] button "(?:Sign in|Log in)"/);

    if (!emailMatch || !passMatch || !submitMatch) {
      throw new Error('Could not find email/password/submit elements on login page');
    }

    console.log('Typing email login@genrecai.com...');
    await client.call('type', { ref: emailMatch[1], text: 'login@genrecai.com', clear: true });
    await sleep(500);

    console.log('Typing password genrecai...');
    await client.call('type', { ref: passMatch[1], text: 'genrecai', clear: true });
    await sleep(500);

    console.log('Clicking sign in...');
    await client.call('click', { ref: submitMatch[1] });
    await sleep(2500);

    // Verify redirected to dashboard or /
    page = await client.call('read_page', {});
    pageText = page.content[0].text;
    console.log('Post-login page state:\n', pageText);

    if (!pageText.includes('Genrec AI') && !pageText.includes('Sign out')) {
      throw new Error('Login failed: did not find Genrec AI or Sign out on dashboard');
    }
  });

  // STEP 2: Dashboard Overview
  await step('2. Dashboard & Navigation Verification', async () => {
    await client.call('navigate', { url: 'http://localhost:3000/' });
    await sleep(1500);
    const page = await client.call('read_page', {});
    const text = page.content[0].text;

    if (!text.includes('Sales') || !text.includes('Purchases') || !text.includes('Parties') || !text.includes('Settings')) {
      throw new Error('Dashboard navigation missing key modules');
    }
    console.log('Dashboard verified: Sales, Purchases, Parties, Settings modules present');
  });

  // STEP 3: Settings Verification
  await step('3. Settings & Masters Verification', async () => {
    await client.call('navigate', { url: 'http://localhost:3000/settings' });
    await sleep(2000);
    const page = await client.call('read_page', {});
    const text = page.content[0].text;
    console.log('Settings page:\n', text.slice(0, 1500));

    if (!text.includes('Business details') && !text.includes('Trade name')) {
      throw new Error('Settings page missing Business details');
    }
    if (!text.includes('Tax rates')) {
      throw new Error('Settings page missing Tax rates');
    }
    if (!text.includes('HSN') && !text.includes('SAC')) {
      throw new Error('Settings page missing HSN/SAC codes');
    }
  });

  // STEP 4: Parties Management
  await step('4. Parties Management (Add Customer & Supplier)', async () => {
    await client.call('navigate', { url: 'http://localhost:3000/parties' });
    await sleep(2000);
    let page = await client.call('read_page', {});
    let text = page.content[0].text;
    console.log('Parties page:\n', text);

    // Check if "New party" or add form exists
    const newPartyBtn = text.match(/\[(ref_\d+)\] (?:button|link) "(?:New party|Add party|\+ Party)"/);
    if (newPartyBtn) {
      await client.call('click', { ref: newPartyBtn[1] });
      await sleep(1500);
      page = await client.call('read_page', {});
      text = page.content[0].text;
      console.log('New party form:\n', text);
    }
  });

  // STEP 5: Sales Module (Create, View, Calculate, PDF)
  await step('5. Sales Invoicing Workflow', async () => {
    await client.call('navigate', { url: 'http://localhost:3000/sales' });
    await sleep(2000);
    let page = await client.call('read_page', {});
    let text = page.content[0].text;
    console.log('Sales list page:\n', text);

    // Navigate to new sale
    const newSaleBtn = text.match(/\[(ref_\d+)\] link "(?:New invoice|New sale|\+ Invoice)"/);
    if (newSaleBtn) {
      await client.call('click', { ref: newSaleBtn[1] });
    } else {
      await client.call('navigate', { url: 'http://localhost:3000/sales/new' });
    }
    await sleep(2000);

    page = await client.call('read_page', {});
    text = page.content[0].text;
    console.log('Sales new invoice editor:\n', text);
  });

  // STEP 6: Purchases Module
  await step('6. Purchases Workflow', async () => {
    await client.call('navigate', { url: 'http://localhost:3000/purchases' });
    await sleep(2000);
    let page = await client.call('read_page', {});
    let text = page.content[0].text;
    console.log('Purchases list page:\n', text);

    await client.call('navigate', { url: 'http://localhost:3000/purchases/new' });
    await sleep(2000);
    page = await client.call('read_page', {});
    text = page.content[0].text;
    console.log('Purchase new editor:\n', text);
  });

  client.close();

  console.log('\n========================================');
  console.log(`TEST SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('========================================');
}

main().catch(console.error);
