
// LS-Web: tiny, browser-first scripting language (v0.1)
let __rt = {
  vars: Object.create(null),
  consts: new Set(),
  funcs: Object.create(null),
  trace: false,
  timers: new Set(),
  keyState: Object.create(null),
  everyTimers: [],
  tickLoop: null,
  canvas: null,
  ctx: null,
  color: "#fff",
  stageEl: null,
  ecs: { nextId:1, comps: new Map() },
  logSink: (msg)=>console.log(msg),
  halted: false,
};

export function setLogSink(fn){ __rt.logSink = fn; }
function log(msg){ __rt.logSink(String(msg)); }

export async function runLSWeb(source, canvasEl){
  stopLSWeb();
  __rt.halted = false;
  __rt.vars = Object.create(null);
  __rt.consts = new Set();
  __rt.funcs = Object.create(null);
  __rt.timers = new Set();
  __rt.everyTimers = [];
  __rt.keyState = Object.create(null);
  __rt.canvas = canvasEl || document.getElementById('lsweb-canvas');
  __rt.ctx = __rt.canvas?.getContext('2d') || null;
  __rt.color = "#fff";
  window.addEventListener('keydown', e => __rt.keyState[e.key] = true);
  window.addEventListener('keyup', e => __rt.keyState[e.key] = false);
  const lines = source.split(/\r?\n/);
  const state = { i:0, lines, stack:[], skipping: false };
  await execBlock(state, 0);
}
export function stopLSWeb(){
  __rt.halted = true;
  for (const t of __rt.timers) clearInterval(t), clearTimeout(t);
  __rt.timers.clear();
  if (__rt.tickLoop) cancelAnimationFrame(__rt.tickLoop);
  __rt.tickLoop = null;
  __rt.everyTimers.forEach(id=>clearInterval(id));
  __rt.everyTimers = [];
}

async function execBlock(state, endDepth){
  while (state.i < state.lines.length && !__rt.halted){
    let raw = state.lines[state.i].trim();
    state.i++;
    if (!raw || raw.startsWith('//') || raw.startsWith('#')) continue;

    // Maintain simple block structure using explicit terminators
    if (match(raw, /^ENDIF$/)) { state.skipping = false; continue; }
    if (match(raw, /^ELSE$/))  { state.skipping = !state.skipping; continue; }
    if (match(raw, /^ENDWHILE$/) || match(raw, /^ENDFOR$/) || match(raw, /^ENDFN$/) || match(raw, /^ENDEVERY$/)) {
      // ignored here: handled by specific block runners
      continue;
    }

    if (state.skipping) continue;

    if (await runLine(raw, state) === 'BLOCK'){
      // The runner moved state.i into the block executor. Continue loop.
    }
  }
}

function match(s, re){ const m = s.match(re); return m && m.slice(1); }

function get(name){
  if (name in __rt.vars) return __rt.vars[name];
  throw new Error(`Undefined: ${name}`);
}
function set(name, val){
  if (__rt.consts.has(name)) throw new Error(`Cannot assign CONST ${name}`);
  __rt.vars[name] = val;
  return val;
}
function toVal(tok, env=__rt.vars){
  // strings
  if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
    return JSON.parse(tok.replace(/^'/, '"').replace(/'$/,'"'));
  }
  // numbers
  if (!isNaN(Number(tok))) return Number(tok);
  // true/false/null
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (tok === 'null') return null;
  // object/array literal (basic)
  if (tok.startsWith('{') || tok.startsWith('[')) {
    try { return JSON.parse(tok); } catch(e){ return tok; }
  }
  // variable or dotted field
  if (tok.includes('.')){
    const [base, ...rest] = tok.split('.');
    let v = get(base);
    for (const k of rest){ v = (v ?? {})[k]; }
    return v;
  }
  return get(tok);
}

function evalExpr(expr){
  // Very small expression evaluator using Function (safe-ish for playground)
  // Re-map identifiers to __rt.vars.* where possible.
  const idents = Array.from(new Set(expr.match(/[A-Za-z_]\w*(?:\.\w+)*/g) || []));
  let js = expr;
  for (const id of idents){
    if (id in __rt.vars || id in Math) {
      js = js.replaceAll(id, id in Math ? `Math.${id}` : `__rt.vars.${id}`);
    }
  }
  try {
    // eslint-disable-next-line no-new-func
    return Function('__rt', `return (${js});`)(__rt);
  } catch(e){
    throw new Error(`Bad expression: ${expr}\n${e.message}`);
  }
}

async function runLine(raw, state){
  if (__rt.trace) log('> ' + raw);

  // Declarations & variables
  {
    let m;
    if (m = match(raw, /^SET\s+(\w+)\s+TO\s+(.+)$/i)){
      const [name, expr] = m;
      return set(name, evalExpr(expr));
    }
    if (m = match(raw, /^LET\s+(\w+)\s*=\s*(.+)$/i)){
      const [name, expr] = m;
      return set(name, evalExpr(expr));
    }
    if (m = match(raw, /^CONST\s+(\w+)\s*=\s*(.+)$/i)){
      const [name, expr] = m;
      __rt.consts.add(name);
      return set(name, evalExpr(expr));
    }
    if (m = match(raw, /^ALIAS\s+(\w+)\s+AS\s+(\w+)$/i)){
      const [neo, old] = m;
      __rt.vars[neo] = __rt.vars[old];
      return;
    }
    if (m = match(raw, /^DECLARE\s+(STRUCT|ENUM|NAMESPACE)\s+(.+)$/i)){
      // metadata only
      return;
    }
  }

  // Math & random
  {
    let m;
    if (m = match(raw, /^(ADD|SUB|MUL|DIV|MOD)\s+(\w+)\s+BY\s+(.+)$/i)){
      const [op, name, expr] = m;
      const v = get(name);
      const x = evalExpr(expr);
      const ops = {ADD:(a,b)=>a+b,SUB:(a,b)=>a-b,MUL:(a,b)=>a*b,DIV:(a,b)=>a/b,MOD:(a,b)=>a%b};
      return set(name, ops[op.toUpperCase()](v, x));
    }
    if (m = match(raw, /^RANDOM\s+BETWEEN\s+(.+?)\s+(.+?)\s+INTO\s+(\w+)$/i)){
      const [a,b,name] = m;
      const min = evalExpr(a), max = evalExpr(b);
      return set(name, Math.random()*(max-min)+min);
    }
    if (m = match(raw, /^MATH\s+(\w+)\s+(.+)\s+INTO\s+(\w+)$/i)){
      const [fn, expr, name] = m;
      const f = Math[fn];
      if (!f) throw new Error(`Unknown math fn: ${fn}`);
      return set(name, f(evalExpr(expr)));
    }
  }

  // Conditionals (blocks)
  {
    let m;
    if (m = match(raw, /^IF\s+(.+)\s+THEN$/i)){
      const cond = evalExpr(m[0]);
      state.skipping = !cond;
      return 'BLOCK';
    }
    if (m = match(raw, /^WHILE\s+(.+)$/i)){
      const condExpr = m[0];
      const bodyStart = state.i;
      // find ENDWHILE
      let depth=1, j=bodyStart;
      while (j < state.lines.length && depth>0){
        const t = state.lines[j].trim();
        if (t.match(/^WHILE\s+/)) depth++;
        if (t === 'ENDWHILE') depth--;
        j++;
      }
      const bodyEnd = j-1;
      async function loop(){
        while (evalExpr(condExpr) && !__rt.halted){
          let sub = { ...state, i: bodyStart, skipping: false };
          while (sub.i < bodyEnd){
            const raw2 = state.lines[sub.i].trim(); sub.i++;
            if (!raw2 || raw2.startsWith('//') || raw2==='ENDWHILE') continue;
            await runLine(raw2, sub);
          }
          await sleep(0);
        }
      }
      loop();
      state.i = bodyEnd+1;
      return 'BLOCK';
    }
    if (m = match(raw, /^FOR\s+(\w+)\s+FROM\s+(.+)\s+TO\s+(.+)\s+STEP\s+(.+)$/i)){
      const [vname, aExpr, bExpr, sExpr] = m;
      const bodyStart = state.i;
      let depth=1, j=bodyStart;
      while (j < state.lines.length && depth>0){
        const t = state.lines[j].trim();
        if (t.match(/^FOR\s+/)) depth++;
        if (t === 'ENDFOR') depth--;
        j++;
      }
      const bodyEnd = j-1;
      const a = evalExpr(aExpr), b = evalExpr(bExpr), s = evalExpr(sExpr);
      async function loop(){
        for (set(vname, a); (__rt.vars[vname] <= b); set(vname, __rt.vars[vname] + s)){
          let sub = { ...state, i: bodyStart, skipping:false };
          while (sub.i < bodyEnd){
            const raw2 = state.lines[sub.i].trim(); sub.i++;
            if (!raw2 || raw2.startsWith('//') || raw2==='ENDFOR') continue;
            await runLine(raw2, sub);
          }
          await sleep(0);
        }
      }
      loop();
      state.i = bodyEnd+1;
      return 'BLOCK';
    }
  }

  // Functions
  {
    let m;
    if (m = match(raw, /^FUNCTION\s+(\w+)\(([^)]*)\)$/i)){
      const [name, params] = m;
      const bodyStart = state.i;
      let depth=1, j=bodyStart;
      while (j < state.lines.length && depth>0){
        const t = state.lines[j].trim();
        if (t.match(/^FUNCTION\s+/)) depth++;
        if (t === 'ENDFN') depth--;
        j++;
      }
      const bodyEnd = j-1;
      __rt.funcs[name] = { params: params.split(',').map(s=>s.trim()).filter(Boolean), bodyStart, bodyEnd, lines: state.lines };
      state.i = bodyEnd+1;
      return 'BLOCK';
    }
    if (m = match(raw, /^CALL\s+(\w+)\((.*)\)\s+INTO\s+(\w+)$/i)){
      const [name, argsStr, into] = m;
      const v = await callFn(name, argsStr);
      return set(into, v);
    }
  }

  // Arrays & Objects
  {
    let m;
    if (m = match(raw, /^ARRAY\s+(\w+)\s*=\s*(\[.*\])$/i)){
      const [name, arr] = m;
      return set(name, JSON.parse(arr));
    }
    if (m = match(raw, /^PUSH\s+(.+)\s+INTO\s+(\w+)$/i)){
      const [valExpr, name] = m;
      const v = evalExpr(valExpr); get(name).push(v); return;
    }
    if (m = match(raw, /^POP\s+(\w+)\s+INTO\s+(\w+)$/i)){
      const [src, dest] = m;
      return set(dest, get(src).pop());
    }
    if (m = match(raw, /^LEN\s+(\w+)\s+INTO\s+(\w+)$/i)){
      const [src, dest] = m;
      return set(dest, (get(src)||[]).length);
    }
    if (m = match(raw, /^OBJECT\s+(\w+)\s*=\s*(\{.*\})$/i)){
      const [name, obj] = m;
      return set(name, JSON.parse(obj));
    }
    if (m = match(raw, /^SETFIELD\s+(\w+)\.(\w+)\s+TO\s+(.+)$/i)){
      const [obj, field, expr] = m;
      get(obj)[field] = evalExpr(expr); return;
    }
    if (m = match(raw, /^GETFIELD\s+(\w+)\.(\w+)\s+INTO\s+(\w+)$/i)){
      const [obj, field, dest] = m;
      return set(dest, (get(obj)||{})[field]);
    }
    if (m = match(raw, /^MERGE\s+(\w+)\s+WITH\s+(\w+)\s+INTO\s+(\w+)$/i)){
      const [a,b,d] = m; return set(d, Object.assign({}, get(a)||{}, get(b)||{}));
    }
  }

  // I/O & Debug
  {
    let m;
    if (m = match(raw, /^PRINT\s+(.+)$/i)){
      const v = evalExpr(m[0]); log(v); return;
    }
    if (m = match(raw, /^ALERT\s+(.+)$/i)){
      alert(evalExpr(m[0])); return;
    }
    if (m = match(raw, /^INPUT\s+(.+)\s+INTO\s+(\w+)$/i)){
      const [promptExpr, name] = m;
      const val = prompt(String(evalExpr(promptExpr)) || '');
      return set(name, val);
    }
    if (m = match(raw, /^TRACE\s+(ON|OFF)$/i)){
      __rt.trace = (m[0].toUpperCase()==='ON'); return;
    }
  }

  // Time
  {
    let m;
    if (m = match(raw, /^SLEEP\s+(\d+)$/i)){
      await sleep(Number(m[0])); return;
    }
    if (m = match(raw, /^TIME\s+NOW\s+INTO\s+(\w+)$/i)){
      return set(m[0], Date.now());
    }
    if (m = match(raw, /^EVERY\s+(\d+)$/i)){
      const ms = Number(m[0]);
      const bodyStart = state.i;
      let depth=1, j=bodyStart;
      while (j < state.lines.length && depth>0){
        const t = state.lines[j].trim();
        if (t.match(/^EVERY\s+/)) depth++;
        if (t === 'ENDEVERY') depth--;
        j++;
      }
      const bodyEnd = j-1;
      const id = setInterval(async ()=>{
        if (__rt.halted) return;
        let sub = { ...state, i: bodyStart, skipping:false };
        while (sub.i < bodyEnd && !__rt.halted){
          const raw2 = state.lines[sub.i].trim(); sub.i++;
          if (!raw2 || raw2.startsWith('//') || raw2==='ENDEVERY') continue;
          await runLine(raw2, sub);
        }
      }, ms);
      __rt.everyTimers.push(id);
      state.i = bodyEnd+1;
      return 'BLOCK';
    }
  }

  // Canvas & Drawing
  {
    let m;
    if (m = match(raw, /^CANVAS\s+SIZE\s+(\d+)\s+(\d+)$/i)){
      const [w,h] = m.map(Number);
      const c = __rt.canvas || document.getElementById('lsweb-canvas');
      if (!c) throw new Error('No canvas element found.');
      c.width = w; c.height = h;
      __rt.canvas = c;
      __rt.ctx = c.getContext('2d');
      return;
    }
    if (m = match(raw, /^COLOR\s+(.+)$/i)){
      __rt.color = evalExpr(m[0]); return;
    }
    if (match(raw, /^CLEAR$/i)){
      const ctx = __rt.ctx; if (!ctx) return;
      ctx.fillStyle = __rt.color; ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height); return;
    }
    if (m = match(raw, /^RECT\s+(.+)\s+(.+)\s+(.+)\s+(.+)$/i)){
      const [x,y,w,h] = m.map(evalExpr);
      const ctx = __rt.ctx; if (!ctx) return;
      ctx.fillStyle = __rt.color; ctx.fillRect(x,y,w,h); return;
    }
    if (m = match(raw, /^CIRCLE\s+(.+)\s+(.+)\s+(.+)$/i)){
      const [x,y,r] = m.map(evalExpr);
      const ctx = __rt.ctx; if (!ctx) return;
      ctx.fillStyle = __rt.color; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); return;
    }
    if (m = match(raw, /^LINE\s+(.+)\s+(.+)\s+(.+)\s+(.+)$/i)){
      const [x1,y1,x2,y2] = m.map(evalExpr);
      const ctx = __rt.ctx; if (!ctx) return;
      ctx.strokeStyle = __rt.color; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); return;
    }
    if (m = match(raw, /^TEXT\s+(.+)\s+(.+)\s+(.+)$/i)){
      const [x,y,str] = m; const ctx = __rt.ctx; if (!ctx) return;
      ctx.fillStyle = __rt.color; ctx.fillText(evalExpr(str), evalExpr(x), evalExpr(y)); return;
    }
    if (m = match(raw, /^FONT\s+(.+)$/i)){
      const ctx = __rt.ctx; if (!ctx) return;
      ctx.font = evalExpr(m[0]); return;
    }
    if (m = match(raw, /^TICK\s+(\d+)$/i)){
      const ms = Number(m[0]);
      const bodyStart = state.i;
      let depth=1, j=bodyStart;
      while (j < state.lines.length && depth>0){
        const t = state.lines[j].trim();
        if (t.match(/^TICK\s+/)) depth++;
        if (t === 'END') depth--;
        j++;
      }
      const bodyEnd = j-1;
      function frameLoop(){
        if (__rt.halted) return;
        const now = performance.now();
        // simple fixed-step using setTimeout timing
        setTimeout(async ()=>{
          let sub = { ...state, i: bodyStart, skipping:false };
          while (sub.i < bodyEnd && !__rt.halted){
            const raw2 = state.lines[sub.i].trim(); sub.i++;
            if (!raw2 || raw2.startsWith('//') || raw2==='END') continue;
            await runLine(raw2, sub);
          }
          __rt.tickLoop = requestAnimationFrame(frameLoop);
        }, ms);
      }
      __rt.tickLoop = requestAnimationFrame(frameLoop);
      state.i = bodyEnd+1;
      return 'BLOCK';
    }
  }

  // Input
  {
    let m;
    if (m = match(raw, /^ONKEY\s+(DOWN|UP)\s+"([^"]+)"\s+(.+)$/i)){
      const [phase, key, stmt] = m;
      const handler = async (e)=>{
        if (__rt.halted) return;
        if (e.key === key && ((phase.toUpperCase()==='DOWN' && e.type==='keydown') || (phase.toUpperCase()==='UP' && e.type==='keyup'))){
          let sub = { ...state, i:0, lines:[stmt], skipping:false };
          await runLine(stmt, sub);
        }
      };
      window.addEventListener('keydown', handler);
      window.addEventListener('keyup', handler);
      return;
    }
    if (m = match(raw, /^KEY\s+"([^"]+)"\s+INTO\s+(\w+)$/i)){
      const [key, name] = m;
      return set(name, !!__rt.keyState[key]);
    }
  }

  // Storage
  {
    let m;
    if (m = match(raw, /^STORE\s+"([^"]+)"\s+(.+)$/i)){
      const [k, expr] = m;
      const v = evalExpr(expr);
      localStorage.setItem(k, JSON.stringify(v));
      return;
    }
    if (m = match(raw, /^LOAD\s+"([^"]+)"\s+INTO\s+(\w+)$/i)){
      const [k, name] = m;
      const raw = localStorage.getItem(k);
      let v = null;
      try { v = JSON.parse(raw); } catch{ v = raw; }
      return set(name, v);
    }
    if (m = match(raw, /^DELETE\s+"([^"]+)"$/i)){
      const [k] = m; localStorage.removeItem(k); return;
    }
    if (m = match(raw, /^KEYS\s+STORAGE\s+INTO\s+(\w+)$/i)){
      const [name] = m;
      const keys = Array.from({length: localStorage.length}, (_,i)=>localStorage.key(i));
      return set(name, keys);
    }
  }

  // Networking
  {
    let m;
    if (m = match(raw, /^FETCH\s+"([^"]+)"\s+INTO\s+(\w+)$/i)){
      const [url, name] = m;
      const res = await fetch(url); const txt = await res.text();
      return set(name, txt);
    }
    if (m = match(raw, /^FETCHJSON\s+"([^"]+)"\s+INTO\s+(\w+)$/i)){
      const [url, name] = m;
      const res = await fetch(url); const js = await res.json();
      return set(name, js);
    }
  }

  // Sound
  {
    let m;
    if (m = match(raw, /^BEEP\s+(\d+)\s+(\d+)$/i)){
      const [freq, ms] = m.map(Number);
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
      return;
    }
    if (m = match(raw, /^PLAYAUDIO\s+"([^"]+)"$/i)){
      const [url] = m; const a = new Audio(url); a.play(); return;
    }
  }

  // ECS-lite
  {
    let m;
    if (m = match(raw, /^ENTITY\s+NEW\s+INTO\s+(\w+)$/i)){
      const [name] = m; const id = __rt.ecs.nextId++; __rt.ecs.comps.set(id, new Map()); return set(name, id);
    }
    if (m = match(raw, /^COMP\s+SET\s+(\w+)\s+(\w+)\s+(.+)$/i)){
      const [ent, comp, jsonStr] = m; const id = get(ent);
      let obj; try { obj = JSON.parse(jsonStr); } catch{ obj = evalExpr(jsonStr); }
      const table = __rt.ecs.comps.get(id) || new Map(); table.set(comp, obj); __rt.ecs.comps.set(id, table); return;
    }
    if (m = match(raw, /^COMP\s+GET\s+(\w+)\s+(\w+)\s+INTO\s+(\w+)$/i)){
      const [ent, comp, dest] = m; const id = get(ent);
      const table = __rt.ecs.comps.get(id) || new Map(); return set(dest, table.get(comp) ?? null);
    }
    if (m = match(raw, /^COMP\s+HAS\s+(\w+)\s+(\w+)\s+INTO\s+(\w+)$/i)){
      const [ent, comp, dest] = m; const id = get(ent);
      const table = __rt.ecs.comps.get(id) || new Map(); return set(dest, table.has(comp));
    }
    if (m = match(raw, /^COMP\s+DEL\s+(\w+)\s+(\w+)$/i)){
      const [ent, comp] = m; const id = get(ent);
      const table = __rt.ecs.comps.get(id) || new Map(); table.delete(comp); __rt.ecs.comps.set(id, table); return;
    }
  }

  // Fallback
  throw new Error("Unknown statement: " + raw);
}

async function callFn(name, argsStr){
  const fn = __rt.funcs[name];
  if (!fn) throw new Error(`No such function: ${name}`);
  const args = argsStr.trim() ? argsStr.split(',').map(s=>evalExpr(s.trim())) : [];
  const local = Object.create(__rt.vars);
  fn.params.forEach((p,i)=> local[p] = args[i]);
  // Execute function body
  for (let i = fn.bodyStart; i < fn.bodyEnd; i++){
    const raw = fn.lines[i].trim();
    if (!raw || raw.startsWith('//')) continue;
    const ret = await runLine(raw, { i, lines: fn.lines, skipping:false });
    if (String(ret||'').startsWith('__return__')){
      return JSON.parse(ret.slice('__return__'.length));
    }
  }
  return null;
}

function sleep(ms){ return new Promise(r=> setTimeout(r, ms)); }
