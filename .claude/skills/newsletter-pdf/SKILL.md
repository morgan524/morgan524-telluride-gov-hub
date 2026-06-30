---
name: newsletter-pdf
description: Publish one or more PDFs to the Livable Telluride site and return clean public URLs to paste into the newsletter/emails. Use when the user provides PDF file path(s) and wants hosted links (e.g. "upload these PDFs", "host this PDF and give me a URL", "add these to the Lift 7 newsletter docs").
---

# Publish newsletter PDFs → public URLs

Hosts PDFs in the repo under `newsletter/<topic>/`, served by GitHub Pages at
`https://livabletelluride.org/newsletter/<topic>/<file>.pdf`. Browsers render
PDFs inline, so recipients need no reader install. Files are **public**.

## Steps

1. **Pick a topic slug.** Group related PDFs in one folder
   `newsletter/<topic>/` (lowercase-hyphen, e.g. `lift-7`). Use the topic the
   user names, infer it from the source path/subject, or ask if unclear. Reuse
   an existing topic folder when the docs belong with prior ones.

2. **Choose clean filenames** (this is the one judgment call — do it well):
   - lowercase, hyphens, **no spaces** (so URLs need no `%20`)
   - expand cryptic abbreviations (`TC MIN` → `town-council-minutes`,
     `Dec` → `declaration` when alongside Plat/Contract) — but if an
     abbreviation is genuinely ambiguous, keep it and flag it to the user
   - date-prefix `YYYY-MM-DD-` or `YYYY-` when it aids sorting
   - drop noise like `(Final)`

3. **Run the uploader** (one call, all files):
   ```
   bash .claude/skills/newsletter-pdf/upload.sh <topic-slug> \
     "<src1>::<clean1.pdf>" "<src2>::<clean2.pdf>" ...
   ```
   - Quote every path (sources usually contain spaces).
   - `SRC::DEST` sets the clean filename. A bare `SRC` auto-slugifies it
     (fine when the source name is already reasonable).
   - The script: fetches origin/main, stages the files in a `--no-checkout`
     worktree, commits, and **pushes straight to main**. It does **not** wait
     on the Pages build (fast). It prints the final URLs.

4. **Give the user the URLs** (a table is nice). Tell them links go live within
   ~1–2 minutes once Pages finishes, and that **they can verify the links** —
   do NOT poll the Pages build yourself (that's the slow part we cut).

5. **Flag** any filename you had to guess, and remind them the docs are public
   (skip anything sensitive). Renaming later changes the URL, so finalize names
   before they go in a send.

## Notes

- Pre-flight check sizes; GitHub limits are ~100MB/file. Typical memos are tiny.
- Convention + current topics are documented in the repo's `newsletter/README.md`.
- Pushes directly to `main` (the repo's deploy branch) — additive new files
  don't conflict with the content bot; the script auto-rebases+retries on the
  rare race.
- `DRY_RUN=1 bash …/upload.sh …` stages + commits locally without pushing.
