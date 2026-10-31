(function () {
  const app = document.getElementById("app");
  const summary = document.getElementById("summary");
  const barFill = document.getElementById("bar-fill");
  const bottomNav = document.getElementById("bottom-nav");
  const { UNITS, BANK } = InorganicBank;
  const BY_ID = {};
  BANK.forEach(p => { BY_ID[p.id] = p; });
  const UNIT_LABEL = {};
  UNITS.forEach(u => { UNIT_LABEL[u.key] = u.label; });
  const N = UNITS.length; // 1日の問題数(分野ごとに1題)
  const KEY = "inorg.v1";
  const WD = ["日", "月", "火", "水", "木", "金", "土"];

  // 色の選択肢に添える色見本
  const SWATCH = {
    "無色": "#eef1f5", "白": "#ffffff", "黒": "#222222", "赤": "#d32f2f", "黄": "#f5d90a", "青": "#2563eb", "緑": "#2e9e4f",
    "淡黄": "#f3eaa0", "黄緑": "#9acd32", "赤褐": "#a0412d", "黒紫": "#3b2a4d", "淡緑": "#b6e3b6", "黄褐": "#b8862b",
    "灰緑": "#7a9a82", "暗緑": "#2f5d3a", "赤橙": "#e8641b", "赤紫": "#a02c7d", "深青": "#1e3a8a", "青紫": "#5b3fc4",
    "褐": "#6b4a2b", "淡桃": "#f8c9d4", "緑白": "#cfe3d4", "青白": "#bcd6ee", "橙赤": "#ea5a1a", "紅": "#c2185b",
    "青緑": "#14a58f", "淡青": "#a8d4f0", "銀白": "#d9dde3"
  };

  // ---------- 日付 ----------
  const pad = n => String(n).padStart(2, "0");
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmt(d); };
  const qd = new URLSearchParams(location.search).get("date"); // ?date=YYYY-MM-DD で「今日」を差し替え(動作確認用)
  const TODAY = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : fmt(new Date());
  let viewDate = TODAY;
  const dateLabel = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ---------- 出題(日付から決まる周回順列。分野ごとに1題) ----------
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(arr, seed) {
    const a = arr.slice(), r = rng(seed);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const EPOCH = new Date(2026, 0, 1);
  const dayIndex = s => Math.round((parseDate(s) - EPOCH) / 86400000);
  const POOLS = {};
  UNITS.forEach(u => { POOLS[u.key] = BANK.filter(p => p.unit === u.key).map(p => p.id); });
  const permOf = (unit, cycle) => shuffled(POOLS[unit], hash(unit) + cycle * 7919);
  function pickId(unit, idx) {
    const len = POOLS[unit].length;
    const cycle = Math.floor(idx / len), pos = idx % len;
    const perm = permOf(unit, cycle);
    if (pos === 0 && cycle > 0) { // 周回の境目で同じ問題が続かないようにする
      const prev = permOf(unit, cycle - 1);
      if (perm[0] === prev[len - 1]) [perm[0], perm[1]] = [perm[1], perm[0]];
    }
    return perm[pos];
  }
  const dailyIds = date => UNITS.map(u => pickId(u.key, ((dayIndex(date) % 100000) + 100000) % 100000));

  // 日ごとの出題は、初めて表示したときに問題IDで固定する(バンクを増やしても過去の日は変わらない)
  const SNAP_KEY = "inorg.snap.v1";
  function loadSnaps() { try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || {}; } catch (e) { return {}; } }
  let snaps = loadSnaps();
  function saveSnaps() { try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch (e) { /* 保存できなくても動作は続ける */ } }
  function getSet(date) {
    let ids = snaps[date];
    if (!ids || ids.length !== N || ids.some(id => !BY_ID[id])) {
      ids = dailyIds(date);
      if (date <= TODAY) { snaps[date] = ids; saveSnaps(); }
    }
    return ids.map(id => BY_ID[id]);
  }

  // ---------- 進捗 { "YYYY-MM-DD": { "0": "done" | "peek" } } ----------
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* 保存できなくても動作は続ける */ } }
  let progress = load();
  const stOf = (date, i) => (progress[date] || {})[i];
  function setSt(date, i, v) {
    progress[date] = progress[date] || {};
    if (progress[date][i] === "done" && v !== "done") return; // 正解済みは上書きしない
    progress[date][i] = v;
    save();
  }
  const doneCount = date => UNITS.filter((u, i) => stOf(date, i) === "done").length;
  function streak() {
    let d = TODAY, n = 0;
    if (doneCount(d) < N) d = addDays(d, -1);
    while (doneCount(d) === N) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- 復習リスト ----------
  // 間違えた問題(「答えを見る」を含む)を問題IDで保存する。2回連続で正解したら外す。間違えると連続回数は0に戻る。
  const REVIEW_KEY = "inorg.review.v1";
  const REVIEW_NEED = 2;
  function loadReview() {
    try {
      const r = JSON.parse(localStorage.getItem(REVIEW_KEY)) || {};
      Object.keys(r).forEach(k => { if (!BY_ID[k]) delete r[k]; }); // バンクから消えた問題は捨てる
      return r;
    } catch (e) { return {}; }
  }
  let review = loadReview();
  function saveReview() { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(review)); } catch (e) { /* 保存できなくても動作は続ける */ } }
  function reviewAdd(p, date) {
    const isNew = !review[p.id];
    review[p.id] = { from: date, streak: 0, at: Date.now() };
    saveReview();
    return isNew;
  }
  function reviewCorrect(p) {
    const r = review[p.id];
    if (!r) return null;
    r.streak++;
    if (r.streak >= REVIEW_NEED) { delete review[p.id]; saveReview(); return "removed"; }
    saveReview();
    return "up";
  }
  function reviewRemove(id) { delete review[id]; saveReview(); }
  const reviewList = () => Object.keys(review).map(id => ({ id, ...review[id] })).sort((a, b) => b.at - a.at);

  // ---------- 共通部品 ----------
  let mode = "daily";
  function tabs() {
    const t = el("div", { class: "tabs", role: "tablist" });
    const a = el("button", { class: "tab", role: "tab", "aria-selected": String(mode === "daily") }, "今日の5題");
    const n = Object.keys(review).length;
    const b = el("button", { class: "tab", role: "tab", "aria-selected": String(mode === "review") }, `復習リスト${n ? `<span class="tab-n">${n}</span>` : ""}`);
    a.addEventListener("click", () => { if (mode !== "daily") { viewDate = TODAY; showList(); } });
    b.addEventListener("click", () => { if (mode !== "review") showReview(); });
    t.append(a, b);
    return t;
  }
  function updateSummary() {
    if (mode === "review") {
      summary.innerHTML = `復習 <b>${Object.keys(review).length}</b> 問`;
      barFill.style.width = "0%";
      return;
    }
    const n = doneCount(viewDate);
    summary.innerHTML = `<b>${n}</b> / ${N} 問 正解`;
    barFill.style.width = n / N * 100 + "%";
  }
  const unitTag = p => `<span class="utag u-${p.unit}">${esc(UNIT_LABEL[p.unit])}</span>`;

  // ---------- 一覧 ----------
  function showList() {
    mode = "daily";
    updateSummary();
    bottomNav.hidden = true;
    app.replaceChildren();
    window.scrollTo(0, 0);
    const set = getSet(viewDate);
    const wrap = el("div", { class: "fade-in" });
    wrap.appendChild(tabs());

    const nav = el("div", { class: "datenav" });
    const prev = el("button", { class: "iconbtn", "aria-label": "前の日" }, "‹");
    const next = el("button", { class: "iconbtn", "aria-label": "次の日" }, "›");
    next.disabled = viewDate >= TODAY;
    prev.addEventListener("click", () => { viewDate = addDays(viewDate, -1); showList(); });
    next.addEventListener("click", () => { viewDate = addDays(viewDate, 1); showList(); });
    const mid = el("div", { class: "date" }, `${dateLabel(viewDate)}<small>${viewDate === TODAY ? "TODAY" : "REVIEW"}</small>`);
    if (viewDate !== TODAY) {
      const t = el("button", { class: "today-btn" }, "今日へ戻る");
      t.addEventListener("click", () => { viewDate = TODAY; showList(); });
      mid.appendChild(t);
    }
    nav.append(prev, mid, next);
    wrap.appendChild(nav);

    const sk = streak();
    if (sk > 0) wrap.appendChild(el("div", { class: "streak" }, `<span>連続達成</span><b>${sk}</b><span>日</span>`));
    if (doneCount(viewDate) === N) wrap.appendChild(el("div", { class: "all-clear" }, `この日の${N}題はすべて正解です。`));

    wrap.appendChild(el("div", { class: "section-label" }, "今日の5題"));
    const list = el("div", { class: "list" });
    set.forEach((p, i) => {
      const st = stOf(viewDate, i) || "todo";
      const mark = st === "done" ? "✓" : st === "peek" ? "✕" : "";
      const b = el("button", { class: "item", "data-st": st },
        `<span class="num">${i + 1}</span>
         <span style="min-width:0"><span class="item-q">${esc(p.q)}</span>
           <span class="item-meta">${unitTag(p)}</span></span>
         <span class="status" aria-hidden="true">${mark}</span>`);
      b.addEventListener("click", () => showProblem(i));
      list.appendChild(b);
    });
    wrap.appendChild(list);

    const nrv = Object.keys(review).length;
    if (nrv) {
      const c = el("button", { class: "rv-card" }, `<span>復習リストに <b>${nrv}</b> 問あります</span><span>見る ›</span>`);
      c.addEventListener("click", showReview);
      wrap.appendChild(c);
    }

    const foot = el("div", { class: "list-foot" });
    const reset = el("button", { class: "link" }, "記録をリセット");
    reset.addEventListener("click", () => {
      if (confirm("すべての日の記録を消しますか？(復習リストは残ります)")) { progress = {}; save(); showList(); }
    });
    foot.appendChild(reset);
    wrap.appendChild(foot);
    app.appendChild(wrap);
  }

  // ---------- 問題 ----------
  function showProblem(i) {
    const set = getSet(viewDate);
    renderProblem(set[i], {
      chip: dateLabel(viewDate), back: showList, backAria: "5題の一覧に戻る",
      pos: i + 1, total: set.length, go: d => showProblem(i + d),
      isWrongNew: () => stOf(viewDate, i) !== "done", // 正解済みの問題を間違えても復習には足さない
      mark: status => { setSt(viewDate, i, status); updateSummary(); },
      date: viewDate
    });
  }

  function renderProblem(p, ctx) {
    updateSummary();
    app.replaceChildren();
    window.scrollTo(0, 0);
    const wrap = el("div", { class: "fade-in" });

    const crumbs = el("div", { class: "crumbs" });
    const backBtn = el("button", { class: "back-btn", type: "button", "aria-label": ctx.backAria }, "☰ 一覧へ戻る");
    backBtn.addEventListener("click", ctx.back);
    crumbs.append(backBtn, el("span", { class: "chip" }, esc(ctx.chip)), el("span", { class: "chip plain" }, esc(UNIT_LABEL[p.unit])));
    wrap.appendChild(crumbs);

    const q = el("section", { class: "panel" });
    q.appendChild(el("div", { class: "q-no" }, `QUESTION ${ctx.pos}`));
    q.appendChild(el("p", { class: "q-body" }, esc(p.q)));
    wrap.appendChild(q);

    function buildChoice() {
    // 選択肢(日付+問題IDで並びを固定。同じ画面を開き直しても位置は変わらない)
    const opts = shuffled([p.a].concat(p.d), hash(p.id + ctx.date));
    const box = el("section", { class: "panel" });
    box.appendChild(el("div", { class: "field-label" }, p.type === "color" ? "色を選んでください" : "選択肢"));
    const grid = el("div", { class: "choices" + (p.type === "color" ? " color" : "") });
    const btns = opts.map((o, k) => {
      const sw = p.type === "color" ? `<i class="sw" style="background:${SWATCH[o] || "#ccc"}"></i>` : `<i class="lt">${"ABCD"[k]}</i>`;
      const b = el("button", { type: "button", class: "choice" }, `${sw}<span class="ct">${esc(o)}</span>`);
      b.dataset.v = o;
      grid.appendChild(b);
      return b;
    });
    box.appendChild(grid);
    const result = el("div");
    const peek = el("button", { class: "link", style: "display:block;margin:10px auto 0" }, "答えを見る");
    box.append(result, peek);
    wrap.appendChild(box);
    const explain = el("div");
    wrap.appendChild(explain);
    app.appendChild(wrap);

    let answered = false;
    function setResult(cls, icon, html) {
      result.replaceChildren(el("div", { class: "result " + cls }, `<span class="ico">${icon}</span><span>${html}</span>`));
    }
    function showExplain() {
      explain.replaceChildren(el("section", { class: "panel explain" }, `<h3>解説</h3><p>${esc(p.exp)}</p>`));
      setTimeout(() => explain.firstChild.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    }
    function lock(picked) {
      answered = true;
      peek.remove();
      btns.forEach(b => {
        b.disabled = true;
        if (b.dataset.v === p.a) b.classList.add("right");
        else if (b.dataset.v === picked) b.classList.add("wrong");
      });
    }
    function wrongNote() {
      if (!ctx.isWrongNew()) return;
      const had = !!review[p.id];
      reviewAdd(p, ctx.date);
      if (!had) result.appendChild(el("div", { class: "rv-note" }, "復習リストに追加しました"));
    }
    btns.forEach(b => b.addEventListener("click", () => {
      if (answered) return;
      const v = b.dataset.v;
      lock(v);
      if (v === p.a) {
        setResult("ok", "✓", "正解です");
        const rv = reviewCorrect(p);
        if (rv === "removed") result.appendChild(el("div", { class: "rv-note ok" }, `${REVIEW_NEED}回連続で正解したので、復習リストから外しました`));
        else if (rv === "up") result.appendChild(el("div", { class: "rv-note ok" }, `復習リスト: 連続正解 ${review[p.id].streak} / ${REVIEW_NEED}`));
        ctx.mark("done");
      } else {
        setResult("ng", "✕", `不正解　正解は「${esc(p.a)}」`);
        wrongNote();
        ctx.mark("peek");
      }
      showExplain();
    }));
    peek.addEventListener("click", () => {
      lock(null);
      setResult("peek", "👁", `答え　${esc(p.a)}`);
      wrongNote();
      ctx.mark("peek");
      showExplain();
    });

    }

    // 化学式を入力する問題(キーパッド入力。数字は自動で添字として表示する)
    function buildFill() {
      const box = el("section", { class: "panel" });
      box.appendChild(el("div", { class: "label-row" }, `<label class="field-label" for="ans">あなたの答え（化学式）</label>`));
      const input = el("input", { type: "text", id: "ans", inputmode: "none", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "下のキーで入力" });
      const preview = el("div", { class: "preview" });
      const ELEM = ["H", "C", "N", "O", "F", "S", "Cl", "Br", "I", "P", "Si", "K", "Na", "Mg", "Al", "Ca", "Ba", "Zn", "Fe", "Cu", "Ag", "Mn", "Cr", "Pb", "Sn", "Ni", "Hg", "Li", "Co", "Au"];
      const KEYS = ELEM.map(e => [e, e, "fn"]).concat([
        ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"],
        ["7", "7"], ["8", "8"], ["9", "9"], ["0", "0"], ["(", "(", "op"], [")", ")", "op"],
        ["[", "[", "op"], ["]", "]", "op"], ["·", "·", "op"], ["⁺", "⁺", "op"], ["⁻", "⁻", "op"], ["²", "²", "op"],
        ["³", "³", "op"], ["⁴", "⁴", "op"], ["◀", "@left", "ctl"], ["▶", "@right", "ctl"], ["⌫", "@del", "ctl"], ["消す", "@clear", "ctl"]
      ]);
      const kbd = el("div", { class: "kbd chem", role: "group", "aria-label": "入力キー" });
      KEYS.forEach(([label, ins, type]) => {
        const b = el("button", { type: "button", class: type || "" }, label);
        b.addEventListener("pointerdown", e => e.preventDefault()); // 入力欄のカーソル位置を保つ
        b.addEventListener("click", () => {
          if (ins === "@left") moveCursor(-1);
          else if (ins === "@right") moveCursor(1);
          else if (ins === "@del") backspace();
          else if (ins === "@clear") { input.value = ""; input.dispatchEvent(new Event("input")); }
          else insertText(ins);
        });
        kbd.appendChild(b);
      });
      const tools = el("div", { class: "kbd-tools" });
      const sysBtn = el("button", { type: "button", class: "link" }, "⌨ 通常のキーボードで入力");
      sysBtn.addEventListener("click", () => {
        const sys = input.getAttribute("inputmode") === "none";
        input.setAttribute("inputmode", sys ? "text" : "none");
        sysBtn.textContent = sys ? "⌨ キーパッドに戻す" : "⌨ 通常のキーボードで入力";
        input.blur(); input.focus();
      });
      tools.appendChild(sysBtn);
      const judge = el("button", { class: "btn block", style: "margin-top:12px" }, "答え合わせ");
      const peek = el("button", { class: "link", style: "display:block;margin:6px auto 0" }, "答えを見る");
      const result = el("div");
      box.append(input, preview, kbd, tools, judge, peek, result,
        el("p", { class: "tip" }, "□に入る物質を書いてください。係数も含めて判定します（係数1は省略可）。元素記号は大文字・小文字を区別します（Co と CO は別）。数字は自動で添字になります。電荷は ⁺ ⁻ と ² ³ ⁴ で入力（例：SO₄²⁻ → S O 4 ² ⁻）。水和水の前の数字は添字になりません（CaSO₄·2H₂O）。"));
      wrap.appendChild(box);
      const explain = el("div");
      wrap.appendChild(explain);
      app.appendChild(wrap);

      function insertText(s) {
        const st = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, st) + s + input.value.slice(en);
        const pos = st + s.length;
        input.setSelectionRange(pos, pos);
        input.dispatchEvent(new Event("input"));
      }
      function moveCursor(d) {
        const pos = Math.max(0, Math.min(input.value.length, (input.selectionStart ?? input.value.length) + d));
        input.setSelectionRange(pos, pos);
      }
      function backspace() {
        const st = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? input.value.length;
        if (st !== en) { input.value = input.value.slice(0, st) + input.value.slice(en); input.setSelectionRange(st, st); }
        else if (st > 0) { input.value = input.value.slice(0, st - 1) + input.value.slice(st); input.setSelectionRange(st - 1, st - 1); }
        input.dispatchEvent(new Event("input"));
      }
      input.addEventListener("input", () => {
        result.replaceChildren(); input.classList.remove("ok");
        preview.innerHTML = input.value.trim() ? `<span class="lab">入力</span><span class="fm">${InorganicBank.fmtFormula(input.value)}</span>` : "";
      });

      function setResult(cls, icon, html) {
        result.replaceChildren(el("div", { class: "result " + cls }, `<span class="ico">${icon}</span><span>${html}</span>`));
      }
      function showExplain() {
        explain.replaceChildren(el("section", { class: "panel explain" }, `<h3>解説</h3><p>${esc(p.exp)}</p>`));
        setTimeout(() => explain.firstChild.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
      }
      let solved = false, wrongLogged = false;
      function wrongNote() {
        if (solved || wrongLogged || !ctx.isWrongNew()) return;
        wrongLogged = true;
        const had = !!review[p.id];
        reviewAdd(p, ctx.date);
        if (!had) result.appendChild(el("div", { class: "rv-note" }, "復習リストに追加しました"));
      }
      function check() {
        if (!input.value.trim()) { input.focus(); return; }
        if (InorganicBank.judgeFormula(input.value, p)) {
          input.classList.add("ok");
          const rv = (solved || wrongLogged) ? null : reviewCorrect(p); // この画面で間違えたあとの正解は、連続回数に数えない
          solved = true;
          setResult("ok", "✓", "正解です");
          if (rv === "removed") result.appendChild(el("div", { class: "rv-note ok" }, `${REVIEW_NEED}回連続で正解したので、復習リストから外しました`));
          else if (rv === "up") result.appendChild(el("div", { class: "rv-note ok" }, `復習リスト: 連続正解 ${review[p.id].streak} / ${REVIEW_NEED}`));
          ctx.mark("done");
          peek.remove();
          showExplain();
        } else {
          setResult("ng", "✕", "惜しい、もう一度考えてみましょう");
          wrongNote();
        }
      }
      judge.addEventListener("click", check);
      input.addEventListener("keydown", e => { if (e.key === "Enter") check(); });
      peek.addEventListener("click", () => {
        setResult("peek", "👁", `答え　<span class="fm">${esc(p.a)}</span>`);
        wrongNote();
        ctx.mark("peek");
        peek.remove();
        showExplain();
      });
    }

    (p.type === "fill" ? buildFill : buildChoice)();

    // 下部ナビ
    bottomNav.hidden = false;
    bottomNav.replaceChildren();
    const inner = el("div", { class: "bottom-inner" });
    const bp = el("button", { class: "btn ghost" }, "← 前へ");
    const pager = el("button", { class: "list-btn", type: "button", "aria-label": ctx.backAria }, `<span>☰ 一覧へ</span><small>${ctx.pos} / ${ctx.total}</small>`);
    const bn = el("button", { class: "btn next" }, "次へ →");
    bp.disabled = ctx.pos === 1;
    bn.disabled = ctx.pos === ctx.total;
    bp.addEventListener("click", () => ctx.go(-1));
    bn.addEventListener("click", () => ctx.go(1));
    pager.addEventListener("click", ctx.back);
    inner.append(bp, pager, bn);
    bottomNav.appendChild(inner);
  }

  // ---------- 復習リスト画面 ----------
  let reviewFilter = "all";
  function showReview() {
    mode = "review";
    updateSummary();
    bottomNav.hidden = true;
    app.replaceChildren();
    window.scrollTo(0, 0);
    const wrap = el("div", { class: "fade-in" });
    wrap.appendChild(tabs());

    const all = reviewList();
    if (reviewFilter !== "all" && !all.some(r => BY_ID[r.id].unit === reviewFilter)) reviewFilter = "all";
    if (all.length) {
      const chips = el("div", { class: "filters", role: "group", "aria-label": "分野で絞り込む" });
      [["all", "すべて", all.length]].concat(UNITS.map(u => [u.key, u.label, all.filter(r => BY_ID[r.id].unit === u.key).length])).forEach(([key, label, n]) => {
        if (key !== "all" && n === 0) return;
        const b = el("button", { class: "filter", "aria-pressed": String(reviewFilter === key) }, `${esc(label)}<span>${n}</span>`);
        b.addEventListener("click", () => { reviewFilter = key; showReview(); });
        chips.appendChild(b);
      });
      wrap.appendChild(chips);
    }

    const rows = reviewFilter === "all" ? all : all.filter(r => BY_ID[r.id].unit === reviewFilter);
    wrap.appendChild(el("div", { class: "section-label" }, `間違えた問題　${REVIEW_NEED}回連続で正解すると外れます`));
    if (!rows.length) wrap.appendChild(el("div", { class: "empty" }, all.length ? "この分野の問題はありません。" : "復習する問題はありません。間違えた問題は自動でここにたまります。"));
    const list = el("div", { class: "list" });
    rows.forEach((r, idx) => {
      const p = BY_ID[r.id];
      const row = el("div", { class: "rv-row" });
      let pips = "";
      for (let n = 0; n < REVIEW_NEED; n++) pips += `<i class="${n < r.streak ? "on" : ""}"></i>`;
      const b = el("button", { class: "item", "data-st": r.streak > 0 ? "done" : "todo" },
        `<span class="num">${idx + 1}</span>
         <span style="min-width:0"><span class="item-q">${esc(p.q)}</span>
           <span class="item-meta">${unitTag(p)}<span>${dateLabel(r.from)}</span></span></span>
         <span class="pips" aria-label="連続正解 ${r.streak} / ${REVIEW_NEED}">${pips}</span>`);
      b.addEventListener("click", () => showReviewProblem(rows, idx));
      const del = el("button", { class: "rv-del", type: "button", "aria-label": "復習リストから外す" }, "×");
      del.addEventListener("click", () => { if (confirm("この問題を復習リストから外しますか？")) { reviewRemove(r.id); showReview(); } });
      row.append(b, del);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    app.appendChild(wrap);
  }

  function showReviewProblem(rows, idx) {
    const r = rows[idx];
    renderProblem(BY_ID[r.id], {
      chip: `復習　${dateLabel(r.from)}の問題`, back: showReview, backAria: "復習リストに戻る",
      pos: idx + 1, total: rows.length, go: d => showReviewProblem(rows, idx + d),
      isWrongNew: () => true,
      mark: () => updateSummary(),
      date: r.from
    });
  }

  const titleEl = document.querySelector(".site-header h1");
  if (titleEl) {
    titleEl.setAttribute("role", "button");
    titleEl.setAttribute("tabindex", "0");
    titleEl.setAttribute("aria-label", "今日の一覧に戻る");
    const goHome = () => { viewDate = TODAY; showList(); };
    titleEl.addEventListener("click", goHome);
    titleEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); } });
  }

  showList();
})();
