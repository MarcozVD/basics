---
"@marcozvd/basics": minor
"@marcozvd/basics-core": minor
---

Make the Inbox review loop safe. Approve, reject and Approve all wait 6 seconds before they are written: the toast names the note, shows Saving in 6 s and Undo (Z), and Z or Undo cancels the decision. Closing or reloading the tab inside that window cancels it too. Review toasts no longer cover the proposal's Reject, Edit and Approve bar. If Edit and approve fails, the editor comes back with your draft and the field errors. The proposal diff now shows the `source` line that approve writes, so the preview matches the file, and a proposer named `agent:x` no longer becomes `agent:agent:x`. Home no longer approves without a diff: its button is Review, which opens the proposal, and it shows at most three proposals with Show all in Inbox.
