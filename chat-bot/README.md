# Chat assistant (digital bot flow)

A digital bot flow that takes over the conversation part of the chat: it greets the customer,
asks what they need help with, offers self-help where you have set a guide, collects a short
description, and hands the answers to the agent script.

Web messaging still has to land on the inbound message flow, and only that flow can set the
screen pop and transfer to the queue. So the message flow stays, keeps its emergency, outage,
opening-hours and agent-online checks, and calls this bot in place of the welcome message and
the two timed waits.

## Files

| File | Use it when |
|---|---|
| `Workplace Support - Chat Assistant (en-AU).i3DigitalBotFlow` | The inbound message flow's language is English (Australia) |
| `Workplace Support - Chat Assistant (en-US).i3DigitalBotFlow` | The inbound message flow's language is English (United States) |

The two files are identical apart from the language. A bot flow can only be called from a
message flow that supports the same language.

Both were produced by Genesys' own Architect Scripting SDK, validated by it with no errors or
warnings, and re-imported through it as a check. Neither has been imported into a live org, so
your first import is the real test.

## What the customer sees

1. "Welcome, *name*, to IT Live Chat." If the message flow has no name, the bot asks for it.
2. "What do you need help with today?" with buttons: **Password or MFA**, **Email or Teams**,
   **Laptop or hardware**, **Software or access**, **Something else**.
3. If you have set a guide for that topic: the guide text, then "Did that solve the problem?"
   - **Yes:** a goodbye message, and the chat ends without reaching an agent.
   - **No:** carries on.
4. "Please describe the problem in a sentence or two. Include any error message you see."
5. "Thanks. I am connecting you to an IT agent now, and they can see what you have told me."

If the customer types instead of pressing a button, the bot asks once more and then hands over
to an agent rather than repeating itself.

## What the agent gets

The bot returns these to the message flow, and also saves the first two on the conversation as
participant data:

| Output | Example |
|---|---|
| `issueCategory` | `Password or MFA` |
| `issueDescription` | `Authenticator app will not scan the QR code` |
| `ticketDescription` | `Password or MFA: Authenticator app will not scan the QR code` |
| `fullname` | The name, including one the bot had to ask for |
| `selfHelpResolved` | `true` when the guide solved it |

Passing `ticketDescription` to the script pre-fills the ticket description box.

## Setup

### 1. Import the bot

1. Architect > Flows > **Digital Bot Flow** > Add. Name it
   `Workplace Support - Chat Assistant` and pick the same default language as the file.
2. In the new flow: arrow next to Save > **Import** > pick the file.
3. **Save**, then **Publish**.

### 2. Turn on self-help (optional, per topic)

Self-help ships switched off because the guide links were not known. In the bot, open the
action **Self-help guides (edit here)** and type the message for a topic between the quotes,
including the link. For example:

```
"Most MFA problems are fixed by re-registering the Authenticator app. Guide: https://..."
```

A topic with empty text skips self-help and goes straight to the description question.

### 3. Change the inbound message flow

Keep everything down to and including **Check for Not Provided Input**. Then:

1. Delete the **Decision** that checks the name, the old **Call Digital Bot Flow**, the
   **Welcome message**, both **Wait** actions and **Request for more info**.
2. Add **Call Digital Bot Flow** and pick `Workplace Support - Chat Assistant`.
   - Input `fullname` = `Flow.Fullname`
   - Outputs: `fullname` → `Flow.Fullname`, `issueCategory` → `Flow.IssueCategory`,
     `issueDescription` → `Flow.IssueDescription`, `ticketDescription` →
     `Flow.TicketDescription`, `selfHelpResolved` → `Flow.SelfHelpResolved`
3. Add a **Decision** with `Flow.SelfHelpResolved`. On **Yes**, add **Disconnect**.
4. In **Set Screen Pop**, add the script input `ticketDescription` = `Flow.TicketDescription`.
5. Leave **Transfer to ACD** as it is.

Before deleting the old bot call, check what the old bot does. This bot only asks for the name
when it is missing; if the old one collected anything else, that needs adding here first.

### 4. Script

In the script, switch **Input** on for the variable `ticketDescription`, then republish. It will
then appear as an input on Set Screen Pop.

### 5. Test

1. Start a chat, pick a topic, type a description.
2. The agent's script should open with the description box already filled in.
3. Set a guide for one topic, start a chat, pick that topic and answer **Yes**. The chat should
   end without being queued.

## Changing the bot

Topics, wording and the order of steps are in `tools/i3-generator/bot-flow.js`. To rebuild both
files after editing it (Node.js 18 or later):

```bash
cd tools/i3-generator
npm install
npm run generate-bot
```
