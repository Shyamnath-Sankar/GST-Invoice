/**
 * Idempotent defaults for a new install: the business row, six tax rates and eleven
 * HSN/SAC codes. Every value is editable in Settings; the CA should confirm rates.
 */
import { existsSync } from "node:fs";
import { count, eq } from "drizzle-orm";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { db, pgClient } = await import("./client");
const { business, hsnCodes, taxRates } = await import("./schema");

const RATES: Array<[number, string]> = [
  [0, "Nil / exempt"],
  [500, "5% (outdoor catering without ITC, most food inputs)"],
  [1200, "12% (older periods)"],
  [1800, "18% (catering at specified premises, most services and goods)"],
  [2800, "28% (older periods)"],
  [4000, "40% (special rate)"],
];

interface HsnSeed {
  code: string;
  description: string;
  isService: boolean;
  defaultRateBp: number;
  supplyKind: "taxable" | "nil";
  uqc: string;
  notes: string;
}

const HSN: HsnSeed[] = [
  {
    code: "996334",
    description: "Outdoor catering services",
    isService: true,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "NA",
    notes:
      "Standalone outdoor catering: 5% without ITC (Notification 11/2017-CT(Rate) entry 7). 18% with ITC only at specified premises. Confirm with your CA.",
  },
  {
    code: "996337",
    description: "Other contract food services (canteen, mess)",
    isService: true,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "NA",
    notes: "Confirm rate with your CA.",
  },
  {
    code: "996331",
    description: "Services provided by restaurants and eating places",
    isService: true,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "NA",
    notes: "Confirm rate with your CA.",
  },
  {
    code: "0702",
    description: "Tomatoes, fresh",
    isService: false,
    defaultRateBp: 0,
    supplyKind: "nil",
    uqc: "KGS",
    notes: "Fresh vegetables are nil-rated.",
  },
  {
    code: "0709",
    description: "Other vegetables, fresh",
    isService: false,
    defaultRateBp: 0,
    supplyKind: "nil",
    uqc: "KGS",
    notes: "Fresh vegetables are nil-rated.",
  },
  {
    code: "0401",
    description: "Milk, fresh",
    isService: false,
    defaultRateBp: 0,
    supplyKind: "nil",
    uqc: "LTR",
    notes: "",
  },
  {
    code: "1006",
    description: "Rice",
    isService: false,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "KGS",
    notes: "Pre-packaged and labelled rice is 5%; loose rice is nil-rated.",
  },
  {
    code: "1512",
    description: "Sunflower / cotton-seed oil",
    isService: false,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "LTR",
    notes: "",
  },
  {
    code: "0910",
    description: "Ginger, turmeric and spices",
    isService: false,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "KGS",
    notes: "",
  },
  {
    code: "2711",
    description: "LPG (commercial cylinders)",
    isService: false,
    defaultRateBp: 1800,
    supplyKind: "taxable",
    uqc: "NOS",
    notes: "",
  },
  {
    code: "4823",
    description: "Paper plates and cups",
    isService: false,
    defaultRateBp: 500,
    supplyKind: "taxable",
    uqc: "NOS",
    notes: "Rate changed in 2025. Confirm with your CA.",
  },
];

async function seed(): Promise<void> {
  const [existingBusiness] = await db
    .select({ id: business.id })
    .from(business)
    .where(eq(business.id, 1))
    .limit(1);

  if (!existingBusiness) {
    await db.insert(business).values({
      id: 1,
      tradeName: "Dev Caters",
      address: "513, Vasan Nagar, Trichy 620 102",
      stateCode: "33",
      proprietor: "C. Maria Sangeetha",
      phone: "98941 91881, 98949 88950",
    });
  }

  const [rateCount] = await db.select({ value: count() }).from(taxRates);
  if ((rateCount?.value ?? 0) === 0) {
    await db.insert(taxRates).values(
      RATES.map(([rateBp, label]) => ({ rateBp, label })),
    );
  }

  const [hsnCount] = await db.select({ value: count() }).from(hsnCodes);
  if ((hsnCount?.value ?? 0) === 0) {
    await db.insert(hsnCodes).values(HSN);
  }

  console.log("Seed complete.");
}

try {
  await seed();
} finally {
  await pgClient.end();
}
