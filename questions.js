// German A2-B1 questions: each step picks one at random.
// Format: { q: question (use ___ for blank), options: [4 strings], correct: index 0..3 }

export const questions = [
  { q: "___ Mann liest eine Zeitung.",
    options: ["Der", "Die", "Das", "Den"], correct: 0 },
  { q: "Ich gehe heute ___ Schule.",
    options: ["zur", "zum", "in der", "auf die"], correct: 0 },
  { q: "Was ist die richtige Form? — Er ___ Deutsch seit zwei Jahren.",
    options: ["lernt", "lernen", "gelernt", "lernte"], correct: 0 },
  { q: "Ich habe gestern einen Film ___.",
    options: ["gesehen", "sehen", "gesieht", "geseht"], correct: 0 },
  { q: "Wir fahren ___ Berlin.",
    options: ["nach", "zu", "in", "an"], correct: 0 },
  { q: "Das Buch liegt ___ dem Tisch.",
    options: ["auf", "an", "in", "zu"], correct: 0 },
  { q: "Kannst du mir helfen, ___?",
    options: ["bitte", "bitten", "Bitten", "gebeten"], correct: 0 },
  { q: "Sie ___ ihrer Mutter beim Kochen.",
    options: ["hilft", "hilfen", "helft", "helfe"], correct: 0 },
  { q: "Ich freue mich ___ das Wochenende.",
    options: ["auf", "über", "von", "zu"], correct: 0 },
  { q: "Wenn es morgen regnet, ___ wir zu Hause.",
    options: ["bleiben", "bleibten", "geblieben", "bleibe"], correct: 0 },
  { q: "Der Zug ___ um 8 Uhr ab.",
    options: ["fährt", "fahren", "fuhr", "gefahren"], correct: 0 },
  { q: "Ich kenne ___ Frau, die dort steht.",
    options: ["die", "der", "das", "den"], correct: 0 },
  { q: "Er hat ___ neuen Computer gekauft.",
    options: ["einen", "ein", "eine", "einem"], correct: 0 },
  { q: "Was bedeutet «Entschuldigung»?",
    options: ["Извините", "Спасибо", "Пожалуйста", "Здравствуйте"], correct: 0 },
  { q: "Was bedeutet «Bahnhof»?",
    options: ["Вокзал", "Аэропорт", "Магазин", "Мост"], correct: 0 },
  { q: "Was bedeutet «teuer»?",
    options: ["Дорогой", "Дешевый", "Тёплый", "Дальний"], correct: 0 },
  { q: "Was bedeutet «verstehen»?",
    options: ["Понимать", "Стоять", "Слышать", "Видеть"], correct: 0 },
  { q: "Was bedeutet «Schlüssel»?",
    options: ["Ключ", "Замок", "Дверь", "Окно"], correct: 0 },
  { q: "Plural von «das Kind» —",
    options: ["die Kinder", "die Kinde", "die Kinds", "die Kindern"], correct: 0 },
  { q: "Plural von «der Mann» —",
    options: ["die Männer", "die Manns", "die Mannen", "die Mans"], correct: 0 },
  { q: "Wie heißt «семь» auf Deutsch?",
    options: ["sieben", "sechs", "neun", "acht"], correct: 0 },
  { q: "Wie heißt «Donnerstag» auf Russisch?",
    options: ["Четверг", "Среда", "Пятница", "Вторник"], correct: 0 },
  { q: "Ich ___ aus Russland.",
    options: ["komme", "kommen", "kommt", "kam"], correct: 0 },
  { q: "Wo ___ du? — In München.",
    options: ["wohnst", "wohnen", "wohne", "wohnt"], correct: 0 },
  { q: "Mein Bruder ist ___ als ich.",
    options: ["älter", "alt", "am ältesten", "alter"], correct: 0 },
  { q: "Das ist das ___ Auto, das ich je gesehen habe.",
    options: ["schönste", "schöner", "schön", "schöneres"], correct: 0 },
  { q: "Ich gehe ins Kino, ___ ich Zeit habe.",
    options: ["wenn", "wann", "ob", "als"], correct: 0 },
  { q: "Er fragt mich, ___ ich morgen komme.",
    options: ["ob", "wenn", "als", "dass"], correct: 0 },
  { q: "___ wem sprichst du?",
    options: ["Mit", "Bei", "Zu", "Von"], correct: 0 },
  { q: "Ich danke dir ___ das Geschenk.",
    options: ["für", "auf", "an", "über"], correct: 0 },
  { q: "Was ist das Gegenteil von «schnell»?",
    options: ["langsam", "leise", "klein", "weit"], correct: 0 },
  { q: "Was ist das Gegenteil von «hell»?",
    options: ["dunkel", "kalt", "schwer", "alt"], correct: 0 },
  { q: "Wähle die richtige Form: «Ich ___ ein Apfel.»",
    options: ["esse", "isst", "essen", "aß"], correct: 0 },
  { q: "Wähle die richtige Form: «Sie ___ Lehrerin.»",
    options: ["ist", "bin", "sind", "seid"], correct: 0 },
  { q: "Was passt? — «Können Sie ___ helfen?»",
    options: ["mir", "mich", "ich", "meiner"], correct: 0 },
  { q: "Ich gehe oft ins Schwimmbad, weil ich gern ___.",
    options: ["schwimme", "schwimmen", "geschwommen", "schwamm"], correct: 0 },
];

// Shuffle option order on the fly so "correct" isn't always first.
export function pickQuestion() {
  const base = questions[Math.floor(Math.random() * questions.length)];
  const indices = [0, 1, 2, 3];
  // Fisher-Yates
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const opts = indices.map(i => base.options[i]);
  const correct = indices.indexOf(base.correct);
  return { q: base.q, options: opts, correct };
}
