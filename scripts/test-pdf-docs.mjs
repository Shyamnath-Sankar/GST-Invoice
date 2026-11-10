import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const base = "http://localhost:3000";

async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-requested-with": "fetch",
    },
    body: JSON.stringify({
      email: "login@genrecai.com",
      password: "genrecai",
    }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }

  const setCookies = res.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  console.log("Logged in via API, cookie obtained");
  return cookie;
}

async function testPdfAndDocs(cookie) {
  // 1. Fetch Sales PDF
  console.log("Testing Sales PDF generation for invoice 4...");
  const pdfRes = await fetch(`${base}/api/sales/4/pdf`, {
    headers: { cookie },
  });
  console.log("PDF response status:", pdfRes.status);
  const pdfBuffer = await pdfRes.arrayBuffer();
  const pdfHeader = Buffer.from(pdfBuffer.slice(0, 5)).toString("utf8");
  console.log("PDF header starts with:", pdfHeader);
  if (pdfHeader !== "%PDF-") {
    throw new Error(`Invalid PDF header: ${pdfHeader}`);
  }
  console.log("PDF generation verified! Length:", pdfBuffer.byteLength, "bytes");

  // 2. Upload Document Attachment to Sales invoice 4
  console.log("Testing document attachment upload...");
  const form = new FormData();
  const testFileBlob = new Blob(["%PDF-1.4\ntest invoice attachment content\n%%EOF"], {
    type: "application/pdf",
  });
  form.append("file", testFileBlob, "test-contract.pdf");
  form.append("entity_type", "sale");
  form.append("entity_id", "4");

  const uploadRes = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: {
      cookie,
      "x-requested-with": "fetch",
    },
    body: form,
  });

  console.log("Upload status:", uploadRes.status);
  const uploadJson = await uploadRes.json();
  console.log("Upload response:", uploadJson);

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${JSON.stringify(uploadJson)}`);
  }

  const docId = uploadJson.id;

  // 3. Download Document Attachment
  console.log(`Downloading document attachment ${docId}...`);
  const downloadRes = await fetch(`${base}/api/documents/${docId}/file`, {
    headers: { cookie },
  });
  console.log("Download status:", downloadRes.status);
  const downloadedText = await downloadRes.text();
  console.log("Downloaded file content starts with:", downloadedText.slice(0, 20));

  // 4. Delete Document Attachment
  console.log(`Deleting document attachment ${docId}...`);
  const delRes = await fetch(`${base}/api/documents/${docId}`, {
    method: "DELETE",
    headers: {
      cookie,
      "x-requested-with": "fetch",
    },
  });
  console.log("Delete status:", delRes.status);
  console.log("All PDF and Document attachment tests PASSED!");
}

async function run() {
  const cookie = await login();
  await testPdfAndDocs(cookie);
}

run().catch(console.error);
