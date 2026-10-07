(function () {
  var MAX_COINS = 10;
  var MAX_HISTORY = 50;
  var STORAGE_KEY = 'limbusCoinFlipper.settings';
  var SIDES = ['a', 'b'];
  var NAMES = { a: 'Player', b: 'Adversary' };

  function $(id) { return document.getElementById(id); }

  function clampInt(value, lo, hi, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) n = fallback;
    return Math.max(lo, Math.min(hi, n));
  }

  // ---- Elements + per-side state ----
  var els = {};
  var coinsState = {};   // coinsState.a = [{min, max}, ...]

  SIDES.forEach(function (s) {
    els[s] = {
      count: $('count-' + s),
      clash: $('clash-' + s),
      coinRows: $('coins-' + s),
      results: $('result-' + s),
      total: $('total-' + s)
    };
    coinsState[s] = [];
  });

  var flipBtn = $('flipBtn');
  var verdictEl = $('verdict');
  var historyList = $('historyList');
  var historyEmpty = $('historyEmpty');
  var clearHistoryBtn = $('clearHistory');

  var history = [];
  var flipCounter = 0;
  var flipping = false;

  // ---- Persistence of settings only (history resets each visit) ----
  function saveSettings() {
    try {
      var data = {};
      SIDES.forEach(function (s) {
        data[s] = {
          count: els[s].count.value,
          clash: els[s].clash.value,
          coins: coinsState[s]
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable; ignore */ }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      SIDES.forEach(function (s) {
        var d = data && data[s];
        if (!d) return;
        els[s].count.value = clampInt(d.count, 1, MAX_COINS, 3);
        els[s].clash.value = clampInt(d.clash, -9999, 9999, 0);
        if (Array.isArray(d.coins)) {
          coinsState[s] = d.coins.slice(0, MAX_COINS).map(function (c) {
            return {
              min: clampInt(c && c.min, -9999, 9999, 2),
              max: clampInt(c && c.max, -9999, 9999, 4)
            };
          });
        }
      });
    } catch (e) { /* bad data; fall back to defaults */ }
  }

  // ---- Coin config rows ----
  function resizeCoins(s) {
    var n = clampInt(els[s].count.value, 1, MAX_COINS, 1);
    var list = coinsState[s];
    while (list.length < n) {
      var last = list[list.length - 1];
      list.push(last ? { min: last.min, max: last.max } : { min: 2, max: 4 });
    }
    list.length = n;
  }

  function markInvalid(row, c) {
    var bad = c.min > c.max;
    row.querySelector('.min-input').classList.toggle('invalid', bad);
    row.querySelector('.max-input').classList.toggle('invalid', bad);
    row.title = bad ? 'Min is higher than max, so the two will be swapped when flipping.' : '';
  }

  function renderCoinRows(s) {
    var wrap = els[s].coinRows;
    wrap.innerHTML = '';

    coinsState[s].forEach(function (coin, i) {
      var row = document.createElement('div');
      row.className = 'coin-row';

      var label = document.createElement('span');
      label.className = 'coin-label';
      label.textContent = '#' + (i + 1);

      var minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.step = '1';
      minInput.className = 'min-input';
      minInput.value = coin.min;
      minInput.setAttribute('aria-label', NAMES[s] + ' coin ' + (i + 1) + ' minimum');

      var maxInput = document.createElement('input');
      maxInput.type = 'number';
      maxInput.step = '1';
      maxInput.className = 'max-input';
      maxInput.value = coin.max;
      maxInput.setAttribute('aria-label', NAMES[s] + ' coin ' + (i + 1) + ' maximum');

      minInput.addEventListener('input', function () {
        coin.min = clampInt(minInput.value, -9999, 9999, 0);
        markInvalid(row, coin);
        saveSettings();
      });
      maxInput.addEventListener('input', function () {
        coin.max = clampInt(maxInput.value, -9999, 9999, 0);
        markInvalid(row, coin);
        saveSettings();
      });

      row.appendChild(label);
      row.appendChild(minInput);
      row.appendChild(maxInput);
      wrap.appendChild(row);
      markInvalid(row, coin);
    });
  }

  // ---- Flipping ----
  function rollSide(s) {
    var clash = clampInt(els[s].clash.value, -9999, 9999, 0);
    var total = 0;
    var coins = [];
    var headsCount = 0;

    coinsState[s].forEach(function (c) {
      var lo = Math.min(c.min, c.max);
      var hi = Math.max(c.min, c.max);
      var heads = Math.random() < 0.5;          // fair 50/50 coin
      var face = heads ? hi : lo;               // only two values: max or min
      var value = face + clash;                 // clash power added to each coin
      if (heads) headsCount++;
      total += value;
      coins.push({ heads: heads, face: face, clash: clash, value: value });
    });

    return { coins: coins, total: total, heads: headsCount, clash: clash };
  }

  // Coin i of the Player clashes with coin i of the Adversary; higher value wins.
  function clashOutcome(c, opposing) {
    if (!opposing) return { text: 'unopposed', cls: 'none' };
    if (c.value > opposing.value) return { text: 'win', cls: 'win' };
    if (c.value < opposing.value) return { text: 'lose', cls: 'lose' };
    return { text: 'tie', cls: 'tie' };
  }

  function showCoins(s, roll, opponentRoll) {
    var box = els[s].results;
    box.innerHTML = '';
    roll.coins.forEach(function (c, i) {
      var slot = document.createElement('div');
      slot.className = 'coin-slot';

      var coin = document.createElement('div');
      coin.className = 'coin ' + (c.heads ? 'heads' : 'tails');
      coin.style.animationDelay = (i * 0.12) + 's';
      coin.textContent = c.value > 0 ? '+' + c.value : String(c.value);
      coin.title = (c.heads ? 'Heads (max ' : 'Tails (min ') + c.face + ')' +
        (c.clash ? ' + clash ' + c.clash : '') + ' = ' + c.value;
      slot.appendChild(coin);

      // Win / lose label sits under the Player's coins only.
      if (s === 'a') {
        var outcome = clashOutcome(c, opponentRoll.coins[i]);
        var label = document.createElement('div');
        label.className = 'clash-label ' + outcome.cls;
        label.style.animationDelay = (i * 0.12 + 0.7) + 's';
        label.textContent = outcome.text;
        slot.appendChild(label);
      }

      box.appendChild(slot);
    });
    els[s].total.textContent = '—';
  }

  function finishFlip(rolls) {
    var a = rolls.a, b = rolls.b;
    els.a.total.textContent = a.total;
    els.b.total.textContent = b.total;

    var cls, text, result;
    if (a.total > b.total) {
      cls = 'win-a'; text = 'Player wins by ' + (a.total - b.total); result = 'Player wins';
    } else if (b.total > a.total) {
      cls = 'win-b'; text = 'Adversary wins by ' + (b.total - a.total); result = 'Adversary wins';
    } else {
      cls = 'tie'; text = 'Tie'; result = 'Tie';
    }
    verdictEl.className = 'verdict ' + cls;
    verdictEl.textContent = text;

    flipCounter++;
    history.unshift({ n: flipCounter, a: a, b: b, cls: cls, result: result });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    renderHistory();

    flipping = false;
    flipBtn.disabled = false;
  }

  function flip() {
    if (flipping) return;
    flipping = true;
    flipBtn.disabled = true;
    verdictEl.className = 'verdict';
    verdictEl.textContent = 'Flipping...';

    var rolls = { a: rollSide('a'), b: rollSide('b') };
    showCoins('a', rolls.a, rolls.b);
    showCoins('b', rolls.b, rolls.a);

    var longest = Math.max(rolls.a.coins.length, rolls.b.coins.length);
    var wait = longest * 120 + 1000;
    setTimeout(function () { finishFlip(rolls); }, wait);
  }

  // ---- History ----
  function renderHistory() {
    historyList.innerHTML = '';
    historyEmpty.style.display = history.length ? 'none' : 'block';

    history.forEach(function (h) {
      var li = document.createElement('li');
      li.className = h.cls;

      var num = document.createElement('span');
      num.className = 'h-num';
      num.textContent = '#' + h.n;

      var a = document.createElement('span');
      a.className = 'h-a';
      a.textContent = 'Player: ' + h.a.total + ' (' + h.a.heads + '/' + h.a.coins.length + ' heads)';

      var res = document.createElement('span');
      res.className = 'h-result';
      res.textContent = h.result;

      var b = document.createElement('span');
      b.className = 'h-b';
      b.textContent = 'Adversary: ' + h.b.total + ' (' + h.b.heads + '/' + h.b.coins.length + ' heads)';

      li.appendChild(num);
      li.appendChild(a);
      li.appendChild(res);
      li.appendChild(b);
      historyList.appendChild(li);
    });
  }

  // ---- Wire up ----
  SIDES.forEach(function (s) {
    // Only rebuild the coin rows when the coin count actually changes, so
    // clicking into a min/max box (which blurs this field) never swaps the
    // row out from under the click.
    function syncCoinCount() {
      var n = clampInt(els[s].count.value, 1, MAX_COINS, 1);
      if (n !== coinsState[s].length) {
        resizeCoins(s);
        renderCoinRows(s);
        saveSettings();
      }
    }
    els[s].count.addEventListener('input', function () {
      if (els[s].count.value === '') return;
      syncCoinCount();
    });
    els[s].count.addEventListener('change', function () {
      els[s].count.value = clampInt(els[s].count.value, 1, MAX_COINS, 1);
      syncCoinCount();
    });
    els[s].clash.addEventListener('input', saveSettings);
  });

  flipBtn.addEventListener('click', flip);

  clearHistoryBtn.addEventListener('click', function () {
    history = [];
    flipCounter = 0;
    renderHistory();
  });

  // ---- Init ----
  loadSettings();
  SIDES.forEach(function (s) {
    resizeCoins(s);
    renderCoinRows(s);
  });
  renderHistory();
})();