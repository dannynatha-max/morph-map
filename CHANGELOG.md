# Changelog

## 3.0.0

**New**
- Report tab with a 0 to 100 complexity score for Today and Planned, using one visible formula.
- Website audit: structure findings and a passive security grade.
- Learn mode for code: where to start, core files, import loops, big files and outside packages, with "Show on map".
- Plan check: tick the findings your plan fixes.
- AI coder brief: turns the difference between the maps into a step-by-step plan.
- Quiz built from the scan, in Learn mode.
- Reachable from here: everything reachable from a box by following the arrows (only mapped arrows count).
- Code scans list local imports that could not be followed, so partial maps are visible.
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
