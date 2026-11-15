#!/usr/bin/env node
// Builds chat-bot/Workplace Support - Chat Assistant (<language>).i3DigitalBotFlow with Genesys' own Architect
// Scripting SDK, so the file is in Architect's native export format. Runs offline: see org-stub.js.
//
//   npm install && npm run generate-bot
const fs = require('fs');
const path = require('path');
const { createOrgStub } = require('./org-stub.js');
const readFunctionTable = require('./function-table.js');

const repo = path.join(__dirname, '..', '..');
// One file per language: import the one that matches the inbound message flow's language.
const LANGUAGES = [['englishAustralia', 'en-AU'], ['englishUnitedStates', 'en-US']];
const ACTIONS = ['CommunicateAction', 'DigitalMenuAction', 'AskForSlotAction', 'AskForBooleanAction', 'SetAttributesAction',
  'ExitBotFlowAction', 'DecisionAction', 'UpdateVariableAction'];

const say = (text) => process.stdout.write(text + '\n');
const decode = (content) => JSON.parse(decodeURIComponent(Buffer.from(content, 'base64').toString('binary')));

async function main() {
  const log = fs.createWriteStream(path.join(__dirname, 'generate.log'));
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => log.write(a.join(' ') + '\n');

  const stub = createOrgStub({}, { flowTypes: ['digitalbot'], actions: ACTIONS, functions: readFunctionTable() });
  await stub.start();
  const scripting = require('purecloud-flow-scripting-api-sdk-javascript');
  const session = scripting.environment.archSession;
  session.endTerminatesProcess = false;

  const results = [];
  let failure;
  await session.startWithAuthToken(scripting.enums.archEnums.LOCATIONS.prod_ap_southeast_2, async () => {
    try {
      for (const [languageKey, tag] of LANGUAGES) {
        const language = scripting.languages.archLanguages[languageKey];
        const flow = await require('./bot-flow.js')(scripting, language);
        const validation = await flow.validateAsync();
        if (validation.hasErrors || validation.hasWarnings) throw new Error(tag + ': the flow has validation issues - see generate.log');
        const exportOf = async (f) => { let out; const r = await f.exportToObjectAsync((o) => { out = o; }); return (out || r).content; };
        const content = await exportOf(flow);

        // Read the file back the way Architect's Import does, and make sure it is still valid.
        const copy = await scripting.factories.archFactoryFlows.createFlowDigitalBotAsync('Import check ' + tag, '', language);
        await copy.importFromContentAsync(content);
        const recheck = await copy.validateAsync();
        if (recheck.hasErrors || recheck.hasWarnings) throw new Error(tag + ': the exported file does not re-import cleanly - see generate.log');
        const count = (f) => { let n = 0; f.traverse(() => { n++; }); return n; };
        if (count(copy) !== count(flow)) throw new Error(tag + ': the re-imported flow differs from the original');
        results.push({ tag, content });
      }
    } catch (e) { failure = e; }
  }, 'offline');
  stub.stop();

  if (failure) throw failure;
  if (stub.unhandled.length) throw new Error('The SDK asked for something the stub does not serve: ' + [...new Set(stub.unhandled)].join(', '));

  fs.mkdirSync(path.join(repo, 'chat-bot'), { recursive: true });
  for (const { tag, content } of results) {
    const file = path.join(repo, 'chat-bot', `Workplace Support - Chat Assistant (${tag}).i3DigitalBotFlow`);
    fs.writeFileSync(file, content);
    const flow = decode(content);
    say(`Wrote ${path.relative(repo, file)} (${content.length} bytes, language ${flow.defaultLanguage}, ${flow.variables.length} variables)`);
  }
}

main().then(() => process.exit(0), (e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
