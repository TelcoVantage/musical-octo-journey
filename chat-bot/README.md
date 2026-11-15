# Chat assistant (digital bot flow)

`Workplace Support - Chat Assistant.i3DigitalBotFlow` is a digital bot flow (English,
Australia) that takes over the conversation part of the chat: it greets the customer, asks
what they need help with, collects a short description, and hands the answers to the agent
script.

Web messaging still has to land on the inbound message flow, and only that flow can set the
screen pop and transfer to the queue. So the message flow stays, keeps its emergency, outage,
opening-hours and agent-online checks, and calls this bot in place of the old bot, the welcome
message and the two timed waits.

The file was produced by Genesys' own Architect Scripting SDK, validated by it with no errors
or warnings, and re-imported through it as a check. It has not been imported into a live org,
so your first import is the real test.

## What the customer sees

1. "Hi *name*, welcome to IT Live Chat. I have two quick questions so we can get you to the
   right person." If the message flow has no name, the bot asks for it first.
2. "What do you need help with today?" with buttons: **Password or MFA**, **Email or Teams**,
   **Laptop or hardware**, **Software or access**, **Something else**.
3. "Please describe the problem in a sentence or two. Include any error message you see."
4. "Thanks. I am connecting you to an IT agent now, and they can see what you have told me."

If the customer types instead of pressing a button, the bot asks once more and then hands over
to an agent rather than repeating itself.

The wording is generic. Each message is its own action in the flow, so you can edit it in
Architect after importing.

## What the agent gets

The bot returns these to the message flow:

| Output | Example |
|---|---|
| `fullname` | The name, including one the bot had to ask for |
| `issueCategory` | `Password or MFA` |
| `issueDescription` | `Authenticator app will not scan the QR code` |
| `ticketDescription` | `Password or MFA: Authenticator app will not scan the QR code` |

Passing `ticketDescription` to the script pre-fills the ticket description box.

## Setup

### 1. Import the bot

1. Architect > Flows > **Digital Bot Flow** > Add. Name it
   `Workplace Support - Chat Assistant` and pick **English (Australia)** as the default language.
2. In the new flow: arrow next to Save > **Import** > pick the file.
3. **Save**, then **Publish**.

### 2. Change the inbound message flow

Keep everything down to and including **Check for Not Provided Input**. Then:

1. Delete the **Decision** that checks the name, the old **Call Digital Bot Flow**, the
   **Welcome message**, both **Wait** actions and **Request for more info**.
2. Add **Call Digital Bot Flow** and pick `Workplace Support - Chat Assistant`.
   - Input `fullname` = `Flow.Fullname`
   - Outputs: `fullname` → `Flow.Fullname`, `issueCategory` → `Flow.IssueCategory`,
     `issueDescription` → `Flow.IssueDescription`, `ticketDescription` →
     `Flow.TicketDescription`
3. In **Set Screen Pop**, add the script input `ticketDescription` = `Flow.TicketDescription`.
4. Leave **Transfer to ACD** as it is.

### 3. Script

In the script, switch **Input** on for the variable `ticketDescription`, then republish. It will
then appear as an input on Set Screen Pop.

### 4. Test

1. Start a chat, pick a topic, type a description.
2. The agent's script should open with the description box already filled in.
3. Start a chat that has no name on the form. The bot should ask for the name first.

## Collecting data on what people ask about

The bot saves the topic and the description on every conversation as participant data
(`issueCategory` and `issueDescription`). That is the raw material for deciding later which
self-help guides are worth writing. Ways to report on it:

- **Chat Logs data table.** Your script already writes a row per chat with Insert Data Table
  Row (Chat Logs). Add a topic column to that table and pass `issueCategory` into that step.
  This needs the script to receive `issueCategory` as an input, the same way as
  `ticketDescription`.
- **The tickets.** `ticketDescription` starts with the topic, so every ticket created from a
  chat carries it.
- **Flow milestones.** Architect can mark a milestone per topic, which then shows in the
  Performance views with no export. The milestones have to exist in your org first, and the bot
  file links to them by ID.

## Changing the bot

Topics, wording and the order of steps are in `tools/i3-generator/bot-flow.js`. To rebuild the
file after editing it (Node.js 18 or later):

```bash
cd tools/i3-generator
npm install
npm run generate-bot
```
