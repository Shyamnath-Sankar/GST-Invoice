/**
 * Aggregator for the Phase 4 master-data services.
 *
 * The implementation lives in small, single-purpose modules next to this one so
 * that each stays easy to read and test. Routes, pages and tests import from
 * here.
 */
export type { Actor } from "./actor";

export {
  checkGstin,
  getBusiness,
  getMeta,
  updateBusiness,
  type BusinessInput,
  type BusinessRow,
  type Meta,
} from "./business-service";

export {
  createTaxRate,
  listTaxRates,
  updateTaxRate,
  type TaxRateInput,
  type TaxRateRow,
} from "./tax-rate-service";

export {
  createHsn,
  listHsn,
  updateHsn,
  type HsnInput,
  type HsnRow,
} from "./hsn-service";

export {
  createParty,
  listParties,
  updateParty,
  type PartyFilters,
  type PartyInput,
  type PartyRow,
} from "./party-service";
