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

  const setCookies = res.headers.getSetCookie();
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function run() {
  const cookie = await login();
  const res = await fetch(`${base}/api/purchases?from=2026-11-01&to=2026-11-10&size=100`, {
    headers: { cookie },
  });
  console.log("Purchases API status:", res.status);
  const data = await res.json();
  console.log("Purchases API data:", JSON.stringify(data, null, 2));

  const salesRes = await fetch(`${base}/api/sales?from=2026-11-01&to=2026-11-10&size=100`, {
    headers: { cookie },
  });
  console.log("Sales API status:", salesRes.status);
  const salesData = await salesRes.json();
  console.log("Sales API data:", JSON.stringify(salesData, null, 2));
}

run().catch(console.error);
