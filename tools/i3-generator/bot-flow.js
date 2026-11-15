// The chat assistant, expressed with Genesys' Architect Scripting API.
// Edit this file and run `npm run generate-bot` to rebuild the .i3DigitalBotFlow files.
//
// What the bot does:
//   1. Greets the customer by name (asks for the name when the message flow did not supply one).
//   2. Asks what they need help with, as quick-reply buttons.
//   3. If a self-help guide is set for that topic, sends it and asks whether it solved the problem.
//   4. Otherwise asks for a short description.
//   5. Hands back to the message flow with the answers, so the agent script can show them.

// Topics offered as quick replies. `value` is what is stored; `label` is what the customer sees.
// `guide` names the flow variable that holds that topic's self-help text (empty = no self-help).
const TOPICS = [
  { value: 'password', label: 'Password or MFA', guide: 'guidePasswordMfa' },
  { value: 'email', label: 'Email or Teams', guide: 'guideEmailTeams' },
  { value: 'hardware', label: 'Laptop or hardware', guide: 'guideHardware' },
  { value: 'software', label: 'Software or access', guide: 'guideSoftware' },
  { value: 'other', label: 'Something else', guide: null }
];

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
    'Greets the customer, asks what they need help with, offers self-help where a guide is set, collects a short ' +
      'description, and hands the answers back to the inbound message flow for the agent script.',
    language, undefined, undefined, nlu);

  const string = flow.dataTypes.string, boolean = flow.dataTypes.boolean;
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
  v('selfHelpResolved', boolean, { output: true, description: 'True when the customer said the self-help guide solved the problem.' });
  // Working variables.
  v('topic', string);
  v('guideText', string);
  // Self-help text per topic. Leave a value empty to skip self-help for that topic.
  for (const t of TOPICS.filter((x) => x.guide)) {
    v(t.guide, string, { description: `Self-help message for "${t.label}". Include the guide link. Leave empty to skip self-help for this topic.` });
  }

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
  update(state, 'Set defaults', [[boolean, 'selfHelpResolved', 'false'], [string, 'topic', q('other')]]);
  // Self-help text per topic, all in one place. Empty = no self-help for that topic.
  update(state, 'Self-help guides (edit here)', TOPICS.filter((t) => t.guide).map((t) => [string, t.guide, q(t.guideText || '')]));

  // 1. Name.
  const hasName = A.addActionDecision(state, 'Name supplied?', '!IsNotSetOrEmpty(Flow.fullname)');
  say(hasName.outputYes, 'Welcome by name', `Append("Welcome, ", Flow.fullname, ", to IT Live Chat.")`);
  say(hasName.outputNo, 'Welcome', q('Welcome to IT Live Chat.'));
  const askName = A.addActionAskForSlot(hasName.outputNo, 'Ask for name');
  askName.setSlot('customerName');
  askName.question.setExpression(q('Before we start, what is your name?'));
  update(hasName.outputNo, 'Keep name', [[string, 'fullname', 'If(IsNotSetOrEmpty(Slot.customerName), "", Slot.customerName)']]);

  // 2. Topic.
  const menu = A.addActionDigitalMenu(state, 'Ask topic');
  menu.question.setExpression(q('What do you need help with today?'));
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
    [string, 'issueCategory', chain(TOPICS.map((t) => [`Flow.topic == ${q(t.value)}`, q(t.label)]), q('Something else'))],
    [string, 'guideText', chain(TOPICS.filter((t) => t.guide).map((t) => [`Flow.topic == ${q(t.value)}`, 'Flow.' + t.guide]), '""')]
  ]);

  // 3. Self-help, only when a guide is set for the topic.
  const hasGuide = A.addActionDecision(state, 'Guide available?', '!IsNotSetOrEmpty(Flow.guideText)');
  say(hasGuide.outputYes, 'Send guide', 'Flow.guideText');
  const solved = A.addActionAskForBoolean(hasGuide.outputYes, 'Did the guide help?');
  solved.question.setExpression(q('Did that solve the problem?'));
  const yes = solved.getOutputByName('Yes');
  update(yes, 'Mark resolved', [[boolean, 'selfHelpResolved', 'true']]);
  A.addActionSetParticipantData(yes, 'Record self-help result').addAttributeNameValuePair(q('selfHelpResolved'), q('true'));
  say(yes, 'Goodbye', q('Glad that helped. If you need anything else, start a new chat any time.'));
  A.addActionExitBotFlow(yes, 'Exit - solved by self-help');

  // 4. Description.
  const describe = A.addActionAskForSlot(state, 'Ask for description');
  describe.setSlot('issueDescription');
  describe.question.setExpression(q('Please describe the problem in a sentence or two. Include any error message you see.'));

  update(state, 'Prepare details for agent', [
    [string, 'issueDescription', 'If(IsNotSetOrEmpty(Slot.issueDescription), "", Slot.issueDescription)'],
    [string, 'ticketDescription', 'If(IsNotSetOrEmpty(Flow.issueDescription), Flow.issueCategory, Append(Flow.issueCategory, ": ", Flow.issueDescription))']
  ]);

  // 5. Hand over.
  const save = A.addActionSetParticipantData(state, 'Save details on conversation');
  save.addAttributeNameValuePair(q('issueCategory'), 'Flow.issueCategory');
  save.addAttributeNameValuePair(q('issueDescription'), 'Flow.issueDescription');
  say(state, 'Hand over message', q('Thanks. I am connecting you to an IT agent now, and they can see what you have told me.'));
  A.addActionExitBotFlow(state, 'Exit - hand over to agent');

  return flow;
};
module.exports.TOPICS = TOPICS;
