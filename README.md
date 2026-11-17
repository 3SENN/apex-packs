# Atelier packs

Made by everyone.

Atelier is the browser you make your own. Whatever you make in it can travel as
a pack: one signed file that someone else adds to their browser with one yes.
This repository is the community index Atelier comes with. Open **Packs ›
Browse** in Atelier to see what's here and install it.

A pack can hold skills, routine templates, site boosts, accent colours,
companions, connectors, apps and panels, and new commands and tools for the
companion.

| Repository | For |
|---|---|
| **atelier-packs** (this one) | The index: finished packs, signed and reviewed in the open. Every copy of Atelier reads it, so it changes only when a pack is added or updated. |
| [atelier-apps](https://github.com/3SENN/atelier-apps) | Building packs by hand: guides, working examples, the packing tools, and [how Atelier fits together](https://github.com/3SENN/atelier-apps/blob/main/docs/how-it-works.md). |

**What the index takes:** packs (`.atelierpack`), apps and games (`.atelierapp`)
and worlds (`.atelierworld`). Each sits on a shelf in Browse (games, tools,
worlds, creative, learning, productivity, companions or other), with its own
colour and picture. Archives up to 20 MB live in this repository; a bigger
app is hosted as a release asset and listed by its address and hash.

## In the index today

The index is young. These are the packs in it so far, each reviewed in the
open before it was added.

| Pack | What it adds | What it can do |
|---|---|---|
| [Writing helpers](sources/writing-helpers) | `/tighten`, `/meeting-notes`, `/weekly-review` and a Friday review routine | Nothing beyond adding skills and a template |
| [Nordic accents](sources/nordic-accents) | Fjord, Lingonberry, Moss and Aurora accents | Nothing beyond adding accents |
| [Calm Wikipedia](sources/calm-wikipedia) | Easier reading on Wikipedia | Changes how Wikipedia looks (CSS only) |
| [Countdowns](sources/countdowns) | A sidebar panel and a new tab card for the days that matter | Keeps its dates in its own storage; reads no pages, sends nothing |

## Installing is always your decision

Every install shows you what a pack can do, in plain words, and all of its
code before anything is added. Pack code runs in its own sandbox and reaches
nothing but what its manifest asks for. A companion can build and propose a
pack; only you can install one.

Atelier lists this index on **Packs › Browse** from the start. If you removed it,
add it again with this address:

```
https://raw.githubusercontent.com/3SENN/atelier-packs/main/index.json
```

## Share what you made

1. **Make it and sign it.** In Atelier, describe it on **Packs › New pack** and a
   companion builds it with you, or use **Share as pack** on a skill, boost,
   app or companion you already have; then choose **Export…** on its draft.
   Atelier signs the file with your own author key. Built it by hand? Sign it
   with [`tools/pack.mjs`](https://github.com/3SENN/atelier-apps/tree/main/tools)
   from atelier-apps.
2. **Add the file.** Fork this repository and put it in `packs/` as
   `<id>-<version>.atelierpack`, `.atelierapp` or `.atelierworld`. A picture for its
   card goes beside it as `<id>-<version>.png` (PNG, up to 4 MB; Share… in
   Atelier saves one).
3. **Unpack it and rebuild the index**, so reviewers can read every file:
   ```
   npm install
   npm run unpack -- packs/<id>-<version>.atelierapp
   npm run index
   ```
4. **Put it on a shelf.** In `index.json`, give your entry a `category`
   (`games`, `tools`, `worlds`, `creative`, `learning`, `productivity`,
   `companions` or `other`) and, if you like, a `color` (`#rrggbb`) for its
   card. `npm run index` keeps both from then on.
5. **Check it and open a pull request.**
   ```
   npm run check
   ```
   A new pack also adds its key's pin to `keys.json`: `npm run check` prints
   the exact line.

**An app bigger than 20 MB** is hosted as a release asset in a repository of
your own, at an address whose bytes never change. Unpack your local copy with
`npm run unpack -- <file>`, and add its entry to `index.json` by hand:
`node tools/pack.mjs … --entry <address>` in atelier-apps prints it. CI downloads
it, checks it like any other, and checks again every week that it is still
there, unchanged.

**A bundled app** (a build tool's output) can't be read line by line, so its
manifest's `homepage` points at its source code, and `sources/<id>/` lists
its built files by hash in `__atelier/built.txt` instead of copying them.

**To update**, replace the file with the new version (one version per pack),
unpack it again and rebuild the index. Updates must be signed with the key
`keys.json` pins for that pack: Atelier on people's computers refuses a pack
signed by anyone else.

Building by hand? [atelier-apps](https://github.com/3SENN/atelier-apps) has the
guides, working examples and packing tools.

### Sharing a companion

In Atelier, open Settings › Companions, choose **Share as pack…** on the
companion's menu, then **Export…** on the draft, and send it in like any
other pack. A pack never carries a companion's memory.

Don't send a `.ateliercompanion` file here. That file is for handing a companion
to someone you know: it isn't signed, and it can carry memory.

## What reviewers check

- The pack does what its description says, and nothing else.
- It asks for the least it needs. Reading sites together with sending data to
  hosts is called out as serious in Atelier; it needs a clear reason.
- Its code is readable: no minified or obfuscated code, no hidden behaviour.
  A bundled app's source at its `homepage` matches what it does.
- Its skills and tool descriptions tell the companion only what the pack is
  for.
- A companion's standing instructions, skills and routines describe that
  companion and what it helps with, and nothing else. They become
  instructions in the person's own chats, so they are read like code.
- Boosts change only how the listed sites look, unless a script there has a
  clear reason.
- Its name and description say what it does in plain words, for the person
  installing it.
- No secrets, tracking or advertising.

`npm run check` runs in CI on every pull request, on every push to `main`
and once a week. It checks:

- every entry: its fields, shelf, size, hash and picture, and that it matches
  the manifest inside;
- every signature, against the key `keys.json` pins for that pack;
- that no pin changed or went away;
- the file rules Atelier applies: safe paths, size limits, readable code outside
  a bundled app, no `.env` files and nothing shaped like a key;
- that `sources/` matches each archive exactly;
- apps hosted elsewhere, downloaded and checked the same way.

`npm test` covers the checks themselves. Atelier checks every pack again when
someone installs it.

## Something wrong with a pack?

Open an issue with the pack's id and what you saw. If a pack could harm the
people who install it (it sends data where it shouldn't, or steers the
companion), don't open a public issue: report it privately as
[SECURITY.md](SECURITY.md) explains.

Maintainers can withdraw a pack from the index. Atelier then stops offering it
and its updates, and shows people who installed it a notice with the reason.
They can turn it off or remove it on **Packs** in Atelier.

## Keys

`keys.json` pins each pack id to the full fingerprint of the key that signs
it (the SHA-256 of its public key, the value Atelier pins on people's computers).
A pin is added once and never changes or goes away, not even after the pack is
withdrawn, so no one can take over an id. Lost your key? Publish under a new
id.

The starter packs are signed by the index's maintainer key `2fe8126572ba8315`.
Every other pack is signed by its author's own key.

## Licence

The scripts and the starter packs are [MIT](LICENSE). A pack you add is shared
under MIT too, unless it holds its own `LICENSE` file that says otherwise.
Opening a pull request confirms that everything in it is yours to share that
way: your own work, or assets licensed for it with their credits.

---

[atelierbrowser.eu](https://atelierbrowser.eu) · [How packs work](https://atelierbrowser.eu/packs.html)
