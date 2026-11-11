# Changelog

## 4.0.0

**New**
- Change alarm: scan a project, approve the map, then scan again after an AI change. Morph Map plays Approved into Now, explains the change in plain words and gives a verdict: Looks safe, Worth a look, or Stop and check.
- "Copy a message for the AI": a ready-made note asking the AI coder to explain or fix each warning.
- Scan a folder in the browser. Press Scan a folder or drag the folder onto the map. Nothing is uploaded and no terminal is needed.
- Boxes keep their place between scans, so only real changes move.
- Command line: `--since <commit>` and `--check <approved.json>` print the verdict and exit with code 1 on Stop and check.
- If you drew a plan, the change check reports how much of it is now in the code.
- New made-up example: an AI change to Pawsome Bookings that needs checking. The app opens on it.

**Changed**
- The scanning rules moved to `scanner/scan-core.js`, shared by the app and the command line. Scan results are unchanged.
- `tools/inline.js` copies the shared files into `index.html`. `test/run.js` checks the scanner and the change rules.

## 3.0.0

**New**
- Report tab with a 0 to 100 complexity score for Today and Planned, using one visible formula.
- Website audit: structure findings and a passive security grade.
- Learn mode for code: where to start, core files, import loops, big files and outside packages, with "Show on map".
- Plan check: tick the findings your plan fixes.
- AI coder brief: turns the difference between the maps into a step-by-step plan.
- Quiz built from the scan, in Learn mode.
- AI blast radius: everything reachable from a box by following the arrows.
- The score now counts data copies (dashed arrows touching a data store).
- Both scanners keep the raw scan data, so the report can be worked out from it.
- Examples: a fictional shop audit and Express 2014 vs today.

**Fixed after testing on real sites**
- A cart on its own sub-address (like cart.example.com) now counts as a reachable checkout.
- Look-alike pages need a parent page plus its variants, so unrelated pages that share a first word no longer match.
- Only clear login cookie names raise a red flag. Other session-like names get a gentle note.
- "No HSTS header seen" replaces "HTTPS not enforced", because some sites rely on the browser preload list.
- Sites that block all crawlers get a clear message instead of an empty report.

## 2.0.0
- Repo and website scanners, demo scans, robots.txt support.

## 1.0.0
- Map editor with Today and Planned, Play, Export and Import.
