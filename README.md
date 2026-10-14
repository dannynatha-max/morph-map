# Morph Map

Draw how a system works **today**, draw how it **should** work, then press **Play the change** and watch one turn into the other.

![Morph Map demo](demo.gif)

**[Open the live demo](https://dannynatha-max.github.io/morph-map/)**

## What it's for
- Planning a refactor: the messy version next to the clean one
- Explaining an app to a client or a teammate
- Mapping a business process before and after you improve it
- Onboarding: how our tools connect

## How to use
- **Drag** boxes to move them, drag the paper to pan, scroll or pinch to zoom
- **Tap a box** to rename it, change its kind or leave a note
- **Add box** and **Delete box** to change the plan
- **Draw arrow from here**, then tap the box it should point to
- **Today / Planned** switches maps; **Play the change** animates between them
- **Export / Import** saves your map as a JSON file to keep or share
- Everything saves in your own browser. Nothing is sent anywhere.

## Run it
One HTML file, no build step, no dependencies. Open `index.html`, or turn on GitHub Pages.

## Map format
`example-map.json` shows the shape: `{ today: {nodes, edges}, planned: {nodes, edges} }`. Boxes that share an `id` in both maps glide between positions; the rest fade in or out.

## Licence and credit
MIT. You can use, change and share this freely, as long as you keep the copyright notice in `LICENSE`.
Using it in research or writing? GitHub's **Cite this repository** button (from `CITATION.cff`) gives you the citation.
