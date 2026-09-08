// THE NARRATION SCRIPT, AS DATA — so the voice renderer (tools/tts-narration.py)
// does not have to parse JavaScript to find out what Pip says. It reads
// js/narration.js's own LINES export, which is the single source of truth for
// every spoken line in the game, so a line added there is a line rendered here
// and there is no second list to keep.
//
// The shims exist because narration.js imports audio.js, which registers its
// unlock listeners at module scope — node has no window. Nothing below is
// touched: the import is for the DATA.
//
//   node tools/dump-lines.mjs > /tmp/lines.json
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }) };
const { LINES } = await import('../js/narration.js');
process.stdout.write(JSON.stringify(LINES, null, 1));
