/**
 * Данные плейлистов.
 * Аудио:  media/<Playlist>/<файл>.mp3
 * Обложка: cover/<имя mp3 без .mp3>.webp
 */
const PLAYLISTS = {
  Playlist1: {
    album: 'Playlist 1',
    tracks: [
      { file: 'abba-happynewyear.mp3',                 title: 'ABBA — Happy New Year',                     desc: 'Новогодний сингл ABBA, 1980',       genre: 'Pop' },
      { file: 'despacito-daddy-yankee-luis-fonsi.mp3', title: 'Luis Fonsi feat. Daddy Yankee — Despacito', desc: 'Латино-поп хит 2017 года',          genre: 'Latino' },
      { file: 'jingle-bells-frank-sinatra.mp3',        title: 'Frank Sinatra — Jingle Bells',              desc: 'Классическая рождественская песня', genre: 'Jazz' },
    ],
  },
  Playlist2: {
    album: 'Playlist 2',
    tracks: [
      { file: 'etolubov-polkovnik-remix-prityazhenie.mp3', title: 'EtoLubov — Полковник (remix)',   desc: 'Ремикс на тему притяжения', genre: 'Pop / Remix' },
      { file: 'dragostea-din-te-o-zone.mp3',               title: 'O-Zone — Dragostea din tei',     desc: 'Культовый хит 2003 года',   genre: 'Eurodance' },
      { file: 'electro-club-dance-mix-diskoteka-80-ruchki-nu-gde-zhe-vashi-ruchki.mp3', title: 'Electro Club Dance Mix — Дискотека 80', desc: 'Танцевальный микс', genre: 'Dance' },
    ],
  },
  Playlist3: {
    album: 'Playlist 3',
    tracks: [
      { file: 'rampampam-minelli.mp3', title: 'Minelli — Rampampam',       desc: 'Танцевальный хит',           genre: 'Dance' },
      { file: 'relaks.mp3',            title: 'Relaks',                      desc: 'Спокойная композиция',       genre: 'Chill' },
      { file: 'natalie-dont-raye.mp3', title: 'Natalie — Don\'t Raye',       desc: 'Поп-композиция',             genre: 'Pop' },
    ],
  },
};

const COMMENT_EMAIL = 'mohov@bk.ru';

// Нормализация
Object.entries(PLAYLISTS).forEach(([key, pl]) => {
  pl.tracks = pl.tracks.map((t) => ({
    ...t,
    url: `media/${key}/${t.file}`,
    cover: `cover/${t.file.replace(/\.mp3$/i, '')}.webp`,
    lyrics: `lyrics/${t.file.replace(/\.mp3$/i, '')}.txt`,
  }));
});
