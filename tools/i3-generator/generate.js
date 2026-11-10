#!/usr/bin/env node
// Builds workflow/Chat - AI Summary to Ticket.i3WorkFlow (and the ID helper page) with Genesys' own Architect
// Scripting SDK, so the file is in Architect's native export format. Runs offline: see org-stub.js.
//
//   npm install && npm run generate
//   npm run generate -- --get-ticket-id=custom_-_... --get-summary-id=custom_-_... --update-ticket-id=custom_-_...
const fs = require('fs');
const path = require('path');
const { createOrgStub } = require('./org-stub.js');

const repo = path.join(__dirname, '..', '..');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// Placeholders for the two actions whose IDs only exist once they are imported into the org.
const PLACEHOLDERS = {
  getTicket: 'custom_-_11111111-1111-4111-8111-111111111111',
  getSummary: 'custom_-_22222222-2222-4222-8222-222222222222'
};
const ids = {
  getTicket: arg('get-ticket-id', PLACEHOLDERS.getTicket),
  getSummary: arg('get-summary-id', PLACEHOLDERS.getSummary),
  updateTicket: arg('update-ticket-id', 'custom_-_eeb9b6e4-05b2-4d0e-95a5-1139ac535f19')
};
const GENESYS_INTEGRATION = arg('genesys-integration', 'Genesys Cloud Data Actions');
const TICKET_INTEGRATION = arg('ticket-integration', 'Rabobank ITSM API PROD');

// Contracts: the two new actions come straight from the importable JSON files, so they cannot drift apart.
const fromFile = (file) => {
  const a = JSON.parse(fs.readFileSync(path.join(repo, 'data-actions', file), 'utf8'));
  return { name: a.name, category: GENESYS_INTEGRATION, inputSchema: a.contract.input.inputSchema, successSchema: a.contract.output.successSchema };
};
const dataActions = {
  [ids.getTicket]: fromFile('Get-Conversation-Ticket-Number.json'),
  [ids.getSummary]: fromFile('Get-Conversation-AI-Summary.json'),
  // Existing action in the org: inputs Key and JournalUpdate, no outputs.
  [ids.updateTicket]: { name: 'Update Ticket (v8)', category: TICKET_INTEGRATION,
    inputSchema: { type: 'object', properties: { Key: { type: 'string' }, JournalUpdate: { type: 'string' } } },
    successSchema: { type: 'object', properties: {} } }
};

const decode = (content) => JSON.parse(decodeURIComponent(Buffer.from(content, 'base64').toString('binary')));
const say = (text) => process.stdout.write(text + '\n');

async function main() {
  // The SDK is chatty; keep its output in a log file.
  const log = fs.createWriteStream(path.join(__dirname, 'generate.log'));
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => log.write(a.join(' ') + '\n');

  const stub = createOrgStub(dataActions);
  await stub.start();
  const scripting = require('purecloud-flow-scripting-api-sdk-javascript');
  const session = scripting.environment.archSession;
  session.endTerminatesProcess = false;

  let result;
  await session.startWithAuthToken(scripting.enums.archEnums.LOCATIONS.prod_ap_southeast_2, async () => {
    const exportOf = async (flow) => { let out; const r = await flow.exportToObjectAsync((o) => { out = o; }); return (out || r).content; };

    const flow = await require('./flow.js')(scripting, ids);
    const validation = await flow.validateAsync();
    if (validation.hasErrors || validation.hasWarnings) throw new Error('The flow has validation issues - see generate.log');
    const content = await exportOf(flow);

    // Read the file back the way Architect's Import does, and make sure it is still valid.
    const copy = await scripting.factories.archFactoryFlows.createFlowWorkflowAsync('Import check', '', scripting.languages.archLanguages.englishUnitedStates);
    await copy.importFromContentAsync(content);
    const recheck = await copy.validateAsync();
    if (recheck.hasErrors || recheck.hasWarnings) throw new Error('The exported file does not re-import cleanly - see generate.log');
    const count = (f) => { let n = 0; f.traverse(() => { n++; }); return n; };
    if (count(copy) !== count(flow)) throw new Error('The re-imported flow differs from the original');
    result = content;
  }, 'offline');
  stub.stop();

  if (!result) throw new Error('Generation failed - see generate.log');
  if (stub.unhandled.length) throw new Error('The SDK asked for something the stub does not serve: ' + stub.unhandled.join(', '));

  const outFile = path.join(repo, 'workflow', 'Chat - AI Summary to Ticket.i3WorkFlow');
  fs.writeFileSync(outFile, result);
  const flowJson = decode(result);
  say('Wrote ' + path.relative(repo, outFile) + ' (' + result.length + ' bytes, ' + flowJson.flowSequenceItemList[0].actionList.length + ' actions)');

  const template = path.join(__dirname, 'set-data-action-ids.template.html');
  if (fs.existsSync(template)) {
    const page = fs.readFileSync(template, 'utf8')
      .replace('/*__CONTENT__*/""', JSON.stringify(result))
      .replace('/*__IDS__*/{}', JSON.stringify(ids));
    fs.writeFileSync(path.join(repo, 'workflow', 'set-data-action-ids.html'), page);
    say('Wrote workflow/set-data-action-ids.html');
  }
}

main().then(() => process.exit(0), (e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
