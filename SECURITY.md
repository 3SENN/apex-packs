# Reporting a harmful pack

If a pack in this index could harm the people who install it, tell the
maintainers privately, not in a public issue:

1. Open the **Security** tab of this repository.
2. Choose **Report a vulnerability**.
3. Give the pack's id and version, what it does, and how you found out.

Report it this way when a pack:

- sends what it reads, or what people type, anywhere its description doesn't
  say;
- tells the companion, through a skill, a tool description or a companion's
  instructions, to do something the person didn't ask for;
- runs scripts on sites it has no clear reason to touch;
- holds a key, a token or someone's personal data;
- is signed by a key that doesn't belong to its author.

The same goes for a hole in the index itself: a check that lets something
through, or a way to change a pack's pinned key.

## What happens next

A maintainer replies in the report. A pack that harms people is withdrawn
from the index: Apex stops offering it and its updates, and shows everyone who
installed it a notice with the reason. Apex never deletes it from their
computer; they turn it off or remove it on **Packs**.
