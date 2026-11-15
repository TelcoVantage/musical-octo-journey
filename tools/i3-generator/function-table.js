// Reads the SDK's built-in table of expression functions: for each function, its overload signatures and the
// flow types each overload supports. Some overloads (for example ToCommunication) are only usable once the
// server confirms them; org-stub.js confirms exactly what this table already says the SDK supports.
const fs = require('fs');

module.exports = function readFunctionTable() {
  const bundle = require.resolve('purecloud-flow-scripting-api-sdk-javascript');
  const source = fs.readFileSync(bundle, 'utf8');
  const pattern = /(?:[{,]([A-Za-z0-9_]+):\{identifier:"([A-Za-z0-9_]+)",description:"[^"]*",type:"(function|operator)")|(?:identifier:"([A-Z][A-Za-z_]* [^"]+)")|(?:supportedFlowTypes:\{([^}]*)\})/g;
  const table = {};
  let fn = null, overload = null, m;
  while ((m = pattern.exec(source))) {
    if (m[2]) { fn = table[m[2]] = table[m[2]] || {}; overload = null; }
    else if (m[4] && fn) { overload = m[4]; if (!(overload in fn)) fn[overload] = null; }
    else if (m[5] !== undefined && fn && overload && fn[overload] === null) { fn[overload] = [...m[5].matchAll(/([a-z]+):"/g)].map((x) => x[1]); }
  }
  if (!table.toCommunication) throw new Error('Could not read the function table from the SDK - its layout may have changed.');
  return table;
};
