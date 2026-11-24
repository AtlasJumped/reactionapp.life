(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- safe storage ---------- */
  function lsGet(k, d) { try { var v = window.localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  var K = { opened: 'reactionapp.opened.v1', wall: 'reactionapp.wall.v1', msgs: 'reactionapp.msgs.v1', name: 'reactionapp.name.v1', sessions: 'reactionapp.sessions.v1' };

  function mmss(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function text(el, s) { if (el) el.textContent = s; }
  function show(el, on) { if (el) el.hidden = !on; }

  var md = navigator.mediaDevices;
  var caps = {
    display: !!(md && typeof md.getDisplayMedia === 'function'),
    cam: !!(md && typeof md.getUserMedia === 'function'),
    rec: typeof window.MediaRecorder !== 'undefined'
  };
  var LIMIT = 300; /* 5 minutes, seconds */

  /* ---------- navigation ---------- */
  var SCREENS = ['connect', 'record', 'reel', 'wall', 'leaders', 'inbox', 'me'];
  function go(name, noHash) {
    if (SCREENS.indexOf(name) < 0) name = 'connect';
    SCREENS.forEach(function (n) { var s = $('#s-' + n); if (s) s.classList.toggle('on', n === name); });
    $$('#nav button').forEach(function (b) {
      var on = b.getAttribute('data-go') === name || (name === 'reel' && b.getAttribute('data-go') === 'record');
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (!noHash) { try { history.replaceState(null, '', location.search + '#' + name); } catch (e) { } }
    if (name === 'wall') renderWall();
    if (name === 'inbox') renderMsgs();
    if (name === 'me') renderMe();
    if (name === 'reel') renderReelState();
    try { window.scrollTo(0, 0); } catch (e) { }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-go]') : null;
    if (b) { e.preventDefault(); go(b.getAttribute('data-go')); }
  });
  window.addEventListener('hashchange', function () { go((location.hash || '').slice(1), true); });

  /* ---------- connect your accounts ---------- */
  var PLATS = [
    ['instagram', 'Instagram', 'https://www.instagram.com/'],
    ['tiktok', 'TikTok', 'https://www.tiktok.com/'],
    ['youtube', 'YouTube', 'https://www.youtube.com/'],
    ['facebook', 'Facebook', 'https://www.facebook.com/'],
    ['snapchat', 'Snapchat', 'https://www.snapchat.com/'],
    ['x', 'X', 'https://x.com/']
  ];
  function renderPlats() {
    var opened = lsGet(K.opened, {});
    var ul = $('#plats'); ul.textContent = '';
    PLATS.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'plat' + (opened[p[0]] ? ' done' : '');
      var h = document.createElement('h3'); h.textContent = p[1];
      var st = document.createElement('p'); st.className = 'st';
      st.textContent = opened[p[0]] ? 'Opened on ' + new Date(opened[p[0]]).toLocaleDateString() : 'Not opened yet';
      var a = document.createElement('a');
      a.className = 'btn ghost'; a.href = p[2]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'Open ' + p[1];
      a.setAttribute('aria-label', 'Open ' + p[1] + ' in a new tab');
      a.addEventListener('click', function () {
        var o = lsGet(K.opened, {}); o[p[0]] = new Date().toISOString(); lsSet(K.opened, o);
        li.className = 'plat done'; text(st, 'Opened just now');
      });
      li.appendChild(h); li.appendChild(st); li.appendChild(a);
      ul.appendChild(li);
    });
  }

  /* ---------- record setup ---------- */
  var S = {
    mode: null, fileUrl: null, fileName: '', disp: null, cam: null, recs: {}, chunks: { cam: [], scr: [] },
    tStart: { cam: 0, scr: 0 }, blobs: { cam: null, scr: null }, urls: {}, startWall: 0, camStartWall: 0,
    active: false, timer: null, overShown: false, dur: 0, delta: 0, moments: [], hasReel: false, ended: false
  };

  function pickMime() {
    if (!caps.rec || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    var c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) { } }
    return '';
  }

  function setMode(m) {
    S.mode = m;
    $('#modeScreen').setAttribute('aria-pressed', String(m === 'screen'));
    $('#modeFile').setAttribute('aria-pressed', String(m === 'file'));
    show($('#filePick'), m === 'file');
    updateStart();
  }
  function updateStart() {
    var ok = caps.cam && caps.rec && ((S.mode === 'screen' && caps.display) || (S.mode === 'file' && !!S.fileUrl));
    $('#btnStart').disabled = !ok;
  }
  function initRecordSetup() {
    var msg = $('#capMsg');
    if (!caps.cam || !caps.rec) {
      text(msg, 'This browser cannot record camera video from a web page here. Try current Chrome, Edge, Firefox, or Safari on a secure (https) page.');
      $('#modeScreen').disabled = true; $('#modeFile').disabled = true; $('#btnStart').disabled = true;
      return;
    }
    if (!caps.display) {
      $('#modeScreen').disabled = true;
      text(msg, 'This device cannot record its own screen from a web page. Phone screen recording needs the coming phone app. For now, pick a video from your device and record your reaction to it.');
      setMode('file');
    } else {
      text(msg, 'Screen recording is available here. Tip: it works best on a desktop with a tab or window you choose.');
      setMode('screen');
    }
  }
  $('#modeScreen').addEventListener('click', function () { if (caps.display) setMode('screen'); });
  $('#modeFile').addEventListener('click', function () { setMode('file'); });
  $('#goFile').addEventListener('click', function () { go('record'); if (caps.cam && caps.rec) setMode('file'); });

  $('#fileIn').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (S.fileUrl) { try { URL.revokeObjectURL(S.fileUrl); } catch (e) { } S.fileUrl = null; }
    text($('#fileMsg'), '');
    if (!f) { updateStart(); return; }
    var url = URL.createObjectURL(f);
    var t = document.createElement('video');
    t.preload = 'metadata'; t.muted = true;
    t.onloadedmetadata = function () { S.fileUrl = url; S.fileName = f.name; text($('#fileMsg'), 'Ready: ' + f.name); updateStart(); };
    t.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) { } text($('#fileMsg'), 'This browser cannot play that file. Try an MP4 or WebM video.'); updateStart(); };
    t.src = url;
  });

  function errText(e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permission was not given. Allow the camera, and screen sharing in screen mode, then press Start again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
    if (n === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
    if (n === 'AbortError') return 'The camera or screen could not start. Try again.';
    return 'Could not start recording' + (n ? ' (' + n + ')' : '') + '. Try again, or try another browser.';
  }

  async function getCamStream() {
    try { return await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: true }); }
    catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        /* maybe only mic denied or camera denied: try camera only once */
        try { return await md.getUserMedia({ video: true, audio: false }); } catch (e2) { throw e2; }
      }
      return await md.getUserMedia({ video: true, audio: false });
    }
  }
  async function getDispStream() {
    try { return await md.getDisplayMedia({ video: true, audio: true }); }
    catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError' || e.name === 'SecurityError')) throw e;
      return await md.getDisplayMedia({ video: true });
    }
  }
  function mkRec(stream, key) {
    var mime = pickMime(), r;
    try { r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { r = new MediaRecorder(stream); }
    S.chunks[key] = [];
    r.ondataavailable = function (e) { if (e.data && e.data.size) S.chunks[key].push(e.data); };
    r.addEventListener('start', function () { S.tStart[key] = performance.now(); });
    return r;
  }
  function stopTracks(s) { if (s) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } } }
  function waitEvent(target, name) { return new Promise(function (res) { target.addEventListener(name, function h() { target.removeEventListener(name, h); res(); }); }); }

  async function start() {
    var err = $('#recErr'); show(err, false);
    var btn = $('#btnStart'); btn.disabled = true;
    var disp = null, cam = null;
    try {
      if (S.mode === 'screen') disp = await getDispStream();
      cam = await getCamStream();
    } catch (e) {
      stopTracks(disp); stopTracks(cam);
      text(err, errText(e)); show(err, true); updateStart();
      return;
    }
    try {
      resetSession();
      S.disp = disp; S.cam = cam; S.ended = false;
      var v1 = $('#vLive1'), v2 = $('#vLive2');
      v2.srcObject = cam; v2.muted = true;
      show($('#none1'), false);
      if (disp) {
        v1.srcObject = disp; v1.muted = true; v1.removeAttribute('src');
        text($('#lab1'), 'What you watch (screen)');
        S.recs.scr = mkRec(disp, 'scr');
        var vt = disp.getVideoTracks()[0];
        if (vt) vt.addEventListener('ended', function () { if (S.active) finishSession(); });
      } else {
        v1.srcObject = null; v1.src = S.fileUrl; v1.muted = false; v1.loop = false;
        text($('#lab1'), 'What you watch (your video)');
      }
      S.recs.cam = mkRec(cam, 'cam');
      var starts = [];
      if (S.recs.scr) { starts.push(waitEvent(S.recs.scr, 'start')); S.recs.scr.start(1000); }
      starts.push(waitEvent(S.recs.cam, 'start')); S.recs.cam.start(1000);
      await Promise.all(starts);
      if (disp) { S.delta = (S.tStart.cam - S.tStart.scr) / 1000; }
      else {
        var onPlaying = function () { S.tStart.scr = performance.now(); S.delta = (S.tStart.cam - S.tStart.scr) / 1000; v1.removeEventListener('playing', onPlaying); };
        v1.addEventListener('playing', onPlaying);
        v1.onended = function () { text($('#liveNote'), 'Your video ended. Press Done when you are ready.'); };
        S.tStart.scr = performance.now(); S.delta = (S.tStart.cam - S.tStart.scr) / 1000;
        try { await v1.play(); } catch (e) { text($('#liveNote'), 'Press play on the video if it did not start.'); v1.controls = true; }
      }
      S.startWall = Date.now(); S.active = true; S.overShown = false;
      show($('#recSetup'), false); show($('#recLive'), true); show($('#timeUp'), false);
      text($('#recStatus'), 'Recording');
      text($('#liveNote'), disp ? 'Switch to the tab or window you are sharing and watch as usual. Come back here and press Done when you finish. Sharing your own tab shows a mirror, so share the video tab.' : '');
      tick(); S.timer = setInterval(tick, 250);
    } catch (e) {
      cleanupLive();
      text(err, 'Could not start recording' + (e && e.name ? ' (' + e.name + ')' : '') + '. Try again, or try another browser.'); show(err, true); updateStart();
    }
  }
  function tick() {
    if (!S.active) return;
    var el = (Date.now() - S.startWall) / 1000, rem = LIMIT - el, t = $('#timer');
    if (rem > 0) { text(t, mmss(Math.ceil(rem))); t.classList.remove('over'); }
    else {
      text(t, '0:00'); t.classList.add('over');
      text($('#recStatus'), 'Over by ' + mmss(-rem));
      if (!S.overShown) { S.overShown = true; show($('#timeUp'), true); document.title = 'Time is up | Reaction App'; }
    }
  }
  function resetSession() {
    ['cam', 'scr'].forEach(function (k) { S.blobs[k] = null; S.chunks[k] = []; });
    Object.keys(S.urls).forEach(function (k) { try { URL.revokeObjectURL(S.urls[k]); } catch (e) { } });
    S.urls = {}; S.moments = []; S.hasReel = false; S.recs = {};
  }
  function cleanupLive() {
    S.active = false; clearInterval(S.timer); S.timer = null;
    stopTracks(S.disp); stopTracks(S.cam); S.disp = null; S.cam = null;
    var v1 = $('#vLive1'), v2 = $('#vLive2');
    v1.srcObject = null; v2.srcObject = null; v1.pause(); v1.removeAttribute('src');
    show($('#recLive'), false); show($('#recSetup'), true);
    document.title = 'Reaction App prototype'; updateStart();
  }
  function stopRec(r) {
    return new Promise(function (res) {
      if (!r || r.state === 'inactive') { res(); return; }
      r.addEventListener('stop', function () { res(); }, { once: true });
      try { r.stop(); } catch (e) { res(); }
    });
  }
  async function finishSession() {
    if (!S.active) return;
    S.active = false; clearInterval(S.timer);
    var camStart = S.tStart.cam;
    S.dur = (performance.now() - camStart) / 1000;
    $('#btnDone').disabled = true;
    await Promise.all([stopRec(S.recs.cam), stopRec(S.recs.scr)]);
    var type = (S.recs.cam && S.recs.cam.mimeType) || 'video/webm';
    S.blobs.cam = new Blob(S.chunks.cam, { type: type });
    if (S.recs.scr) S.blobs.scr = new Blob(S.chunks.scr, { type: S.recs.scr.mimeType || type });
    var wasFile = !S.disp;
    cleanupLive();
    $('#btnDone').disabled = false;
    if (!S.blobs.cam.size) { text($('#recErr'), 'The recording came out empty. Please try again.'); show($('#recErr'), true); return; }
    lsSet(K.sessions, (lsGet(K.sessions, 0) || 0) + 1);
    S.urls.cam = URL.createObjectURL(S.blobs.cam);
    if (S.blobs.scr) S.urls.scr = URL.createObjectURL(S.blobs.scr);
    else if (wasFile && S.fileUrl) S.urls.scr = S.fileUrl;
    S.hasReel = true;
    go('reel');
    runAnalysis();
  }
  $('#btnStart').addEventListener('click', start);
  $('#btnDone').addEventListener('click', finishSession);
  $('#btnDiscard').addEventListener('click', function () {
    if (!S.active) return;
    S.active = false; clearInterval(S.timer);
    try { if (S.recs.cam && S.recs.cam.state !== 'inactive') S.recs.cam.stop(); if (S.recs.scr && S.recs.scr.state !== 'inactive') S.recs.scr.stop(); } catch (e) { }
    resetSession(); cleanupLive();
  });
  window.addEventListener('beforeunload', function (e) { if (S.active) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', function () { stopTracks(S.disp); stopTracks(S.cam); });

  /* ---------- reaction score and moments ---------- */
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); var n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; }
  function pickMoments(samples, dur) {
    if (samples.length < 4) return [];
    var raw = samples.map(function (x) { return x.s; });
    var sm = raw.map(function (v, i) { var a = raw[i - 1] === undefined ? v : raw[i - 1], c = raw[i + 1] === undefined ? v : raw[i + 1]; return (a + v + c) / 3; });
    var med = median(sm), mad = median(sm.map(function (v) { return Math.abs(v - med); }));
    var max = Math.max.apply(null, sm);
    if (!(max > med)) return [];
    var thr = med + Math.max(2.5 * 1.4826 * mad, 0.25 * (max - med));
    var peaks = [];
    for (var i = 0; i < sm.length; i++) {
      var p = sm[i - 1] === undefined ? -1 : sm[i - 1], n = sm[i + 1] === undefined ? -1 : sm[i + 1];
      if (sm[i] > thr && sm[i] >= p && sm[i] >= n) peaks.push({ t: samples[i].t, v: sm[i] });
    }
    peaks.sort(function (a, b) { return b.v - a.v; });
    var chosen = [];
    peaks.forEach(function (pk) {
      if (chosen.length >= 8) return;
      if (chosen.every(function (c) { return Math.abs(c.t - pk.t) >= 6; })) chosen.push(pk);
    });
    chosen.sort(function (a, b) { return a.t - b.t; });
    return chosen.map(function (c) {
      var strength = (c.v - med) / (max - med);
      return mk(c.t, dur, strength >= 0.6 ? 'Big reaction at ' + mmss(c.t) : 'Reaction at ' + mmss(c.t));
    });
  }
  function mk(t, dur, label) {
    return { t: t, start: Math.max(0, t - 2), end: dur ? Math.min(dur, t + 2) : t + 2, label: label, on: true };
  }

  function runAnalysis() {
    show($('#reelBusy'), true); show($('#reelMain'), false); show($('#reelNone'), false);
    text($('#busyMsg'), 'Looking for your strongest reactions...');
    var bar = $('#busyBar'); bar.style.width = '0%';
    scoreCamera(S.blobs.cam, function (p) { bar.style.width = Math.round(p * 100) + '%'; }).then(function (samples) {
      var last = samples.length ? samples[samples.length - 1].t : 0;
      if (last > S.dur) S.dur = last;
      S.moments = pickMoments(samples, S.dur);
      show($('#reelBusy'), false); show($('#reelMain'), true);
      loadReelVideos(); renderMoments();
    });
  }
  function scoreCamera(blob, onProg) {
    return new Promise(function (resolve) {
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
      v.style.cssText = 'position:fixed;left:-300px;top:0;width:64px;height:48px;opacity:.01;pointer-events:none';
      document.body.appendChild(v);
      var url = URL.createObjectURL(blob);
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
      var cx = null;
      try { cx = cv.getContext('2d', { willReadFrequently: true }); } catch (e) { cx = cv.getContext('2d'); }
      var samples = [], prev = null, next = 0, finished = false, lastT = -1, stall = 0, iv = null, wd = null;
      var STEP = 0.25;
      function done() {
        if (finished) return; finished = true;
        clearInterval(iv); clearInterval(wd);
        try { v.pause(); } catch (e) { }
        v.removeAttribute('src'); try { v.load(); } catch (e) { }
        if (v.parentNode) v.parentNode.removeChild(v);
        try { URL.revokeObjectURL(url); } catch (e) { }
        resolve(samples);
      }
      function grab() {
        if (finished || v.readyState < 2) return;
        var t = v.currentTime;
        if (t < next) return;
        try {
          cx.drawImage(v, 0, 0, 64, 48);
          var d = cx.getImageData(0, 0, 64, 48).data, g = new Float32Array(3072);
          for (var i = 0, j = 0; i < d.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (prev) { var s = 0; for (var k = 0; k < 3072; k++) s += Math.abs(g[k] - prev[k]); samples.push({ t: t, s: s / 3072 }); }
          prev = g;
        } catch (e) { done(); return; }
        next = t - (t % STEP) + STEP;
        if (S.dur > 0) onProg(Math.min(1, t / S.dur));
      }
      v.addEventListener('ended', done);
      v.addEventListener('error', done);
      if (typeof v.requestVideoFrameCallback === 'function') {
        var loop = function () { if (finished) return; grab(); try { v.requestVideoFrameCallback(loop); } catch (e) { } };
        v.addEventListener('playing', function () { try { v.requestVideoFrameCallback(loop); } catch (e) { } }, { once: true });
      } else { iv = setInterval(grab, 25); }
      wd = setInterval(function () {
        if (v.currentTime === lastT) { stall++; if (stall >= 12) done(); } else { stall = 0; lastT = v.currentTime; }
      }, 1000);
      v.src = url;
      try { v.playbackRate = 8; } catch (e) { }
      var pp = v.play();
      if (pp && pp.catch) pp.catch(function () { done(); });
    });
  }

  /* ---------- reel screen ---------- */
  function fixDuration(v) {
    v.addEventListener('loadedmetadata', function () {
      if (v.duration === Infinity) {
        var back = function () { v.removeEventListener('timeupdate', back); v.currentTime = 0; };
        v.addEventListener('timeupdate', back);
        try { v.currentTime = 1e101; } catch (e) { }
      }
    }, { once: true });
  }
  function loadReelVideos() {
    var a = $('#vR1'), b = $('#vR2');
    stopPlay();
    b.src = S.urls.cam || ''; fixDuration(b);
    if (S.urls.scr) { a.src = S.urls.scr; fixDuration(a); a.parentNode.hidden = false; }
    else { a.removeAttribute('src'); a.parentNode.hidden = true; }
    text($('#rlab1'), S.blobs.scr ? 'What you watched (screen)' : 'What you watched (your video)');
  }
  function renderReelState() {
    show($('#reelNone'), !S.hasReel);
    if (!S.hasReel) { show($('#reelMain'), false); show($('#reelBusy'), false); }
  }
  var playing = null;
  function stopPlay() {
    var a = $('#vR1'), b = $('#vR2');
    try { a.pause(); b.pause(); } catch (e) { }
    b.ontimeupdate = null; playing = null;
  }
  function playWindow(m, cb) {
    stopPlay();
    var a = $('#vR1'), b = $('#vR2');
    try { b.currentTime = m.start; if (S.urls.scr) a.currentTime = Math.max(0, m.start + S.delta); } catch (e) { }
    var token = {}; playing = token;
    b.ontimeupdate = function () { if (playing === token && b.currentTime >= m.end) { stopPlay(); if (cb) cb(); } };
    var p1 = b.play(); if (p1 && p1.catch) p1.catch(function () { });
    if (S.urls.scr) { var p2 = a.play(); if (p2 && p2.catch) p2.catch(function () { }); }
  }
  function renderMoments() {
    var ul = $('#mlist'); ul.textContent = '';
    S.moments.forEach(function (m, i) {
      var li = document.createElement('li');
      var lab = document.createElement('label');
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = m.on;
      cb.addEventListener('change', function () { m.on = cb.checked; sumMoments(); });
      var span = document.createElement('span'); span.textContent = m.label;
      var small = document.createElement('small'); small.textContent = ' (clip ' + mmss(m.start) + ' to ' + mmss(m.end) + ')';
      lab.appendChild(cb); span.appendChild(small); lab.appendChild(span);
      var pb = document.createElement('button'); pb.type = 'button'; pb.className = 'btn small ghost'; pb.textContent = 'Play';
      pb.setAttribute('aria-label', 'Play moment: ' + m.label);
      pb.addEventListener('click', function () { playWindow(m); });
      li.appendChild(lab); li.appendChild(pb); ul.appendChild(li);
    });
    sumMoments();
  }
  function sumMoments() {
    var sel = S.moments.filter(function (m) { return m.on; });
    var secs = sel.reduce(function (a, m) { return a + (m.end - m.start); }, 0);
    if (!S.moments.length) text($('#momSum'), 'No strong reactions found. Play the full recording above, and add a moment where you reacted.');
    else text($('#momSum'), S.moments.length + ' moment' + (S.moments.length === 1 ? '' : 's') + ' found. Keeping ' + sel.length + ', about ' + Math.round(secs) + ' seconds.');
  }
  $('#btnPlaySel').addEventListener('click', function () {
    var q = S.moments.filter(function (m) { return m.on; });
    (function next() { var m = q.shift(); if (m) playWindow(m, next); })();
  });
  $('#btnAddMom').addEventListener('click', function () {
    if (S.moments.length >= 12) return;
    var t = $('#vR2').currentTime || 0;
    S.moments.push(mk(t, S.dur, 'Added moment at ' + mmss(t)));
    S.moments.sort(function (a, b) { return a.t - b.t; });
    renderMoments();
  });
  $('#btnLayout').addEventListener('click', function () {
    var pair = $('#reelPair'), on = pair.classList.toggle('stack1');
    this.setAttribute('aria-pressed', String(on));
    text(this, on ? 'Show side by side' : "Show clip above reaction (friend's desktop view)");
  });

  /* ---------- finish ---------- */
  function ext(b) { return /mp4/.test(b.type) ? 'mp4' : 'webm'; }
  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''); }
  function download(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(u); }, 4000);
  }
  function siteUrl() { try { var u = new URL('../', location.href); u.search = ''; u.hash = ''; return u.href; } catch (e) { return location.origin + '/'; } }
  function copyText(t) {
    return new Promise(function (res) {
      function fb() {
        var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
        document.body.removeChild(ta); res(ok);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { res(true); }, fb); else fb();
    });
  }
  $('#btnFinish').addEventListener('click', async function () {
    var out = [], sel = S.moments.filter(function (m) { return m.on; });
    var btn = this; btn.disabled = true;
    var shareText = 'I recorded my reactions with Reaction App. Try it:';
    var url = siteUrl();
    try {
      if ($('#optWall').checked) {
        var w = lsGet(K.wall, []); w.unshift({ t: Date.now(), n: sel.length, labels: sel.map(function (m) { return m.label; }) });
        lsSet(K.wall, w.slice(0, 20));
        out.push('Posted a demo note to the community wall (this device only).');
      }
      if ($('#optSave').checked && S.blobs.cam) {
        var id = stamp(), q = [];
        q.push([S.blobs.cam, 'reaction-camera-' + id + '.' + ext(S.blobs.cam)]);
        if (S.blobs.scr) q.push([S.blobs.scr, 'reaction-screen-' + id + '.' + ext(S.blobs.scr)]);
        var lines = ['Reaction App moments', 'Times are on the camera recording.', 'Screen recording offset in seconds: ' + S.delta.toFixed(2)];
        sel.forEach(function (m) { lines.push(m.label + ' (clip ' + mmss(m.start) + ' to ' + mmss(m.end) + ')'); });
        q.push([new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }), 'reaction-moments-' + id + '.txt']);
        q.forEach(function (f, i) { setTimeout(function () { download(f[0], f[1]); }, i * 600); });
        out.push('Saving ' + q.length + ' files to your computer. Check your downloads.');
      }
      if ($('#optSend').checked) {
        var shared = false, data = { title: 'Reaction App', text: shareText, url: url };
        try {
          if (navigator.share) {
            try {
              var file = new File([S.blobs.cam], 'reaction.' + ext(S.blobs.cam), { type: S.blobs.cam.type });
              if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
            } catch (e) { }
            await navigator.share(data); shared = true; out.push('Opened your share sheet.');
          }
        } catch (e) {
          if (e && e.name === 'AbortError') { shared = true; out.push('Share cancelled.'); }
        }
        if (!shared) {
          var ok = await copyText(shareText + ' ' + url);
          out.push(ok ? 'Copied a message with the link. Paste it to your friend.' : 'Copy this message and send it: ' + shareText + ' ' + url);
        }
      }
      if (!out.length) out.push('Nothing selected. Check at least one option.');
    } catch (e) { out.push('Something went wrong with one option. Try again.'); }
    text($('#finMsg'), out.join(' '));
    btn.disabled = false;
  });

  /* ---------- demo screens ---------- */
  var SORTS = ['Top rated', 'Favorites', 'Most reactions', 'Most laughed', 'Most disgusted', 'Most angry', 'Shocked', 'Touched'];
  var sortSel = 0;
  function renderChips() {
    var c = $('#wallChips'); c.textContent = '';
    SORTS.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.setAttribute('aria-pressed', String(i === sortSel));
      b.addEventListener('click', function () { sortSel = i; renderChips(); text($('#wallNote'), 'Sorting by ' + s + '. Demo: sorting works once real reactions exist.'); });
      c.appendChild(b);
    });
  }
  function renderWall() {
    var list = $('#wallList'); list.textContent = '';
    function post(ph, who, line) {
      var d = document.createElement('div'); d.className = 'post';
      var a = document.createElement('div'); a.className = 'ph'; a.textContent = ph;
      var b = document.createElement('b'); b.textContent = who;
      var p = document.createElement('p'); p.textContent = line;
      d.appendChild(a); d.appendChild(b); d.appendChild(p); list.appendChild(d);
    }
    lsGet(K.wall, []).forEach(function (w) {
      post('Your reaction (demo note)', (lsGet(K.name, '') || 'You') + ' (demo)', w.n + ' moment' + (w.n === 1 ? '' : 's') + ', ' + new Date(w.t).toLocaleDateString() + '. Stays on this device.');
    });
    for (var i = 1; i <= 3; i++) post('Example reaction ' + i, 'Example', 'Reactions: n/a');
  }
  function renderMsgs() {
    var m = lsGet(K.msgs, []), ul = $('#msgList'); ul.textContent = '';
    m.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
    show($('#msgEmpty'), !m.length);
  }
  $('#msgAdd').addEventListener('click', function () {
    var v = $('#msgIn').value.trim(); if (!v) return;
    var m = lsGet(K.msgs, []); m.unshift(v); lsSet(K.msgs, m.slice(0, 30)); $('#msgIn').value = ''; renderMsgs();
  });
  function renderMe() {
    $('#nameIn').value = lsGet(K.name, '') || '';
    var o = lsGet(K.opened, {});
    text($('#meStats'), 'Sessions recorded: ' + (lsGet(K.sessions, 0) || 0) + '. Platforms opened: ' + Object.keys(o).length + '. Wall notes: ' + lsGet(K.wall, []).length + '.');
  }
  $('#nameIn').addEventListener('input', function () { lsSet(K.name, this.value); });
  $('#btnCopyLink').addEventListener('click', function () {
    copyText('Try Reaction App: ' + siteUrl()).then(function (ok) { text($('#meMsg'), ok ? 'Copied.' : 'Copy this link: ' + siteUrl()); });
  });
  $('#btnClear').addEventListener('click', function () {
    Object.keys(K).forEach(function (k) { try { localStorage.removeItem(K[k]); } catch (e) { } });
    renderMe(); renderPlats(); text($('#meMsg'), 'Cleared. Design ratings were kept.');
  });

  /* ---------- init ---------- */
  renderPlats(); renderChips(); initRecordSetup();
  var h = (location.hash || '').slice(1);
  go(SCREENS.indexOf(h) >= 0 && h !== 'reel' ? h : 'connect', true);
  window.__reactionApp = { caps: caps, state: S, pickMoments: pickMoments };
})();
