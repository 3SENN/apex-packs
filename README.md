# Apex packs

Made by everyone.

Apex is the browser you make your own. Whatever you make in it can travel as
a pack: one signed file that someone else adds to their browser with one yes.
This repository is the community index Apex comes with. Open **Packs ›
Browse** in Apex to see what's here and install it.

A pack can hold skills, routine templates, site boosts, accent colours,
companions, connectors, apps and panels, and new commands and tools for the
companion.

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

Apex lists this index on **Packs › Browse** from the start. If you removed it,
add it again with this address:

```
https://raw.githubusercontent.com/3SENN/apex-packs/main/index.json
```

## Share what you made

1. Make the pack in Apex: describe it on **Packs › New pack** and a companion
   builds it with you, or use **Share as pack** on a skill, boost, app or
   companion you already have. Test it, then choose **Export…** on its draft.
   Apex signs the file with your own author key.
2. Fork this repository and put the file in `packs/` as
   `<id>-<version>.apexpack`.
3. Unpack it so reviewers can read it, and rebuild the index:
   ```
   npm install
   npm run unpack -- packs/<id>-<version>.apexpack
   npm run index
   npm run check
   ```
4. A new pack also adds its author key to `keys.json` (`npm run check` tells
   you the line to add). Open a pull request.

To update your pack, replace its file with the new version (one version per
pack), unpack it again and rebuild the index. Updates must be signed with the
key `keys.json` pins for that pack, and Apex on people's computers refuses a
pack signed by anyone else.

Building an app, a game or a world by hand? [apex-apps](https://github.com/3SENN/apex-apps)
has the guides, working examples and packing tools.

## What reviewers check

- The pack does what its description says, and nothing else.
- It asks for the least it needs. Reading sites together with sending data to
  hosts is called out as serious in Apex; it needs a clear reason.
- Its code is readable: no minified or obfuscated code, no hidden behaviour.
- Its skills and tool descriptions tell the companion only what the pack is
  for.
- Its name and description say what it does in plain words, for the person
  installing it.
- No secrets, tracking or advertising.

`npm run check` (and CI on every pull request) checks the index, the
signatures and their pinned keys, the hashes, the file rules Apex applies, and
that `sources/` matches each pack exactly. Apex checks every pack again when
someone installs it.

## Something wrong with a pack?

Open an issue with the pack's id and what you saw. Maintainers can remove a
pack from the index; people who already installed it can turn it off or remove
it on **Packs** in Apex.

## Keys

The starter packs are signed by the index's maintainer key `2fe8126572ba8315`.
Every other pack is signed by its author's own key, pinned in `keys.json`.

---

[apexbrowser.eu](https://apexbrowser.eu) · [How packs work](https://apexbrowser.eu/packs.html)
