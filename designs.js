/* Design picker: switches skins live (?design=N), four-level rating plus note per design. */
(function () {
  'use strict';
  var DESIGNS = [
    { id: 1, name: 'Playful Pink', note: 'The original. Bold outlines, cream and pink, chunky buttons.' },
    { id: 2, name: 'Clean', note: 'Apple-like. White, light gray, thin lines, one blue accent.' },
    { id: 3, name: 'Midnight', note: 'Dark and glowing. Violet and cyan on near black.' },
    { id: 4, name: 'Sunset', note: 'Soft warm gradients, rounded shapes, no hard outlines.' },
    { id: 5, name: 'Paper', note: 'Editorial. Warm paper, serif headings, thin black rules.' }
  ];
  var LEVELS = ['Strong like', 'Like', 'Dislike', 'Strong dislike'];
  var KD = 'reactionapp.design', KR = 'reactionapp.ratings.v1';

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function readRatings() { try { var o = JSON.parse(lsGet(KR) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
  function valid(n) { return n >= 1 && n <= DESIGNS.length; }

  function pick() {
    var n = NaN;
    try { n = parseInt(new URLSearchParams(window.location.search).get('design'), 10); } catch (e) { }
    if (valid(n)) { lsSet(KD, String(n)); return n; }
    n = parseInt(lsGet(KD), 10);
    return valid(n) ? n : 1;
  }
  var cur = pick();
  function apply(n) {
    cur = n;
    document.documentElement.setAttribute('data-design', String(n));
    lsSet(KD, String(n));
    try {
      var u = new URL(window.location.href);
      u.searchParams.set('design', String(n));
      window.history.replaceState(null, '', u.toString());
    } catch (e) { }
  }
  document.documentElement.setAttribute('data-design', String(cur));
  window.ReactionDesigns = { list: DESIGNS, current: function () { return cur; } };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text) e.textContent = text;
    return e;
  }

  function build() {
    if (document.getElementById('dpBtn')) return;
    var ratings = readRatings();
    var btn = el('button', { id: 'dpBtn', class: 'dp-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/><path d="M12 21c-2 0-2-2-1-3s0-2-2-2"/></svg><span>Design</span>';
    var panel = el('div', { id: 'dpPanel', class: 'dp-panel', role: 'dialog', 'aria-label': 'Design picker', hidden: '' });
    var head = el('div', { class: 'dp-head' });
    head.appendChild(el('h2', null, 'Designs'));
    var x = el('button', { class: 'dp-x', type: 'button', 'aria-label': 'Close design picker' }, '×');
    head.appendChild(x);
    panel.appendChild(head);
    panel.appendChild(el('p', { class: 'dp-hint' }, 'Pick a design to see it live, then rate it. Ratings stay in this browser until you copy them.'));

    var items = {};
    DESIGNS.forEach(function (d) {
      var box = el('div', { class: 'dp-item' });
      box.appendChild(el('h3', null, d.id + '. ' + d.name + (d.id === 1 ? ' (default)' : '')));
      box.appendChild(el('p', null, d.note));
      var use = el('button', { class: 'dp-use', type: 'button' }, 'Use this design');
      use.addEventListener('click', function () { apply(d.id); refresh(); });
      box.appendChild(use);
      var rate = el('div', { class: 'dp-rate', role: 'group', 'aria-label': 'Rate ' + d.name });
      LEVELS.forEach(function (lv, i) {
        var b = el('button', { type: 'button', 'aria-pressed': 'false' }, lv);
        b.addEventListener('click', function () {
          var r = ratings[d.id] || {};
          r.level = (r.level === i) ? -1 : i;
          ratings[d.id] = r; save(); refresh();
        });
        rate.appendChild(b);
      });
      box.appendChild(rate);
      var lab = el('label', { for: 'dpn' + d.id }, 'Note (optional)');
      var ta = el('textarea', { id: 'dpn' + d.id, rows: '2' });
      ta.addEventListener('input', function () {
        var r = ratings[d.id] || {};
        r.note = ta.value; ratings[d.id] = r; save();
      });
      box.appendChild(lab); box.appendChild(ta);
      panel.appendChild(box);
      items[d.id] = { box: box, rate: rate, ta: ta };
    });

    var foot = el('div', { class: 'dp-foot' });
    var copy = el('button', { class: 'dp-copy', type: 'button' }, 'Submit');
    var msg = el('span', { class: 'dp-msg', role: 'status' });
    foot.appendChild(copy); foot.appendChild(msg);
    panel.appendChild(foot);

    function save() { if (!lsSet(KR, JSON.stringify(ratings))) msg.textContent = 'Could not save in this browser. Use Submit to send your ratings now.'; }
    function refresh() {
      DESIGNS.forEach(function (d) {
        var it = items[d.id], r = ratings[d.id] || {};
        it.box.className = 'dp-item' + (d.id === cur ? ' on' : '');
        var bs = it.rate.querySelectorAll('button');
        for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', r.level === i ? 'true' : 'false');
        if (it.ta.value !== (r.note || '') && document.activeElement !== it.ta) it.ta.value = r.note || '';
      });
    }
    function summary() {
      var lines = ['Reaction App design ratings, ' + new Date().toISOString().slice(0, 10)];
      DESIGNS.forEach(function (d) {
        var r = ratings[d.id] || {};
        var lv = (typeof r.level === 'number' && r.level >= 0) ? LEVELS[r.level] : 'not rated';
        lines.push(d.id + '. ' + d.name + ': ' + lv + (r.note ? '. Note: ' + r.note.replace(/\s+/g, ' ').trim() : ''));
      });
      lines.push('Current design: ' + cur);
      return lines.join('\n');
    }
    function fallbackCopy(text) {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { }
      document.body.removeChild(t);
      return ok;
    }
    function hmrSubmit(b, txt) { var D = window.HMRDock; if (!D || !D.submitBox || !b.parentNode) return false; var bx = D.submitBox({ text: txt, kind: 'design ratings' }); b.parentNode.insertBefore(bx, b.nextSibling); b.hidden = true; return true; }   // Submit with my email / Submit anonymously (the shared dock)
    copy.addEventListener('click', function () {
      if (hmrSubmit(copy, summary)) return;
      var text = summary();
      function done(ok) { msg.textContent = ok ? 'Copied.' : 'Copy failed. Select and copy this text: ' + text.split('\n')[0]; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else done(fallbackCopy(text));
    });

    function open() { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); refresh(); x.focus(); }
    function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    btn.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
    x.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
