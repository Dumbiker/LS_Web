
# LS-Web Command List

LS-Web is line-oriented. Each line is one statement. Strings are quoted with `"like this"`. Numbers are plain (e.g., `42`, `3.14`). Expressions allow + - * / % and parentheses.

---

## Declarations & Variables
- `SET <name> TO <expr>` — create/update a variable.
- `LET <name> = <expr>` — alias of SET (JS-style).
- `CONST <name> = <expr>` — create a constant; error if reassigned.
- `ALIAS <new> AS <existing>` — new name refers to same binding.
- `DECLARE STRUCT <Name> { field, field2, ... }` — records a struct schema (metadata).
- `DECLARE ENUM <Name> { Key:Value, Key2:Value2 }` — records enum metadata.
- `DECLARE NAMESPACE <Name>` — creates a namespace container.

## Math & Random
- `ADD <name> BY <expr>` — `name += expr`
- `SUB <name> BY <expr>` — `name -= expr`
- `MUL <name> BY <expr>` — `name *= expr`
- `DIV <name> BY <expr>` — `name /= expr`
- `MOD <name> BY <expr>` — `name %= expr`
- `RANDOM BETWEEN <a> <b> INTO <name>` — uniform random
- `MATH <fn> <expr> INTO <name>` — `sin cos tan sqrt floor ceil round abs clamp`

## Conditionals & Loops
- `IF <expr> THEN` — begin conditional block; use `ELSE` or `ENDIF` to close.
- `ELSE` — alternate branch in an IF block.
- `ENDIF` — end IF block.
- `WHILE <expr>` — begin while loop; end with `ENDWHILE`.
- `FOR <var> FROM <a> TO <b> STEP <s>` — begin numeric loop; end with `ENDFOR`.
- `BREAK` — break current loop.
- `CONTINUE` — continue current loop.

## Functions
- `FUNCTION <name>(a, b, ...)` — begin function block; close with `ENDFN`.
- `RETURN <expr>` — return value from function.
- `CALL <name>(args...) INTO <var>` — call and capture return.
- `EXPORT <name>` — mark function or variable for host access (metadata).

## Arrays & Objects
- `ARRAY <name> = [items...]`
- `PUSH <value> INTO <array>`
- `POP <array> INTO <var>`
- `LEN <array> INTO <var>`
- `OBJECT <name> = { key: value, ... }`
- `SETFIELD <obj>.<field> TO <expr>`
- `GETFIELD <obj>.<field> INTO <var>`
- `MERGE <objA> WITH <objB> INTO <var>`

## I/O & Debug
- `PRINT <expr>` — logs to console panel in the playground and `console.log`.
- `ALERT <expr>` — native `alert(...)`.
- `INPUT <prompt> INTO <name>` — browser `prompt(...)`.
- `TRACE ON|OFF` — toggles runtime debug tracing.

## Time
- `SLEEP <ms>` — pauses sequential execution (async).
- `TIME NOW INTO <name>` — stores `Date.now()`.
- `EVERY <ms>` — begin periodic block; end with `ENDEVERY`.

## Canvas & Drawing
- `CANVAS SIZE <w> <h>` — ensures a `<canvas>` exists in the playground; sets size.
- `COLOR <str|#hex|rgba()>`
- `CLEAR` — clears the canvas with current color.
- `RECT <x> <y> <w> <h>` — filled rect.
- `CIRCLE <x> <y> <r>` — filled circle.
- `LINE <x1> <y1> <x2> <y2>` — stroked line.
- `TEXT <x> <y> "<string>"` — draw text.
- `FONT "<css-font>"` — e.g., `"16px monospace"`
- `TICK <ms>` — begin a frame loop at ~ms; end with `END`.

## Input
- `ONKEY DOWN "<Key>" <statement>` — one-line handler.
- `ONKEY UP "<Key>" <statement>`
- `KEY "<Key>" INTO <name>` — writes `true/false` if currently pressed.

## Storage (LocalStorage)
- `STORE "<key>" <expr>` — localStorage.setItem
- `LOAD "<key>" INTO <name>` — JSON-parsed if possible, else string.
- `DELETE "<key>"`
- `KEYS STORAGE INTO <name>` — array of keys.

## Networking (fetch)
- `FETCH "<url>" INTO <name>` — GET request; stores text.
- `FETCHJSON "<url>" INTO <name>` — GET JSON; stores object/array.

## Sound
- `BEEP <freq> <ms>` — simple oscillator beep (WebAudio).
- `PLAYAUDIO "<url>"` — plays an audio file (HTMLAudioElement).

## ECS-lite (Entity/Component Helpers)
- `ENTITY NEW INTO <name>` — returns numeric id.
- `COMP SET <entity> <compName> <json>` — attach/replace component object.
- `COMP GET <entity> <compName> INTO <name>` — retrieve component or null.
- `COMP HAS <entity> <compName> INTO <name>` — boolean.
- `COMP DEL <entity> <compName>` — delete.

---

**Notes**
- Not all commands are strictly required for every project. The interpreter implements all commands above in a pragmatic way.
- Blocks use explicit terminators: `ENDIF`, `ENDWHILE`, `ENDFOR`, `ENDFN`, `ENDEVERY`, `END`.
- Expressions support variables, parentheses, math ops, string +, and dot-field access.
