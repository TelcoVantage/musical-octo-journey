# Chat AI summary → ticket journal (Genesys Cloud)

When an agent finishes a chat on which they created a ticket, the AI summary of the
conversation is added to that ticket's journal with the existing **Update Ticket (v8)**
data action. Chats without a ticket are ignored.

```
Agent script                         Trigger                      Workflow
------------                         -------                      --------
Create Ticket (v8)                   topic: conversation ACW      1. Get Conversation Ticket Number
  ReturnCode -> ticketReturnCode     mediaType == MESSAGE         2. no ticket?  -> end
  (script variable, Output = on)     queueId   == <your queue>    3. Get Conversation AI Summary
        |                            delay 60 s                   4. no summary? -> end
        v                                   |                     5. Update Ticket (v8)
participant attribute  ---------------------+------------------>     Key           = ticket number
"ticketReturnCode"                                                    JournalUpdate = AI summary
```

## What is in this repo

| File | What it is | How it gets into Genesys Cloud |
|---|---|---|
| `workflow/Chat - AI Summary to Ticket.i3WorkFlow` | The workflow, in Architect's export format | Architect GUI: Save > Import |
| `workflow/set-data-action-ids.html` | Offline page that puts your data action IDs into the workflow file | Open in a browser, download the result |
| `data-actions/Get-Conversation-Ticket-Number.json` | Reads the ticket number from the conversation | GUI import (Integrations > Actions > Import) |
| `data-actions/Get-Conversation-AI-Summary.json` | Reads the AI summary (`GET /api/v2/conversations/{id}/summaries`) | GUI import |
| `data-actions/Set-Conversation-Ticket-Number.optional.json` | Only needed if step 1 below does not work in your org | GUI import |
| `trigger/trigger.json` | The trigger definition | Typed into the Triggers GUI, or POSTed with API Explorer |
| `tools/i3-generator/` | Source of the workflow and the script that builds the `.i3WorkFlow` | Not imported; only for changing the workflow |

### About the `.i3WorkFlow` file

It was produced by Genesys' own Architect Scripting SDK (the engine behind Architect and
Archy), so it is in Architect's native export format. The build re-imports the file through
the same engine and fails unless it validates with no errors or warnings.

It has **not** been imported into a live org from here, so treat your first import as the
real test.

Architect links a workflow to its data actions **by ID**, not by name:

- **Update Ticket (v8)** is referenced by the ID visible in your screenshot,
  `custom_-_eeb9b6e4-05b2-4d0e-95a5-1139ac535f19`. It was read from a photo, so check it.
- The two new data actions get their IDs from your org when you import them in step 2.
  Step 4 puts those IDs into the file.

## Setup

### 1. Script: expose the ticket number

In the script editor open the variable **ticketReturnCode** and switch **Output** on
(leave Input off). Genesys then writes its value to the conversation as a participant
attribute named `ticketReturnCode` as soon as Create Ticket returns it. Republish the script.

Check it once: create a ticket on a test chat, then call
`GET /api/v2/conversations/{conversationId}` in API Explorer and look for
`"ticketReturnCode"` under a participant's `attributes`.

If it is not there, import `Set-Conversation-Ticket-Number.optional.json` and call it from
the **Create ticket** button, after Create Ticket (v8), with
`conversationId = {{Scripter.Interaction ID}}`,
`participantId = {{Scripter.Customer Participant ID}}` and
`ticketNumber = {{ticketReturnCode}}`.

If you would rather store `ticketNumber` than `ticketReturnCode`, change the attribute name
at the end of `translationMap.ticketNumbers` in `Get-Conversation-Ticket-Number.json`.

### 2. Import the two data actions

Admin > Integrations > Actions > **Import**, once per file. Choose your
**Genesys Cloud Data Actions** integration, keep the names as they are, then
**Save & Publish** each one.

The OAuth client behind that integration needs a role with:

- Conversation > Communication > View
- Conversation > Summary > View

Test each action with a real conversation ID before moving on (Setup > Test).

### 3. Check Update Ticket (v8)

- It must be **published**. The screenshot shows it as a draft; a flow cannot call a draft.
- AI summaries contain quotes and line breaks. In Setup > Configuration, make sure the
  request body escapes the text, otherwise the request is invalid JSON and the update fails:

  ```
  "JournalUpdate": "$esc.jsonString(${input.JournalUpdate})"
  ```

### 4. Import the workflow

1. Download `workflow/set-data-action-ids.html` and open it in your browser (it runs
   offline and sends nothing anywhere).
2. Open each of the two new data actions in Admin and paste its address-bar URL (or just the
   `custom_-_…` ID) into the matching box. Check the Update Ticket (v8) ID.
3. Click **Download .i3WorkFlow**.
4. Architect > Flows > **Workflow** > Add. Name it `Chat - AI Summary to Ticket`.
5. In the new flow: arrow next to Save > **Import** > pick the downloaded file.
6. **Save**, then **Publish**.

**Shortcut without the helper page:** import
`workflow/Chat - AI Summary to Ticket.i3WorkFlow` as it is. The steps *Get ticket number from
conversation* and *Get AI summary* will then show "The selected data action could not be
found". Open each one and pick the data action again; the input and output mappings stay in
place.

### 5. Create the trigger

Admin > Architect > Triggers > **Add Trigger**:

| Field | Value |
|---|---|
| Name | `Chat ACW - AI Summary to Ticket` |
| Topic Name | `v2.detail.events.conversation.{id}.acw` |
| Workflow Target | `Chat - AI Summary to Ticket` |
| Data Format | `TopLevelPrimitives` |
| Condition 1 | JSON Path `mediaType`, Equals (==), `MESSAGE` |
| Condition 2 | JSON Path `queueId`, Equals (==), *your chat queue's ID* |
| Delay By Seconds | `60` |

Save, then switch it to **Active**. (`trigger/trigger.json` is the same definition for
`POST /api/v2/processautomation/triggers`, once the two `REPLACE_...` values are filled in.)

The queue ID is the GUID in the address bar when the queue is open in Admin.

### 6. Test

1. Take a chat on the queue, click **Create ticket**, end the chat and complete wrap-up.
2. About a minute later the ticket journal should contain
   `Genesys Cloud AI summary: ... | Reason: ... | Resolution: ... | Conversation ID: ...`.

If nothing arrives, check in this order: the attribute from step 1 exists; each data action
returns data in its Test tab for that conversation ID; the trigger is Active and its queue ID
is right; the workflow is published.

## Behaviour notes

- **Which summary:** the agent-edited text is used when the agent changed the summary,
  otherwise the generated one.
- **Timing:** the trigger fires when the agent completes wrap-up and waits 60 seconds. If
  summaries arrive later in your org, raise *Delay By Seconds* (maximum 900).
- **Transfers:** wrap-up completes once per agent, so a transferred chat adds one journal
  entry per agent.
- **No summary / no ticket:** the workflow ends without calling the ticketing system.
- **Data action timeouts** are left on Architect's suggested default.

## What the workflow contains

One state, `Initial State`. `Flow.conversationId` is a String marked **Input to flow**; the
trigger fills it.

| # | Action | Settings |
|---|---|---|
| 1 | Call Data Action | *Get Conversation Ticket Number*. Input `conversationId` = `Flow.conversationId`. Output `ticketNumber` → `Flow.ticketNumber`. Failure and Timeout paths: **End Workflow**. |
| 2 | Decision | `IsNotSetOrEmpty(Flow.ticketNumber)`. Yes path: **End Workflow**. |
| 3 | Call Data Action | *Get Conversation AI Summary*. Input `conversationId` = `Flow.conversationId`. Outputs `summary` → `Flow.generatedSummary`, `editedSummary` → `Flow.editedSummary`, `reason` → `Flow.summaryReason`, `resolution` → `Flow.summaryResolution`, `followup` → `Flow.summaryFollowup`. Failure and Timeout paths: **End Workflow**. |
| 4 | Update Data | String `Flow.summaryText` = `If(IsNotSetOrEmpty(Flow.editedSummary), Flow.generatedSummary, Flow.editedSummary)` |
| 5 | Decision | `IsNotSetOrEmpty(Flow.summaryText)`. Yes path: **End Workflow**. |
| 6 | Update Data | String `Flow.journalText` = summary, then reason, resolution and follow-up when present, then the conversation ID. |
| 7 | Call Data Action | *Update Ticket (v8)*. `Key` = `Flow.ticketNumber`, `JournalUpdate` = `Flow.journalText`. |
| 8 | End Workflow | |

## Changing the workflow

The workflow is defined in `tools/i3-generator/flow.js`. To rebuild the import file and the
helper page after editing it (Node.js 18 or later):

```bash
cd tools/i3-generator
npm install
npm run generate
```

To bake real IDs or other integration names straight into the file:

```bash
npm run generate -- --get-ticket-id=custom_-_... --get-summary-id=custom_-_... \
  --update-ticket-id=custom_-_... --genesys-integration="Genesys Cloud Data Actions" \
  --ticket-integration="Rabobank ITSM API PROD"
```

The generator runs offline and needs no credentials: `org-stub.js` answers the few API calls
the SDK makes locally. The contracts of the two new data actions are read from
`data-actions/*.json`; the contract of Update Ticket (v8) (inputs `Key` and `JournalUpdate`,
no outputs) is written in `generate.js`.
