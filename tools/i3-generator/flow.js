// The workflow, expressed with Genesys' Architect Scripting API.
// Edit this file and run `npm run generate` to rebuild the .i3WorkFlow.
module.exports = async function buildFlow(scripting, ids) {
  const flows = scripting.factories.archFactoryFlows;
  const actions = scripting.factories.archFactoryActions;

  const flow = await flows.createFlowWorkflowAsync(
    'Chat - AI Summary to Ticket',
    'Started by a trigger when after-conversation work completes on a chat. Reads the ticket number the agent ' +
      'script stored on the conversation (participant attribute ticketReturnCode), fetches the AI summary and ' +
      'posts it to the ticket with the Update Ticket data action.',
    scripting.languages.archLanguages.englishUnitedStates
  );

  const string = flow.dataTypes.string;
  const v = {};
  for (const name of ['conversationId', 'ticketNumber', 'generatedSummary', 'editedSummary', 'summaryReason',
    'summaryResolution', 'summaryFollowup', 'summaryText', 'journalText']) {
    v[name] = flow.addVariable('Flow.' + name, string);
  }
  // The trigger fills workflow inputs by name from the event, so this name must stay "conversationId".
  v.conversationId.isInput = true;
  v.conversationId.description = 'Filled by the trigger (conversationId attribute of the event).';

  const state = flow.startUpObject;
  const end = (container, name) => actions.addActionEndWorkflow(container, name);
  const input = (action, name, expression) => action.dataActionInputs.getNamedValueByName(name).value.setExpression(expression);
  const output = (action, name, variable) => action.dataActionOutputsSuccess.getNamedValueByName(name).value.setVariable(variable);

  // 1. Ticket number written by the agent script (Output variable ticketReturnCode).
  const getTicket = actions.addActionCallData(state, 'Get ticket number from conversation');
  await getTicket.setDataActionByIdAsync(ids.getTicket);
  input(getTicket, 'conversationId', 'Flow.conversationId');
  output(getTicket, 'ticketNumber', v.ticketNumber);
  end(getTicket.outputFailure, 'End - ticket lookup failed');
  end(getTicket.outputTimeout, 'End - ticket lookup timed out');

  // 2. No ticket was created on this chat: nothing to do.
  const noTicket = actions.addActionDecision(state, 'No ticket on this chat?', 'IsNotSetOrEmpty(Flow.ticketNumber)');
  end(noTicket.outputYes, 'End - no ticket');

  // 3. AI summary of the conversation.
  const getSummary = actions.addActionCallData(state, 'Get AI summary');
  await getSummary.setDataActionByIdAsync(ids.getSummary);
  input(getSummary, 'conversationId', 'Flow.conversationId');
  output(getSummary, 'summary', v.generatedSummary);
  output(getSummary, 'editedSummary', v.editedSummary);
  output(getSummary, 'reason', v.summaryReason);
  output(getSummary, 'resolution', v.summaryResolution);
  output(getSummary, 'followup', v.summaryFollowup);
  end(getSummary.outputFailure, 'End - summary lookup failed');
  end(getSummary.outputTimeout, 'End - summary lookup timed out');

  // 4. Prefer the agent-edited summary over the generated one.
  actions.addActionUpdateData(state, 'Pick summary text').addUpdateDataStatement(string, v.summaryText,
    'If(IsNotSetOrEmpty(Flow.editedSummary), Flow.generatedSummary, Flow.editedSummary)');
  const noSummary = actions.addActionDecision(state, 'No summary available?', 'IsNotSetOrEmpty(Flow.summaryText)');
  end(noSummary.outputYes, 'End - no summary');

  // 5. Text that goes into the ticket journal. The ticketing system shows notes as HTML, so line breaks in the
  //    summary are turned into <br> tags; without that the note is one long paragraph.
  actions.addActionUpdateData(state, 'Build journal text').addUpdateDataStatement(string, v.journalText,
    'Append("<b>Genesys Cloud AI summary</b><br><br>", ' +
    'Replace(Replace(Flow.summaryText, "\\r", ""), "\\n", "<br>"), ' +
    'If(IsNotSetOrEmpty(Flow.summaryReason), "", Append("<br><br><b>Reason:</b> ", Flow.summaryReason)), ' +
    'If(IsNotSetOrEmpty(Flow.summaryResolution), "", Append("<br><br><b>Resolution:</b> ", Flow.summaryResolution)), ' +
    'If(IsNotSetOrEmpty(Flow.summaryFollowup), "", Append("<br><br><b>Follow-up:</b> ", Flow.summaryFollowup)), ' +
    '"<br><br>Conversation ID: ", Flow.conversationId)');

  // 6. Post it to the ticket.
  const updateTicket = actions.addActionCallData(state, 'Update ticket with AI summary');
  await updateTicket.setDataActionByIdAsync(ids.updateTicket);
  input(updateTicket, 'Key', 'Flow.ticketNumber');
  input(updateTicket, 'JournalUpdate', 'Flow.journalText');

  end(state, 'End Workflow');
  return flow;
};
