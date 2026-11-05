/**
 * Development-only DNS shim.
 *
 * The machine's configured resolver (10.47.132.22) refuses queries for
 * *.neon.tech, so Node cannot reach the database even though the network can.
 * This preload resolves names over public DNS instead, falling back to the
 * system resolver for everything else. It is never loaded by the application.
 *
 *   set NODE_OPTIONS=--require=./scripts/dns-patch.cjs
 */
const dns = require("node:dns");

const resolver = new dns.Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

const systemLookup = dns.lookup.bind(dns);

dns.lookup = function lookup(hostname, options, callback) {
  let opts = options;
  let done = callback;
  if (typeof opts === "function") {
    done = opts;
    opts = {};
  }
  const all = Boolean(opts && opts.all);

  resolver.resolve4(hostname, (error, addresses) => {
    if (error || !addresses || addresses.length === 0) {
      systemLookup(hostname, opts, done);
      return;
    }
    if (all) {
      done(
        null,
        addresses.map((address) => ({ address, family: 4 })),
      );
      return;
    }
    done(null, addresses[0], 4);
  });
};
