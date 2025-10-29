
# LS-Web (LogScript for Web)

A tiny, browser-first scripting language you can embed on any webpage. Designed to be simple but practical for **games**, **data storage**, and **UI**.

- **Single-file interpreter:** `src/ls-web.js`
- **Playground:** `public/index.html` (open in a browser)
- **Docs / Command List:** `docs/COMMANDS.md`
- **Examples:** see `examples/`

## Quick Start (no build needed)
1. Open `public/index.html` in your browser.
2. Paste LS-Web code and press **Run**.

## Embed
```html
<script type="module">
  import { runLSWeb } from './src/ls-web.js';
  runLSWeb(`PRINT "Hello from LS-Web!"`);
</script>
```

## Design Goals
- Human-readable line-based commands (no punctuation noise)
- Minimal runtime that is easy to hack/extend
- Built-in HTML5 Canvas drawing, keyboard polling, timers
- LocalStorage-based persistence with simple commands
- Basic functions, variables, loops, conditionals

---

## Example (simple game loop)
```
CANVAS SIZE 640 360
COLOR "black"
CLEAR

SET x TO 320
SET y TO 180
SET speed TO 3

ONKEY DOWN "ArrowLeft"  SET x TO x - speed
ONKEY DOWN "ArrowRight" SET x TO x + speed
ONKEY DOWN "ArrowUp"    SET y TO y - speed
ONKEY DOWN "ArrowDown"  SET y TO y + speed

TICK 16
  COLOR "white"
  CLEAR
  RECT x y 20 20
END
```

See more in `docs/COMMANDS.md`.
