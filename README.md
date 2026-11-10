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
| `data-actions/Get-Conversation-Ticket-Number.json` | Reads the ticket number from the conversation | GUI import (Integrations > Actions > Import) |
| `data-actions/Get-Conversation-AI-Summary.json` | Reads the AI summary (`GET /api/v2/conversations/{id}/summaries`) | GUI import |
| `data-actions/Set-Conversation-Ticket-Number.optional.json` | Only needed if step 1 below does not work in your org | GUI import |
| `workflow/chat-ai-summary-to-ticket.yaml` | The workflow, as Archy YAML | Converted to `.i3WorkFlow`, then GUI import |
| `workflow/Build-I3WorkFlow.ps1` / `build-i3workflow.sh` | Turns the YAML into `Chat - AI Summary to Ticket.i3WorkFlow` | Run once on your PC |
| `trigger/trigger.json` | The trigger definition | Typed into the Triggers GUI, or POSTed with API Explorer |

### Why the `.i3WorkFlow` is built on your side

An `.i3WorkFlow` file can only be produced by Architect or Archy while connected to an org:
it embeds the IDs of the data actions it calls, and two of those actions do not exist in your
org until you import them in step 2. The build script does that conversion with Archy
(read-only against your org) and takes about a minute. If you would rather not run a script,
the workflow is eight actions and the click-by-click build is in
[Building the workflow by hand](#building-the-workflow-by-hand).

The YAML has been checked for syntax here but **not** run against a live org, so treat the
first Archy run as the validation step.

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

### 4. Build and import the workflow

You need an OAuth client with the **Client Credentials** grant whose role has Architect > UI >
View, Architect > Flow > View, Integrations > Integration > View and Integrations > Action > View.

Windows (PowerShell):

```powershell
cd workflow
.\Build-I3WorkFlow.ps1 -ClientId <client id>
```

macOS / Linux:

```bash
cd workflow
CLIENT_ID=<client id> CLIENT_SECRET=<secret> ./build-i3workflow.sh
```

Both default to `mypurecloud.com.au` and to the integration names `Genesys Cloud Data Actions`
and `Rabobank ITSM API PROD`. If your Genesys Cloud integration has another name, pass
`-GenesysIntegrationName "<name>"` (PowerShell) or `GENESYS_INTEGRATION_NAME="<name>"` (bash).

The result is `workflow/dist/Chat - AI Summary to Ticket.i3WorkFlow`. Then:

1. Architect > Flows > **Workflow** > Add. Name it `Chat - AI Summary to Ticket`.
2. In the new flow: arrow next to Save > **Import** > pick the `.i3WorkFlow` file.
3. **Save**, then **Publish**.

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

## Building the workflow by hand

Architect > Flows > Workflow > Add, then in the Initial State:

Variables (Data tab): `Flow.conversationId` — String, **Input to flow** ticked. The others
are created as you select them.

| # | Action | Settings |
|---|---|---|
| 1 | Call Data Action | *Get Conversation Ticket Number*. Input `conversationId` = `Flow.conversationId`. Output `ticketNumber` → `Flow.ticketNumber`. Failure and Timeout paths: **End Workflow**. |
| 2 | Decision | `IsNotSetOrEmpty(Flow.ticketNumber)`. Yes path: **End Workflow**. |
| 3 | Call Data Action | *Get Conversation AI Summary*. Input `conversationId` = `Flow.conversationId`. Outputs `summary` → `Flow.generatedSummary`, `editedSummary` → `Flow.editedSummary`, `reason` → `Flow.summaryReason`, `resolution` → `Flow.summaryResolution`, `followup` → `Flow.summaryFollowup`. Failure and Timeout paths: **End Workflow**. |
| 4 | Update Data | String `Flow.summaryText` = `If(IsNotSetOrEmpty(Flow.editedSummary), Flow.generatedSummary, Flow.editedSummary)` |
| 5 | Decision | `IsNotSetOrEmpty(Flow.summaryText)`. Yes path: **End Workflow**. |
| 6 | Update Data | String `Flow.journalText` = the `Append(...)` expression from the YAML (search for `Build journal text`). |
| 7 | Call Data Action | *Update Ticket (v8)*. `Key` = `Flow.ticketNumber`, `JournalUpdate` = `Flow.journalText`. |
| 8 | End Workflow | |

Save and Publish, then continue with step 5.
