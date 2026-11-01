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
  const TYPE_LABEL = { choice: "4択", color: "色", fill: "化学式", elem: "元素", err: "誤り探し", multi: "全て選べ" };
  // 一覧に出す問題文(全て選べ形式は問題文が共通なので、題材で見分ける)
  const listQ = p => p.type === "multi" ? `${p.title}に関する記述 a〜e から、正しいものをすべて選ぶ` : p.q;
  const TEST_PER_UNIT = 2; // ランダムテストは、各分野からこの数ずつ出す
  const TEST_N = UNITS.length * TEST_PER_UNIT;
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
  const qd = new URLSearchParams(location.search).get("date"); // ?date=YYYY-MM-DD で「今日」を差し替え(動作確認用)
  const TODAY = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : fmt(new Date());
  const dateLabel = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
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
  const UNIT_IDS = {};
  UNITS.forEach(u => { UNIT_IDS[u.key] = BANK.filter(p => p.unit === u.key).map(p => p.id); });

  function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 保存できなくても動作は続ける */ } }

  // ---------- 問題ごとの結果 { 問題ID: "done"(最後の回答が正解) | "peek"(最後の回答が不正解・答えを見た) } ----------
  const PROG_KEY = "inorg.prog.v1";
  let prog = loadJSON(PROG_KEY);
  Object.keys(prog).forEach(k => { if (!BY_ID[k]) delete prog[k]; });
  function setProg(id, v) { prog[id] = v; saveJSON(PROG_KEY, prog); }
  const statOf = ids => ({ total: ids.length, done: ids.filter(id => prog[id] === "done").length, ng: ids.filter(id => prog[id] === "peek").length });

  // ---------- ランダムテスト(1日1回更新。日付から問題が決まり、最初に開いたときに固定する) ----------
  const TEST_KEY = "inorg.test.v1";
  let tests = loadJSON(TEST_KEY); // { 日付: { ids: [...], res: { 問題ID: "done"|"peek" } } }
  function getTest(date) {
    const t = tests[date];
    if (t && Array.isArray(t.ids) && t.ids.length === TEST_N && t.ids.every(id => BY_ID[id])) return t;
    let ids = [];
    UNITS.forEach(u => { ids = ids.concat(shuffled(UNIT_IDS[u.key], hash(u.key + date)).slice(0, TEST_PER_UNIT)); });
    ids = shuffled(ids, hash("test" + date));
    tests[date] = { ids, res: {} };
    const keys = Object.keys(tests).sort(); // 古い日から消す(60日分だけ残す)
    keys.slice(0, Math.max(0, keys.length - 60)).forEach(k => delete tests[k]);
    saveJSON(TEST_KEY, tests);
    return tests[date];
  }

  // ---------- 復習リスト ----------
  // 間違えた問題(「答えを見る」を含む)を問題IDで保存する。2回連続で正解したら外す。間違えると連続回数は0に戻る。
  const REVIEW_KEY = "inorg.review.v1";
  const REVIEW_NEED = 2;
  let review = loadJSON(REVIEW_KEY);
  Object.keys(review).forEach(k => { if (!BY_ID[k]) delete review[k]; });
  function saveReview() { saveJSON(REVIEW_KEY, review); }
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
  let mode = "units"; // "units" = 分野別 / "test" = ランダムテスト / "review" = 復習リスト
  function tabs() {
    const t = el("div", { class: "tabs t3", role: "tablist" });
    const n = Object.keys(review).length;
    [["units", "分野別", showUnits], ["test", "ランダムテスト", showTest],
     ["review", `復習リスト${n ? `<span class="tab-n">${n}</span>` : ""}`, showReview]].forEach(([key, label, fn]) => {
      const b = el("button", { class: "tab", role: "tab", "aria-selected": String(mode === key) }, label);
      b.addEventListener("click", () => { if (mode !== key) fn(); });
      t.appendChild(b);
    });
    return t;
  }
  function updateSummary() {
    if (mode === "review") {
      summary.innerHTML = `復習 <b>${Object.keys(review).length}</b> 問`;
      barFill.style.width = "0%";
    } else if (mode === "test") {
      const t = getTest(TODAY);
      const n = t.ids.filter(id => t.res[id] === "done").length;
      summary.innerHTML = `<b>${n}</b> / ${TEST_N} 問 正解`;
      barFill.style.width = n / TEST_N * 100 + "%";
    } else {
      const s = statOf(BANK.map(p => p.id));
      summary.innerHTML = `<b>${s.done}</b> / ${s.total} 問 正解済み`;
      barFill.style.width = s.done / s.total * 100 + "%";
    }
  }
  const unitTag = p => `<span class="utag u-${p.unit}">${esc(UNIT_LABEL[p.unit])}</span>`;
  const typeTag = p => `<span class="ttag">${TYPE_LABEL[p.type] || ""}</span>`;
  function begin() {
    updateSummary();
    bottomNav.hidden = true;
    app.replaceChildren();
    window.scrollTo(0, 0);
    const wrap = el("div", { class: "fade-in" });
    wrap.appendChild(tabs());
    return wrap;
  }
  function rowButton(num, p, st, extraMeta) {
    const mark = st === "done" ? "✓" : st === "peek" ? "✕" : "";
    return el("button", { class: "item", "data-st": st || "todo" },
      `<span class="num">${num}</span>
       <span style="min-width:0"><span class="item-q">${esc(listQ(p))}</span>
         <span class="item-meta">${extraMeta}</span></span>
       <span class="status" aria-hidden="true">${mark}</span>`);
  }

  // ---------- 分野別(全問の一覧。どの問題もいつでも解ける) ----------
  let curUnit = UNITS[0].key;
  let stFilter = "all";   // all / todo / ng / done
  let tyFilter = "all";   // all / choice / color / fill
  function showUnits() {
    mode = "units";
    const wrap = begin();

    const chips = el("div", { class: "filters unit-chips", role: "group", "aria-label": "分野を選ぶ" });
    UNITS.forEach(u => {
      const s = statOf(UNIT_IDS[u.key]);
      const b = el("button", { class: "filter", "aria-pressed": String(curUnit === u.key) }, `${esc(u.label)}<span>${s.done}/${s.total}</span>`);
      b.addEventListener("click", () => { curUnit = u.key; showUnits(); });
      chips.appendChild(b);
    });
    wrap.appendChild(chips);

    const ids = UNIT_IDS[curUnit];
    const s = statOf(ids);
    wrap.appendChild(el("div", { class: "unit-prog" },
      `<span><b>${s.done}</b> / ${s.total} 問 正解済み</span><span class="up-ng">${s.ng ? `不正解 ${s.ng}` : ""}</span>
       <div class="bar"><i style="width:${s.done / s.total * 100}%"></i></div>`));

    function filterRow(label, opts, get, set) {
      const row = el("div", { class: "filters sub", role: "group", "aria-label": label });
      opts.forEach(([key, text]) => {
        const b = el("button", { class: "filter small", "aria-pressed": String(get() === key) }, text);
        b.addEventListener("click", () => { set(key); showUnits(); });
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    filterRow("結果で絞り込む", [["all", "すべて"], ["todo", "未回答"], ["ng", "不正解"], ["done", "正解済み"]], () => stFilter, v => { stFilter = v; });
    filterRow("形式で絞り込む", [["all", "全形式"], ["fill", "化学式"], ["color", "色"], ["elem", "元素"], ["err", "誤り探し"], ["multi", "全て選べ"], ["choice", "4択"]], () => tyFilter, v => { tyFilter = v; });

    const rows = ids.map((id, i) => ({ p: BY_ID[id], i })).filter(({ p }) => {
      const st = prog[p.id];
      if (stFilter === "todo" && st) return false;
      if (stFilter === "ng" && st !== "peek") return false;
      if (stFilter === "done" && st !== "done") return false;
      if (tyFilter !== "all" && p.type !== tyFilter) return false;
      return true;
    });
    wrap.appendChild(el("div", { class: "section-label" }, `${esc(UNIT_LABEL[curUnit])}　${rows.length} 問`));
    if (!rows.length) wrap.appendChild(el("div", { class: "empty" }, "条件に合う問題はありません。"));
    const list = el("div", { class: "list" });
    rows.forEach(({ p, i }, k) => {
      const b = rowButton(i + 1, p, prog[p.id], typeTag(p));
      b.addEventListener("click", () => showUnitProblem(rows.map(r => r.p), k));
      list.appendChild(b);
    });
    wrap.appendChild(list);

    const foot = el("div", { class: "list-foot" });
    const reset = el("button", { class: "link" }, "記録をリセット");
    reset.addEventListener("click", () => {
      if (confirm("すべての問題の結果とテストの記録を消しますか？(復習リストは残ります)")) { prog = {}; saveJSON(PROG_KEY, prog); tests = {}; saveJSON(TEST_KEY, tests); showUnits(); }
    });
    foot.appendChild(reset);
    wrap.appendChild(foot);
    app.appendChild(wrap);
  }
  function showUnitProblem(ps, k) {
    const p = ps[k];
    renderProblem(p, {
      chip: UNIT_LABEL[p.unit], back: showUnits, backAria: "問題の一覧に戻る",
      pos: k + 1, total: ps.length, go: d => showUnitProblem(ps, k + d),
      mark: st => { setProg(p.id, st); updateSummary(); },
      seed: String(Math.random()), from: TODAY
    });
  }

  // ---------- ランダムテスト ----------
  function showTest() {
    mode = "test";
    const wrap = begin();
    const t = getTest(TODAY);
    const n = t.ids.filter(id => t.res[id] === "done").length;
    const answered = t.ids.filter(id => t.res[id]).length;

    wrap.appendChild(el("div", { class: "test-head" },
      `<div class="date">${dateLabel(TODAY)}<small>TODAY'S TEST</small></div>
       <p>全分野からランダムに ${TEST_N} 問。日付が変わると新しい問題になります。</p>`));
    if (answered === TEST_N) {
      wrap.appendChild(el("div", { class: n === TEST_N ? "all-clear" : "test-score" },
        n === TEST_N ? `全問正解です。（${TEST_N} / ${TEST_N}）` : `今日の結果　${n} / ${TEST_N} 問 正解`));
    }
    wrap.appendChild(el("div", { class: "section-label" }, "今日のテスト"));
    const list = el("div", { class: "list" });
    const ps = t.ids.map(id => BY_ID[id]);
    ps.forEach((p, i) => {
      const b = rowButton(i + 1, p, t.res[p.id], unitTag(p) + typeTag(p));
      b.addEventListener("click", () => showTestProblem(ps, i));
      list.appendChild(b);
    });
    wrap.appendChild(list);
    app.appendChild(wrap);
  }
  function showTestProblem(ps, k) {
    const p = ps[k];
    renderProblem(p, {
      chip: "ランダムテスト", back: showTest, backAria: "テストの一覧に戻る",
      pos: k + 1, total: ps.length, go: d => showTestProblem(ps, k + d),
      mark: st => { const t = getTest(TODAY); t.res[p.id] = st; saveJSON(TEST_KEY, tests); setProg(p.id, st); updateSummary(); },
      seed: TODAY, from: TODAY
    });
  }

  // ---------- 問題 ----------
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

    const LS = "abcde";
    const CIRC = "①②③④⑤";
    const segEls = [];
    const q = el("section", { class: "panel" });
    q.appendChild(el("div", { class: "q-no" }, `QUESTION ${ctx.pos}`));
    if (p.type === "err") {
      q.appendChild(el("p", { class: "q-body" }, "次の文章には、誤りが1か所ある。誤っている下線部を選べ。"));
      const para = el("p", { class: "err-text" });
      p.text.split(/\{\{(.+?)\}\}/).forEach((t, i) => {
        if (i % 2 === 0) { para.appendChild(document.createTextNode(t)); return; }
        const s = el("span", { class: "seg" }, `<span class="no">${CIRC[(i - 1) / 2]}</span>${esc(t)}`);
        segEls.push(s);
        para.appendChild(s);
      });
      q.appendChild(para);
    } else if (p.type === "multi") {
      q.appendChild(el("p", { class: "q-body" }, esc(p.q)));
      const ol = el("ol", { class: "stmts" });
      p.stmts.forEach((s, i) => ol.appendChild(el("li", null, `<i class="lt">${LS[i]}</i><span>${esc(s.t)}</span>`)));
      q.appendChild(ol);
    } else {
      q.appendChild(el("p", { class: "q-body" }, esc(p.q)));
    }
    wrap.appendChild(q);

    // ---- 採点・復習リスト・解説(形式によらず共通) ----
    const result = el("div");
    const explain = el("div");
    function setResult(cls, icon, html) {
      result.replaceChildren(el("div", { class: "result " + cls }, `<span class="ico">${icon}</span><span>${html}</span>`));
    }
    function explainHtml() {
      if (p.type === "multi") {
        const rows = p.stmts.map((s, i) =>
          `<li class="${s.ok ? "t" : "f"}"><i class="lt">${LS[i]}</i><b>${s.ok ? "〇" : "×"}</b><span>${esc(s.t)}${s.ok ? "" : `<em>${esc(s.note)}</em>`}</span></li>`).join("");
        return `<h3>解説</h3><ul class="stmt-ex">${rows}</ul>`;
      }
      let extra = "";
      if (p.type === "err") {
        let k = -1;
        const fixed = p.text.replace(/\{\{(.+?)\}\}/g, (m, s) => (++k === p.bad ? p.fix : s));
        extra = `<p class="fixed-sentence">${esc(fixed)}</p>`;
      }
      return `<h3>解説</h3>${extra}<p>${esc(p.exp)}</p>`;
    }
    function showExplain() {
      explain.replaceChildren(el("section", { class: "panel explain" }, explainHtml()));
      setTimeout(() => explain.firstChild && explain.firstChild.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    }
    function wrongNote() {
      const had = !!review[p.id];
      reviewAdd(p, ctx.from);
      if (!had) result.appendChild(el("div", { class: "rv-note" }, "復習リストに追加しました"));
    }
    const grade = {
      right(html) {
        setResult("ok", "✓", html);
        const rv = reviewCorrect(p);
        if (rv === "removed") result.appendChild(el("div", { class: "rv-note ok" }, `${REVIEW_NEED}回連続で正解したので、復習リストから外しました`));
        else if (rv === "up") result.appendChild(el("div", { class: "rv-note ok" }, `復習リスト: 連続正解 ${review[p.id].streak} / ${REVIEW_NEED}`));
        ctx.mark("done");
        showExplain();
      },
      wrong(html) { setResult("ng", "✕", html); wrongNote(); ctx.mark("peek"); showExplain(); },
      peek(html) { setResult("peek", "👁", html); wrongNote(); ctx.mark("peek"); showExplain(); }
    };
    const peekLink = () => el("button", { type: "button", class: "link", style: "display:block;margin:10px auto 0" }, "答えを見る");

    // 4択・色・元素
    function buildChoice() {
      // 選択肢の並びは、一覧から開いたときは毎回変わり、テストでは日付で固定する
      const opts = shuffled([p.a].concat(p.d), hash(p.id + ctx.seed));
      const box = el("section", { class: "panel" });
      box.appendChild(el("div", { class: "field-label" }, p.type === "color" ? "色を選んでください" : p.type === "elem" ? "元素を選んでください" : "選択肢"));
      const grid = el("div", { class: "choices" + (p.type === "color" ? " color" : "") });
      const btns = opts.map((o, k) => {
        const sw = p.type === "color" ? `<i class="sw" style="background:${SWATCH[o] || "#ccc"}"></i>` : `<i class="lt">${"ABCD"[k]}</i>`;
        const b = el("button", { type: "button", class: "choice" }, `${sw}<span class="ct">${esc(o)}</span>`);
        b.dataset.v = o;
        grid.appendChild(b);
        return b;
      });
      const peek = peekLink();
      box.append(grid, result, peek);
      wrap.append(box, explain);

      let answered = false;
      function lock(picked) {
        answered = true;
        peek.remove();
        btns.forEach(b => {
          b.disabled = true;
          if (b.dataset.v === p.a) b.classList.add("right");
          else if (b.dataset.v === picked) b.classList.add("wrong");
        });
      }
      btns.forEach(b => b.addEventListener("click", () => {
        if (answered) return;
        const v = b.dataset.v;
        lock(v);
        if (v === p.a) grade.right("正解です");
        else grade.wrong(`不正解　正解は「${esc(p.a)}」`);
      }));
      peek.addEventListener("click", () => { lock(null); grade.peek(`答え　${esc(p.a)}`); });
    }

    // 誤り探し(下線部の番号を選ぶ)
    function buildErr() {
      const box = el("section", { class: "panel" });
      box.appendChild(el("div", { class: "field-label" }, "誤っている下線部の番号"));
      const keys = el("div", { class: "mkeys" });
      keys.style.gridTemplateColumns = `repeat(${p.segs.length}, 1fr)`;
      const btns = p.segs.map((s, k) => {
        const b = el("button", { type: "button", class: "mkey" }, CIRC[k]);
        keys.appendChild(b);
        return b;
      });
      const peek = peekLink();
      box.append(keys, result, peek);
      wrap.append(box, explain);

      let answered = false;
      function lock(picked) {
        answered = true;
        peek.remove();
        btns.forEach((b, k) => {
          b.disabled = true;
          if (k === p.bad) b.classList.add("right");
          else if (k === picked) b.classList.add("wrong");
        });
        segEls.forEach((s, k) => {
          if (k !== p.bad) return;
          s.classList.add("bad");
          s.appendChild(el("span", { class: "fixed" }, `→ ${esc(p.fix)}`));
        });
      }
      const msg = `誤りは ${CIRC[p.bad]}　正しくは「${esc(p.fix)}」`;
      btns.forEach((b, k) => b.addEventListener("click", () => {
        if (answered) return;
        lock(k);
        if (k === p.bad) grade.right(`正解です　${msg}`);
        else grade.wrong(`不正解　${msg}`);
      }));
      peek.addEventListener("click", () => { lock(null); grade.peek(`答え　${msg}`); });
    }

    // 正しいものをすべて選ぶ(a〜e のキーパッド)
    function buildMulti() {
      const box = el("section", { class: "panel" });
      box.appendChild(el("div", { class: "field-label" }, "正しいと思う記号をすべて選んでください"));
      const sel = new Set();
      const keys = el("div", { class: "mkeys" });
      keys.style.gridTemplateColumns = "repeat(5, 1fr)";
      const cur = el("div", { class: "m-cur" });
      function refresh() {
        const v = LS.split("").filter(c => sel.has(c)).join(", ");
        cur.innerHTML = `<span class="lab">あなたの答え</span>${v ? `<span class="m-val">${v}</span>` : `<span class="m-none">未選択</span>`}`;
        btns.forEach(b => b.setAttribute("aria-pressed", String(sel.has(b.dataset.v))));
      }
      const btns = LS.split("").map(c => {
        const b = el("button", { type: "button", class: "mkey", "aria-pressed": "false" }, c);
        b.dataset.v = c;
        b.addEventListener("click", () => { if (sel.has(c)) sel.delete(c); else sel.add(c); refresh(); });
        keys.appendChild(b);
        return b;
      });
      const tools = el("div", { class: "kbd-tools" });
      const clear = el("button", { type: "button", class: "link" }, "選択をすべて外す");
      clear.addEventListener("click", () => { sel.clear(); refresh(); });
      tools.appendChild(clear);
      const judge = el("button", { type: "button", class: "btn block", style: "margin-top:12px" }, "答え合わせ");
      const peek = peekLink();
      box.append(keys, cur, tools, judge, result, peek);
      wrap.append(box, explain);
      refresh();

      const correct = new Set(p.stmts.map((s, i) => s.ok ? LS[i] : "").filter(Boolean));
      let answered = false;
      function lock() {
        answered = true;
        peek.remove(); judge.remove(); tools.remove();
        btns.forEach(b => {
          b.disabled = true;
          const c = b.dataset.v;
          if (correct.has(c)) b.classList.add("right");
          else if (sel.has(c)) b.classList.add("wrong");
        });
      }
      judge.addEventListener("click", () => {
        if (answered) return;
        if (!sel.size) { setResult("peek", "!", "記号を選んでから答え合わせをしてください"); return; }
        const ok = sel.size === correct.size && [...sel].every(c => correct.has(c));
        lock();
        if (ok) grade.right(`正解です　${esc(p.a)}`);
        else grade.wrong(`不正解　正解は ${esc(p.a)}`);
      });
      peek.addEventListener("click", () => { lock(); grade.peek(`答え　${esc(p.a)}`); });
    }

    // 化学式(答えを見て、〇か×を自分で付ける。×は復習リストに入る)
    function buildFill() {
      const box = el("section", { class: "panel" });
      box.appendChild(el("div", { class: "field-label" }, "紙やノートに書いてから、答えを見ましょう"));
      const reveal = el("button", { type: "button", class: "btn block" }, "答えを見る");
      const slot = el("div");
      box.append(reveal, slot, result);
      wrap.append(box, explain);
      reveal.addEventListener("click", () => {
        reveal.remove();
        const alts = (p.alts || []).length ? `<span class="alt">別の書き方：${p.alts.map(esc).join("、")}</span>` : "";
        slot.appendChild(el("div", { class: "self-ans" }, `<span class="lab">答え</span><span class="fm">${esc(p.a)}</span>${alts}`));
        slot.appendChild(el("div", { class: "self-q" }, "あなたの答えは合っていましたか？"));
        const row = el("div", { class: "self-judge" });
        const o = el("button", { type: "button", class: "sj o" }, "〇　合っていた");
        const x = el("button", { type: "button", class: "sj x" }, "×　間違えた");
        const fin = ok => {
          o.disabled = x.disabled = true;
          (ok ? o : x).classList.add("picked");
          if (ok) grade.right("〇　正解として記録しました");
          else grade.wrong("×　不正解として記録しました");
        };
        o.addEventListener("click", () => fin(true));
        x.addEventListener("click", () => fin(false));
        row.append(o, x);
        slot.appendChild(row);
        setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
      });
    }

    ({ fill: buildFill, err: buildErr, multi: buildMulti }[p.type] || buildChoice)();
    app.appendChild(wrap);

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
    const wrap = begin();

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
         <span style="min-width:0"><span class="item-q">${esc(listQ(p))}</span>
           <span class="item-meta">${unitTag(p)}${typeTag(p)}<span>${dateLabel(r.from)}</span></span></span>
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
    const r = rows[idx], p = BY_ID[r.id];
    renderProblem(p, {
      chip: `復習　${dateLabel(r.from)}`, back: showReview, backAria: "復習リストに戻る",
      pos: idx + 1, total: rows.length, go: d => showReviewProblem(rows, idx + d),
      mark: st => { setProg(p.id, st); updateSummary(); },
      seed: String(Math.random()), from: r.from
    });
  }

  const titleEl = document.querySelector(".site-header h1");
  if (titleEl) {
    titleEl.setAttribute("role", "button");
    titleEl.setAttribute("tabindex", "0");
    titleEl.setAttribute("aria-label", "分野別の一覧に戻る");
    titleEl.addEventListener("click", showUnits);
    titleEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showUnits(); } });
  }

  showUnits();
})();
