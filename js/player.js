(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const app = $('ws-app');
  const el = {
    app,
    cover: $('ws-now-cover'), title: $('ws-now-title'), desc: $('ws-now-desc'), genre: $('ws-now-genre'),
    wave: $('ws-wave'), play: $('ws-play'), playIcon: document.querySelector('.ws-play-btn__icon'),
    timeCur: $('ws-time-current'), timeTotal: $('ws-time-total'),
    like: $('ws-like'), likeIcon: document.querySelector('.ws-like-btn__icon'), likeCount: $('ws-like-count'),
    plays: $('ws-plays-count'),
    list: $('ws-playlist'), album: $('ws-album-title'),
    texter: $('ws-texter'),
    lyricsBtn: $('ws-lyrics-open'),
    lyricsDialog: $('ws-lyrics-dialog'),
    lyricsDialogTitle: $('ws-lyrics-dialog-title'),
    lyricsDialogText: $('ws-lyrics-dialog-text'),
    lyricsClose: $('ws-lyrics-close'),
    themeToggle: $('ws-theme-toggle'), themeIcon: document.querySelector('.ws-theme-icon'),
    shuffleBtn: $('ws-shuffle'),
    tabs: $('ws-playlist-tabs'),
    commentOpen: $('ws-comment-open'), dialog: $('ws-comment-dialog'),
    commentForm: $('ws-comment-form'), commentText: $('ws-comment-text'), commentCancel: $('ws-comment-cancel'),
  };

  // ---------- Текст песни ----------
  let lyricsText = '';

  const resetLyrics = () => {
    lyricsText = '';
    el.texter.hidden = true;
    el.texter.textContent = '';
    el.texter.classList.remove('ws-is-loading');
    el.lyricsBtn.hidden = true; // нет текста — нет иконки
  };

  const loadLyrics = async (track) => {
    resetLyrics();
    if (!track.lyrics) return;
    el.texter.classList.add('ws-is-loading');
    el.texter.hidden = false;
    try {
      const res = await fetch(track.lyrics, { cache: 'no-store' });
      if (!res.ok) throw new Error('404');
      const text = (await res.text()).trim();
      if (!text) throw new Error('empty');
      lyricsText = text;
      el.texter.textContent = text;
      el.lyricsBtn.hidden = false; // у трека есть текст — показываем иконку
    } catch (_) {
      resetLyrics();
    } finally {
      el.texter.classList.remove('ws-is-loading');
    }
  };

  // Иконка «текст» рядом с названием играющей песни → всплывающее окно с текстом
  el.lyricsBtn.addEventListener('click', () => {
    if (!lyricsText) return;
    const t = tracks[currentIndex];
    el.lyricsDialogTitle.textContent = t ? `Текст песни — ${t.title}` : 'Текст песни';
    el.lyricsDialogText.textContent = lyricsText;
    el.lyricsDialogText.scrollTop = 0;
    el.lyricsDialog.showModal();
  });
  el.lyricsClose.addEventListener('click', () => el.lyricsDialog.close());
  // Клик по затемнённому фону закрывает окно
  el.lyricsDialog.addEventListener('click', (e) => {
    if (e.target === el.lyricsDialog) el.lyricsDialog.close();
  });

  // ---------- API ----------
  const API_STATS = 'api/stats.php';
  const API_COMMENT = 'api/send-comment.php';

  const apiFetch = async (url, body) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (_) {
      return { ok: false, error: 'Network error' };
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(API_STATS, { cache: 'no-store' });
      const data = await res.json();
      return data.ok ? data.stats : {};
    } catch (_) {
      return {};
    }
  };

  let serverStats = {};

  // ---------- Выбор плейлиста ----------
  const params = new URLSearchParams(location.search);
  let listKey =
    (params.get('list') && PLAYLISTS[params.get('list')] && params.get('list')) ||
    (localStorage.getItem('ws_list') && PLAYLISTS[localStorage.getItem('ws_list')] && localStorage.getItem('ws_list')) ||
    'Playlist1';

  // ---------- WaveSurfer ----------
  const wavesurfer = WaveSurfer.create({
    container: '#ws-wave',
    backend: 'MediaElement',
    waveColor: '#5b5f7a',
    progressColor: '#8b8ff0',
    cursorColor: '#c7c9ff',
    height: 96,
    barWidth: 1, barGap: 2, barRadius: 2,
  });

  // ---------- Состояние ----------
  let playlist = PLAYLISTS[listKey];
  let tracks = playlist.tracks;
  let currentIndex = -1;
  let countedThisTrack = false;
  let shuffle = localStorage.getItem('ws_shuffle') === '1';
  let autoNextTimer = null;
  let advanceToken = 0;
  let lastCountedFile = null; // защита от «хвоста» audioprocess от предыдущего трека
  let countedAt = 0;           // время засчёта (performance.now) — для anti-flood окна
  let loadSeq = 0;             // счётчик загрузок: привязываем трек к событиям именно его загрузки
  let isCurrentLoad = () => true;

  // Волновая панель Wavesurfer 7 испускает 'audioprocess' из rAF-таймера, который
  // останавливается только на событии 'pause' медиаэлемента. Если старый трек играл
  // и мы сделали load() нового, 'pause' не приходит, таймер не гаснет, и несколько
  // кадров подряд летят старые cur/dur (≈ конец предыдущего трека) — при уже
  // обновлённом currentIndex это мгновенный ложный засчёт новому треку.
  // Каждый вызов loadIndex() инвалидирует события всех предыдущих загрузок.
  const trackLoad = () => {
    const my = ++loadSeq;
    return () => loadSeq === my; // true => события относятся к текущей загрузке
  };

  const fmt = (s) => {
    s = Math.max(0, s || 0);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ---------- Вкладки ----------
  const renderTabs = () => {
    el.tabs.innerHTML = '';
    Object.entries(PLAYLISTS).forEach(([key, pl]) => {
      const btn = document.createElement('button');
      btn.className = 'ws-tabs__btn';
      btn.type = 'button';
      btn.dataset.key = key;
      btn.textContent = pl.album;
      btn.setAttribute('aria-pressed', key === listKey ? 'true' : 'false');
      btn.classList.toggle('ws-is-active', key === listKey);
      btn.addEventListener('click', () => switchPlaylist(key));
      el.tabs.appendChild(btn);
    });
  };

  // ---------- Переключение плейлиста ----------
  const switchPlaylist = (key) => {
    if (!PLAYLISTS[key] || key === listKey) return;

    clearTimeout(autoNextTimer);
    advanceToken++;
    isCurrentLoad = trackLoad(); // гасим хвостовые события от прошлой загрузки/плейлиста
    try { wavesurfer.stop(); } catch (_) {}
    try { wavesurfer.empty(); } catch (_) {}

    listKey = key;
    playlist = PLAYLISTS[key];
    tracks = playlist.tracks;
    currentIndex = -1;
    countedThisTrack = false;
    lastCountedFile = null;
    localStorage.setItem('ws_list', listKey);

    const url = new URL(location.href);
    url.searchParams.set('list', listKey);
    history.replaceState(null, '', url);

    el.album.textContent = playlist.album;
    document.title = `${playlist.album} — Аудиоплеер`;
    renderTabs();
    renderList();
    resetNowPlaying();
    resetLyrics();

    if (tracks.length) loadIndex(0);
  };

  // ---------- Сброс «сейчас играет» ----------
  const resetNowPlaying = () => {
    el.cover.src = '';
    el.cover.alt = '';
    el.title.textContent = '—';
    el.desc.textContent = '';
    el.genre.textContent = '';
    el.timeCur.textContent = '0:00';
    el.timeTotal.textContent = '0:00';
    el.likeCount.textContent = '0';
    el.plays.textContent = '0';
    el.like.disabled = false;
    el.like.setAttribute('aria-pressed', 'false');
    el.like.classList.remove('ws-is-liked');
    el.likeIcon.textContent = '♡';
    el.like.title = 'Нравится';
    el.playIcon.textContent = '▶';
    el.play.classList.remove('ws-is-playing');
    el.wave.classList.add('ws-is-empty');
  };

  // ---------- «Сейчас играет» ----------
  const setNowPlaying = (i) => {
    const t = tracks[i];
    el.cover.src = t.cover;
    el.cover.alt = t.title;
    el.title.textContent = t.title;
    el.desc.textContent = t.desc || '';
    el.genre.textContent = t.genre || '';

    const s = serverStats[t.file] || { likes: 0, plays: 0 };
    el.likeCount.textContent = s.likes;
    el.plays.textContent = s.plays;

    const liked = localStorage.getItem(`ws_liked_${t.file}`) === '1';
    el.like.setAttribute('aria-pressed', liked ? 'true' : 'false');
    el.like.classList.toggle('ws-is-liked', liked);
    el.like.disabled = liked;
    el.like.title = liked ? 'Вы уже поставили лайк' : 'Нравится';
    el.likeIcon.textContent = liked ? '♥' : '♡';

    countedThisTrack = false;
    lastCountedFile = null; // новый трек = чистый счётчик (важно и для авто-перехода на тот же файл в shuffle)

    // Медиа-виджет блокировки экрана (обновляем сразу, не дожидаясь 'play')
    if ('mediaSession' in window) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: playlist.album,
          album: playlist.album,
          artwork: [{ src: t.cover, sizes: '512x512', type: '' }],
        });
      } catch (_) {}
    }
  };

  // ---------- Список треков ----------
  const renderList = () => {
    el.list.innerHTML = '';
    tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'ws-track';
      li.dataset.index = i;
      li.innerHTML = `
        <span class="ws-track__mark" aria-hidden="true"></span>
        <img class="ws-track__thumb" src="${t.cover}" alt="">
        <span class="ws-track__title">${t.title}</span>
        <span class="ws-track__stats">
          <span class="ws-track__plays" title="Прослушивания">🎧 <span data-plays="${i}">0</span></span>
          <span class="ws-track__likes" title="Лайки">♥ <span data-likes="${i}">0</span></span>
        </span>`;
      li.addEventListener('click', () => playIndex(i));
      el.list.appendChild(li);
    });
    refreshListStats();
    highlight();
  };

  const refreshListStats = () => {
    tracks.forEach((t, i) => {
      const s = serverStats[t.file] || { likes: 0, plays: 0 };
      const playsEl = el.list.querySelector(`[data-plays="${i}"]`);
      const likesEl = el.list.querySelector(`[data-likes="${i}"]`);
      if (playsEl) playsEl.textContent = s.plays;
      if (likesEl) likesEl.textContent = s.likes;
    });
  };

  const highlight = () => {
    [...el.list.children].forEach((li, i) => li.classList.toggle('ws-is-active', i === currentIndex));
  };

  // ---------- Загрузка ----------
  const loadIndex = async (i) => {
    if (i < 0 || i >= tracks.length) return;
    // ВАЖНО: wavesurfer.load() внутри делает setSrc → у медиаэлемента срабатывает
    // 'emptied' → Wavesurfer эмитит 'pause' и ГАСИТ rAF-таймер. Если бы мы сбросили
    // счётчик загрузок ПОСЛЕ await load(), все хвостовые кадры от старой загрузки
    // прошли бы фильтр isCurrentLoad() — именно поэтому инвалидация делается ДО load.
    isCurrentLoad = trackLoad(); // все «хвостовые» события от прошлой загрузки теперь игнорируются
    currentIndex = i;
    clearTimeout(autoNextTimer);
    setNowPlaying(i);
    loadLyrics(tracks[i]);
    highlight();
    el.wave.classList.remove('ws-is-empty');
    await wavesurfer.load(tracks[i].url);
  };

  const playIndex = async (i) => {
    await loadIndex(i);
    wavesurfer.play();
  };

  // ---------- События ----------
  wavesurfer.on('ready', () => {
    el.timeTotal.textContent = fmt(wavesurfer.getDuration());
    el.timeCur.textContent = fmt(wavesurfer.getCurrentTime());
  });

  wavesurfer.on('audioprocess', () => {
    // События от «умерших» загрузок (хвост rAF-таймера после переключения трека) — игнор.
    if (!isCurrentLoad()) return;

    const t = tracks[currentIndex];
    if (!t) return;

    const cur = wavesurfer.getCurrentTime();
    const dur = wavesurfer.getDuration();

    // Страхуемся от «залипшего» времени: если после load() медиаэлемент ещё не
    // перемотан на 0 (или currentTime остался от прошлой загрузки), любые расчёты
    // прогресса по такому cur/dur ложные. Время на табло при этом всё равно
    // обновляем, но к засчёту это событие не допускаем.
    if (!isCurrentLoad() || cur <= 0.5) {
      el.timeCur.textContent = fmt(cur);
      return;
    }

    el.timeCur.textContent = fmt(cur);

    // Засчёт только если: файл ещё не засчитан в этом прослушивании; это не хвост
    // событий предыдущего трека того же файла (lastCountedFile); и с момента
    // последнего засчёта прошло >=10 c (anti-flood: защита от любых остаточных
    // гонек, повторных триггеров finish/audioprocess и задублированных запросов).
    if (!countedThisTrack && dur > 0 && cur / dur >= 0.9 &&
        lastCountedFile !== t.file && performance.now() - countedAt >= 10000) {
      countedThisTrack = true;
      lastCountedFile = t.file;
      countedAt = performance.now();
      apiFetch(API_STATS, { action: 'play', track: t.file }).then((res) => {
        if (res.ok) {
          serverStats[t.file] = { likes: res.likes, plays: res.plays };
          el.plays.textContent = res.plays;
          refreshListStats();
        }
      });
    }
  });

  wavesurfer.on('play', () => {
    el.playIcon.textContent = '❚❚';
    el.play.classList.add('ws-is-playing');
    requestWakeLock();
    // Страховка: если ОС всё же приостановила воспроизведение на фоне,
    // пробуем продолжить (на части устройств это разрешено).
    if (document.hidden) resumeIfHidden();
  });
  wavesurfer.on('pause', () => {
    el.playIcon.textContent = '▶';
    el.play.classList.remove('ws-is-playing');
  });

  // ---------- Фоновое воспроизведение (экран выключен) ----------
  // Без MediaSession мобильный Chrome/Safari считают страницу неактивной и
  // останавливают <audio> при блокировке экрана. Плюс: Play/Pause/Next с
  // наушников и обложек на локскрине; без AudioContext — он глушит звук в фоне.
  let wakeLock = null;

  const media = () => {
    try { return wavesurfer.getMediaElement(); } catch (_) { return null; }
  };

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  };

  let resumeTimer = null;
  const resumeIfHidden = () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      const m = media();
      if (m && document.hidden && !m.paused && m.ended === false) {
        wavesurfer.play().catch(() => {});
      }
    }, 300);
  };

  if ('mediaSession' in window) {
    try {
      navigator.mediaSession.setActionHandler('play', () => wavesurfer.play());
      navigator.mediaSession.setActionHandler('pause', () => wavesurfer.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentIndex > 0) playIndex(currentIndex - 1);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (shuffle && tracks.length > 1) {
          let n; do { n = Math.floor(Math.random() * tracks.length); } while (n === currentIndex);
          playIndex(n);
        } else if (currentIndex + 1 < tracks.length) {
          playIndex(currentIndex + 1);
        }
      });
    } catch (_) {}
  }

  // Wake Lock теряется при блокировке — перезапрашиваем при возврате на вкладку.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestWakeLock();
  });

  wavesurfer.on('finish', () => {
    el.playIcon.textContent = '▶';
    el.play.classList.remove('ws-is-playing');
    const myToken = ++advanceToken;
    autoNextTimer = setTimeout(() => {
      if (myToken !== advanceToken) return;
      let next;
      if (shuffle) {
        if (tracks.length > 1) {
          do { next = Math.floor(Math.random() * tracks.length); } while (next === currentIndex);
        } else next = currentIndex;
      } else {
        next = currentIndex + 1;
        if (next >= tracks.length) return;
      }
      playIndex(next);
    }, 5000);
  });

  // ---------- Play/Pause ----------
  el.play.addEventListener('click', () => {
    if (currentIndex === -1) { playIndex(0); return; }
    wavesurfer.playPause();
  });

  // ---------- Shuffle ----------
  const applyShuffleUI = () => {
    el.shuffleBtn.classList.toggle('ws-is-on', shuffle);
    el.shuffleBtn.setAttribute('aria-pressed', shuffle ? 'true' : 'false');
    el.shuffleBtn.title = shuffle ? 'Случайный порядок: вкл' : 'Случайный порядок: выкл';
  };
  applyShuffleUI();
  el.shuffleBtn.addEventListener('click', () => {
    shuffle = !shuffle;
    localStorage.setItem('ws_shuffle', shuffle ? '1' : '0');
    applyShuffleUI();
  });

  // ---------- Лайк ----------
  el.like.addEventListener('click', async () => {
    if (currentIndex === -1) return;
    const t = tracks[currentIndex];
    if (localStorage.getItem(`ws_liked_${t.file}`) === '1') return;

    localStorage.setItem(`ws_liked_${t.file}`, '1');
    el.like.disabled = true;
    el.like.classList.add('ws-is-liked');
    el.like.setAttribute('aria-pressed', 'true');
    el.like.title = 'Вы уже поставили лайк';
    el.likeIcon.textContent = '♥';

    const res = await apiFetch(API_STATS, { action: 'like', track: t.file });
    if (res.ok) {
      serverStats[t.file] = {
        likes: res.likes,
        plays: res.plays ?? (serverStats[t.file]?.plays ?? 0),
      };
      el.likeCount.textContent = res.likes;
      refreshListStats();
    } else {
      localStorage.removeItem(`ws_liked_${t.file}`);
      el.like.disabled = false;
      el.like.classList.remove('ws-is-liked');
      el.like.setAttribute('aria-pressed', 'false');
      el.like.title = 'Нравится';
      el.likeIcon.textContent = '♡';
    }
  });

  // ---------- Комментарий ----------
  el.commentOpen.addEventListener('click', () => {
    if (currentIndex === -1) return;
    el.commentText.value = '';
    el.dialog.showModal();
  });
  el.commentCancel.addEventListener('click', () => el.dialog.close());
  el.commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = tracks[currentIndex];
    const message = el.commentText.value.trim();
    if (!message) return;

    const submitBtn = el.commentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const res = await apiFetch(API_COMMENT, { track: t.title, message });
    submitBtn.disabled = false;

    if (res.ok) {
      el.dialog.close();
      el.commentText.value = '';
    } else {
      alert(res.error || 'Не удалось отправить сообщение');
    }
  });

  // ---------- Тема (на .ws-app) ----------
  const applyTheme = (theme) => {
    el.app.dataset.theme = theme;
    el.themeIcon.textContent = theme === 'dark' ? '☾' : '☀';
    localStorage.setItem('ws_theme', theme);
  };
  applyTheme(localStorage.getItem('ws_theme') || 'dark');
  el.themeToggle.addEventListener('click', () => {
    applyTheme(el.app.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  // ---------- Инициализация ----------
  (async () => {
    serverStats = await loadStats();
    el.album.textContent = playlist.album;
    document.title = `${playlist.album} — Аудиоплеер`;
    renderTabs();
    renderList();
    if (tracks.length) loadIndex(0);
  })();
})();
