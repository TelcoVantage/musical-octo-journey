# Script panel redesign

Design only. Nothing here changes a variable, an action or the Submit button's behaviour.

![Mockup of the redesigned script panel](mockup.png)

The mockup is a drawing of the target, not a screenshot from Genesys. It uses only things the
Script Editor can do: container background colours, padding and margins, fixed sizes, and text
size, weight and colour. There are no rounded corners or shadows.

## Colours

| Use | Hex |
|---|---|
| Header background | `#1B2A49` |
| Header sub-line text | `#B8C4D9` |
| Main text | `#1F2933` |
| Labels and section title | `#627D98` |
| Status text | `#486581` |
| Card background | `#F5F7FA` |
| Card border | `#D9E2EC` |
| Divider line | `#E4E7EB` |
| Text area border | `#BCCCDC` |
| Button background | `#1A56DB` |
| White | `#FFFFFF` |

Font: leave the editor's default family; only sizes, weights and colours change.

## Structure

Everything sits in the page's root vertical container. Set the root to width **Stretch**,
background `#FFFFFF`, padding `0`.

Indentation shows what goes inside what.

```
Root (vertical)
├─ Header (vertical container)
│   ├─ Text  {{fullname}}
│   └─ Text  Messaging · {{Scripter.Queue Name}}
├─ Customer details (vertical container)
│   ├─ Text  CUSTOMER DETAILS
│   ├─ Row (horizontal container)   Text "Full name"  +  Text {{fullname}}
│   ├─ Divider
│   ├─ Row (horizontal container)   Text "Email"      +  Text {{email}}
│   ├─ Divider
│   ├─ Row (horizontal container)   Text "Location"   +  Text {{location}}
│   └─ Divider
├─ Create ticket card (vertical container)
│   ├─ Text  Create ticket
│   ├─ Text  Description
│   ├─ Text area  (ticketDescription — the existing one)
│   └─ Button     (the existing Submit button)
├─ Text  {{ticketStatus}}          (the existing one)
└─ Ticket number (horizontal container)
    ├─ Text  Ticket number
    └─ Text  {{InteractionId}}     (the existing one)
```

## Settings per component

| Component | Settings |
|---|---|
| **Header** container | Width Stretch. Background `#1B2A49`. Padding 18 top/bottom, 20 left/right. |
| `{{fullname}}` (header) | Size 20, bold, colour `#FFFFFF`. |
| `Messaging · {{Scripter.Queue Name}}` | Size 13, colour `#B8C4D9`. Margin top 4. |
| **Customer details** container | Width Stretch. Padding 20 top, 20 left/right, 6 bottom. |
| `CUSTOMER DETAILS` | Size 12, bold, colour `#627D98`. Margin bottom 6. Type it in capitals. |
| Each **Row** container | Horizontal. Width Stretch. Padding 11 top/bottom. |
| Row label (`Full name`, `Email`, `Location`) | Width 110 pixels. Size 13, colour `#627D98`. No colon. |
| Row value (`{{fullname}}`, `{{email}}`, `{{location}}`) | Size 15, colour `#1F2933`. |
| **Divider** | An empty container: width Stretch, height 1 pixel, background `#E4E7EB`. |
| **Create ticket card** container | Width Stretch. Margin 14 top, 20 left/right. Padding 16. Background `#F5F7FA`. Border 1, colour `#D9E2EC`. |
| `Create ticket` (heading) | Size 16, bold, colour `#1F2933`. |
| `Description` (label) | Size 13, colour `#627D98`. Margin 12 top, 6 bottom. |
| Text area | Width Stretch, height 110 pixels. Background `#FFFFFF`. Border 1, colour `#BCCCDC`. Size 14. |
| Button | Text `Create ticket`. Background `#1A56DB`, text `#FFFFFF`, bold, size 14. Margin top 12. Width Auto. |
| `{{ticketStatus}}` | Size 14, colour `#486581`. Margin 14 top, 20 left/right. |
| **Ticket number** container | Horizontal. Width Stretch. Margin 10 top, 20 left/right, 20 bottom. Padding 14 top/bottom, 16 left/right. Background `#F5F7FA`. Border 1, colour `#D9E2EC`. |
| `Ticket number` (label) | Width 110 pixels. Size 13, colour `#627D98`. |
| `{{InteractionId}}` | Size 18, bold, colour `#1F2933`. |

## Keeping the back end untouched

- **Move, don't recreate** the text area, the button, `{{ticketStatus}}` and
  `{{InteractionId}}`. Drag the existing components into the new containers so their variable
  bindings and the button's click action stay exactly as they are.
- Renaming the button from `Submit` to `Create ticket` changes its label only.
- The header sub-line uses `{{Scripter.Queue Name}}`, a built-in variable. Leave that line out
  if you don't want it.
- The "User's inputs" heading is replaced by the header band and the `CUSTOMER DETAILS` title.

If a setting isn't where you expect, look under the component's **Layout** section for width,
height and margin, and under **Appearance** or **Font** for colours, borders and text. The exact
section names were written from memory of the editor.
