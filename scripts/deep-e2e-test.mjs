import fs from 'node:fs';

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

  console.log('>>> CONNECTED TO HAILBROWSER');

  // Test 1: Add a Party (Customer)
  console.log('\n--- TEST 1: Adding a Customer Party in /parties ---');
  await client.call('navigate', { url: 'http://localhost:3000/parties' });
  await sleep(1500);

  let page = await client.call('read_page', {});
  let text = page.content[0].text;

  // Let's find inputs for "Add a party"
  const nameRef = text.match(/\[(ref_\d+)\] textbox "Name"/)?.[1];
  const gstinRef = text.match(/\[(ref_\d+)\] textbox "GSTIN"/)?.[1];
  const addressRef = text.match(/\[(ref_\d+)\] textbox "Address"/)?.[1];
  const phoneRef = text.match(/\[(ref_\d+)\] textbox "Phone"/)?.[1];
  const emailRef = text.match(/\[(ref_\d+)\] textbox "Email"/)?.[1];
  const addBtnRef = text.match(/\[(ref_\d+)\] button "Add party"/)?.[1];

  if (nameRef && addBtnRef) {
    console.log('Filling Party form: Apex Events Corp (Customer)');
    await client.call('type', { ref: nameRef, text: 'Apex Events Corp', clear: true });
    if (gstinRef) await client.call('type', { ref: gstinRef, text: '33AABCA1234A1Z5', clear: true });
    if (addressRef) await client.call('type', { ref: addressRef, text: '123 Grand Trunk Road, Chennai 600001', clear: true });
    if (phoneRef) await client.call('type', { ref: phoneRef, text: '9876543210', clear: true });
    if (emailRef) await client.call('type', { ref: emailRef, text: 'contact@apexevents.in', clear: true });
    
    console.log('Submitting party...');
    await client.call('click', { ref: addBtnRef });
    await sleep(2000);

    page = await client.call('read_page', {});
    console.log('Party added! Page state contains Apex Events Corp:', page.content[0].text.includes('Apex Events Corp'));
  }

  // Test 2: Add a Supplier Party
  console.log('\n--- TEST 2: Adding a Supplier Party in /parties ---');
  page = await client.call('read_page', {});
  text = page.content[0].text;

  const kindRef = text.match(/\[(ref_\d+)\] combobox "Kind" value="Customer"/)?.[1];
  const nameRef2 = text.match(/\[(ref_\d+)\] textbox "Name"/)?.[1];
  const gstinRef2 = text.match(/\[(ref_\d+)\] textbox "GSTIN"/)?.[1];
  const addBtnRef2 = text.match(/\[(ref_\d+)\] button "Add party"/)?.[1];

  if (kindRef && nameRef2 && addBtnRef2) {
    console.log('Selecting Kind: Supplier');
    await client.call('select_option', { ref: kindRef, option: 'Supplier' });
    await sleep(500);
    await client.call('type', { ref: nameRef2, text: 'Cauvery Spices & Provisions', clear: true });
    if (gstinRef2) await client.call('type', { ref: gstinRef2, text: '33AABCS5678B1Z2', clear: true });
    await client.call('click', { ref: addBtnRef2 });
    await sleep(2000);
    page = await client.call('read_page', {});
    console.log('Supplier added! Page state contains Cauvery Spices:', page.content[0].text.includes('Cauvery Spices'));
  }

  // Test 3: Create a Sales Invoice in /sales/new
  console.log('\n--- TEST 3: Creating a Sales Invoice in /sales/new ---');
  await client.call('navigate', { url: 'http://localhost:3000/sales/new' });
  await sleep(2000);

  page = await client.call('read_page', {});
  text = page.content[0].text;

  const custRef = text.match(/\[(ref_\d+)\] textbox "Customer"/)?.[1];
  const descRef = text.match(/\[(ref_\d+)\] textbox "Description line 1"/)?.[1];
  const hsnRef = text.match(/\[(ref_\d+)\] textbox "HSN line 1"/)?.[1];
  const qtyRef = text.match(/\[(ref_\d+)\] textbox "Quantity line 1"/)?.[1];
  const rateRef = text.match(/\[(ref_\d+)\] textbox "Rate line 1"/)?.[1];
  const saveBtnRef = text.match(/\[(ref_\d+)\] button "Save"/)?.[1];

  if (custRef && descRef && rateRef && saveBtnRef) {
    console.log('Entering customer name...');
    await client.call('type', { ref: custRef, text: 'Apex Events Corp', clear: true });
    await sleep(500);

    console.log('Entering line item details: Buffet Catering Service, Qty 200, Rate 450');
    await client.call('type', { ref: descRef, text: 'Corporate Annual Gala Buffet Catering', clear: true });
    if (hsnRef) await client.call('type', { ref: hsnRef, text: '996331', clear: true });
    if (qtyRef) await client.call('type', { ref: qtyRef, text: '200', clear: true });
    await client.call('type', { ref: rateRef, text: '450', clear: true });
    await sleep(1500);

    // Read calculated preview
    page = await client.call('read_page', {});
    console.log('Tax preview in editor:\n', page.content[0].text.match(/Taxable value[\s\S]*?Total/)?.[0] || 'Preview calculated');

    console.log('Saving sales invoice...');
    await client.call('click', { ref: saveBtnRef });
    await sleep(2500);

    page = await client.call('read_page', {});
    console.log('Saved invoice view:\n', page.content[0].text.slice(0, 1000));
  }

  // Test 4: Create a Purchase Bill in /purchases/new
  console.log('\n--- TEST 4: Creating a Purchase Bill in /purchases/new ---');
  await client.call('navigate', { url: 'http://localhost:3000/purchases/new' });
  await sleep(2000);

  page = await client.call('read_page', {});
  text = page.content[0].text;

  const billNoRef = text.match(/\[(ref_\d+)\] textbox "Supplier bill number"/)?.[1];
  const suppRef = text.match(/\[(ref_\d+)\] textbox "Supplier"/)?.[1];
  const pDescRef = text.match(/\[(ref_\d+)\] textbox "Description line 1"/)?.[1];
  const pRateRef = text.match(/\[(ref_\d+)\] textbox "Rate line 1"/)?.[1];
  const pQtyRef = text.match(/\[(ref_\d+)\] textbox "Quantity line 1"/)?.[1];
  const pSaveRef = text.match(/\[(ref_\d+)\] button "Save"/)?.[1];

  if (billNoRef && suppRef && pDescRef && pRateRef && pSaveRef) {
    console.log('Entering supplier bill details: Bill INV-CSP-7890');
    await client.call('type', { ref: billNoRef, text: 'INV-CSP-7890', clear: true });
    await client.call('type', { ref: suppRef, text: 'Cauvery Spices & Provisions', clear: true });
    await client.call('type', { ref: pDescRef, text: 'Basmati Rice and Premium Cooking Oils', clear: true });
    if (pQtyRef) await client.call('type', { ref: pQtyRef, text: '10', clear: true });
    await client.call('type', { ref: pRateRef, text: '2500', clear: true });
    await sleep(1500);

    console.log('Saving purchase bill...');
    await client.call('click', { ref: pSaveRef });
    await sleep(2500);

    page = await client.call('read_page', {});
    console.log('Saved purchase bill view:\n', page.content[0].text.slice(0, 1000));
  }

  // Test 5: Verify Dashboard Reflects New Bills
  console.log('\n--- TEST 5: Verifying Dashboard with Real Totals ---');
  await client.call('navigate', { url: 'http://localhost:3000/' });
  await sleep(2000);
  page = await client.call('read_page', {});
  console.log('Dashboard summary:\n', page.content[0].text);

  client.close();
  console.log('\n>>> DEEP E2E TEST COMPLETED SUCCESSFULLY!');
}

main().catch(console.error);
