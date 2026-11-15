// The chat assistant, expressed with Genesys' Architect Scripting API.
// Edit this file and run `npm run generate-bot` to rebuild the .i3DigitalBotFlow files.
//
// What the bot does:
//   1. Greets the customer by name (asks for the name when the message flow did not supply one).
//   2. Asks what they need help with, as quick-reply buttons.
//   3. Asks for a short description.
//   4. Hands back to the message flow with the answers, so the agent script can show them.

// Topics offered as quick replies. `value` is what is stored; `label` is what the customer sees.
const TOPICS = [
  { value: 'password', label: 'Password or MFA' },
  { value: 'email', label: 'Email or Teams' },
  { value: 'hardware', label: 'Laptop or hardware' },
  { value: 'software', label: 'Software or access' },
  { value: 'other', label: 'Something else' }
];

// Wording, in one place.
const TEXT = {
  welcomeLead: 'Hi ',
  welcomeTail: ', welcome to IT Live Chat. I have two quick questions so we can get you to the right person.',
  welcomeNoName: 'Welcome to IT Live Chat. I have a few quick questions so we can get you to the right person.',
  askName: 'First, what is your name?',
  askTopic: 'What do you need help with today?',
  askDescription: 'Please describe the problem in a sentence or two. Include any error message you see.',
  handOver: 'Thanks. I am connecting you to an IT agent now, and they can see what you have told me.'
};

const q = (text) => JSON.stringify(text);                       // Architect string literal
const chain = (pairs, fallback) => pairs.reduceRight((rest, [test, value]) => `If(${test}, ${value}, ${rest})`, fallback);

module.exports = async function buildBotFlow(scripting, language) {
  const flows = scripting.factories.archFactoryFlows;
  const A = scripting.factories.archFactoryActions;

  // Free-text answers are captured with slots of the built-in "any" type.
  const nlu = { nluDomainVersion: { language: language.tag.toLowerCase(), intents: [], entityTypes: [],
    entities: [{ name: 'customerName', type: 'builtin:any' }, { name: 'issueDescription', type: 'builtin:any' }] } };

  const flow = await flows.createFlowDigitalBotAsync(
    'Workplace Support - Chat Assistant',
    'Greets the customer, asks what they need help with, collects a short description, and hands the answers ' +
      'back to the inbound message flow for the agent script.',
    language, undefined, undefined, nlu);

  const string = flow.dataTypes.string;
  const v = (name, type, opts = {}) => {
    const variable = flow.addVariable('Flow.' + name, type);
    if (opts.input) variable.isInput = true;
    if (opts.output) variable.isOutput = true;
    if (opts.description) variable.description = opts.description;
    return variable;
  };

  // In from the message flow, and back out (the bot may have had to ask for the name).
  v('fullname', string, { input: true, output: true, description: 'Customer name. Passed in by the message flow; asked for when empty.' });
  // Out to the message flow.
  v('issueCategory', string, { output: true, description: 'Topic the customer picked, for example "Password or MFA".' });
  v('issueDescription', string, { output: true, description: 'What the customer typed when asked to describe the issue.' });
  v('ticketDescription', string, { output: true, description: 'Topic and description in one line, ready to pre-fill the ticket description.' });
  // Working variable.
  v('topic', string);

  // One retry is enough: after that the bot hands over to an agent instead of repeating itself.
  flow.userInputSettings.noMatchesMax.setLiteralInt(1);

  const state = flow.startUpObject;
  const say = (container, name, expression) => A.addActionCommunicate(container, name, expression);
  const update = (container, name, statements) => {
    const action = A.addActionUpdateData(container, name);
    for (const [type, variable, expression] of statements) action.addUpdateDataStatement(type, 'Flow.' + variable, expression);
    return action;
  };

  // 0. Defaults.
  update(state, 'Set defaults', [[string, 'topic', q('other')]]);

  // 1. Name.
  const hasName = A.addActionDecision(state, 'Name supplied?', '!IsNotSetOrEmpty(Flow.fullname)');
  say(hasName.outputYes, 'Welcome by name', `Append(${q(TEXT.welcomeLead)}, Flow.fullname, ${q(TEXT.welcomeTail)})`);
  say(hasName.outputNo, 'Welcome', q(TEXT.welcomeNoName));
  const askName = A.addActionAskForSlot(hasName.outputNo, 'Ask for name');
  askName.setSlot('customerName');
  askName.question.setExpression(q(TEXT.askName));
  update(hasName.outputNo, 'Keep name', [[string, 'fullname', 'If(IsNotSetOrEmpty(Slot.customerName), "", Slot.customerName)']]);

  // 2. Topic.
  const menu = A.addActionDigitalMenu(state, 'Ask topic');
  menu.question.setExpression(q(TEXT.askTopic));
  for (const t of TOPICS) {
    const choice = menu.addChoice(t.value);
    choice.label.setLiteralString(t.label);
    choice.setTypePostback(t.value);
  }
  menu.selection.setVariable('Flow.topic');
  // If the customer types instead of pressing a button, carry on as "Something else" rather than failing.
  for (const output of [menu.outputMaxNoMatches, menu.outputMaxNoInputs]) {
    if (output && output.canEnableDisable && !output.enabled) output.enabled = true;
  }

  update(state, 'Work out topic', [
    [string, 'topic', 'If(IsNotSetOrEmpty(Flow.topic), "other", Flow.topic)'],
    [string, 'issueCategory', chain(TOPICS.map((t) => [`Flow.topic == ${q(t.value)}`, q(t.label)]), q('Something else'))]
  ]);

  // 3. Description.
  const describe = A.addActionAskForSlot(state, 'Ask for description');
  describe.setSlot('issueDescription');
  describe.question.setExpression(q(TEXT.askDescription));

  update(state, 'Prepare details for agent', [
    [string, 'issueDescription', 'If(IsNotSetOrEmpty(Slot.issueDescription), "", Slot.issueDescription)'],
    [string, 'ticketDescription', 'If(IsNotSetOrEmpty(Flow.issueDescription), Flow.issueCategory, Append(Flow.issueCategory, ": ", Flow.issueDescription))']
  ]);

  // 4. Hand over.
  const save = A.addActionSetParticipantData(state, 'Save details on conversation');
  save.addAttributeNameValuePair(q('issueCategory'), 'Flow.issueCategory');
  save.addAttributeNameValuePair(q('issueDescription'), 'Flow.issueDescription');
  say(state, 'Hand over message', q(TEXT.handOver));
  A.addActionExitBotFlow(state, 'Exit - hand over to agent');

  return flow;
};
module.exports.TOPICS = TOPICS;
