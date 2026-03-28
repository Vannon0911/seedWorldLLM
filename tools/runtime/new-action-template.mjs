const [domain, actionType, gateName] = process.argv.slice(2);

if (!domain || !actionType || !gateName) {
  console.error("Usage: node tools/runtime/new-action-template.mjs <domain> <actionType> <requiredGate>");
  process.exit(1);
}

console.log(`// Action template for ${domain}.${actionType}
this.actionRegistry.register({
  domain: "${domain}",
  actionType: "${actionType}",
  requiredGate: "${gateName}",
  validator: (action) => ({ valid: true }),
  handler: (action) => {
    throw new Error("TODO: implement handler for ${domain}.${actionType}");
  }
});
`);
