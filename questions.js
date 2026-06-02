export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2'];

export const LEXICAL_TOPICS = [
    'Familie',
    'Freundschaft',
    'Wohnen',
    'Hausarbeit',
    'Schule',
    'Universität',
    'Arbeit',
    'Bewerbung',
    'Reisen',
    'Hotel',
    'Stadt',
    'Landleben',
    'Essen und Trinken',
    'Restaurant',
    'Einkaufen',
    'Kleidung',
    'Gesundheit',
    'Körper',
    'Sport',
    'Freizeit',
    'Musik',
    'Filme und Serien',
    'Natur',
    'Umwelt',
    'Verkehr',
    'Technik',
    'Internet',
    'Bücher',
    'Wetter',
    'Feiertage',
    'Notfälle',
    'Berge',
    'Camping',
    'Tiere',
    'Kunst',
    'Medien',
    'Politik',
    'Alltag',
    'Zeitmanagement',
    'Büroarbeit',
    'Kundenservice',
    'Studium im Ausland',
    'Migration',
    'Wohnungssuche',
    'Finanzen',
    'Termine',
    'Kommunikation',
    'Gefühle',
    'Urlaub am Meer',
    'Winterurlaub'
];

export const GRAMMAR_TOPICS = [
    'Präsens',
    'Perfekt',
    'Präteritum',
    'Futur I',
    'Imperativ',
    'Modalverben',
    'Trennbare Verben',
    'Untrennbare Verben',
    'Reflexive Verben',
    'Verben mit Präpositionen',
    'Lassen',
    'Werden',
    'Sein vs. haben',
    'Nominativ',
    'Akkusativ',
    'Dativ',
    'Genitiv',
    'Artikel',
    'Possessivartikel',
    'Pronomen',
    'Personalpronomen',
    'Relativpronomen',
    'Fragewörter',
    'Negation',
    'Adjektivdeklination',
    'Komparativ',
    'Superlativ',
    'Zahlen und Datum',
    'Temporale Präpositionen',
    'Lokale Präpositionen',
    'Wechselpräpositionen',
    'Präpositionen mit Dativ',
    'Präpositionen mit Akkusativ',
    'Satzklammer',
    'Wortstellung im Hauptsatz',
    'Wortstellung im Nebensatz',
    'weil-Sätze',
    'dass-Sätze',
    'wenn-Sätze',
    'obwohl-Sätze',
    'damit-Sätze',
    'Relativsätze',
    'Indirekte Fragen',
    'Infinitiv mit zu',
    'Konjunktiv II',
    'Passiv',
    'Plusquamperfekt',
    'Doppelkonjunktionen',
    'als vs. wenn',
    'Partizip I und II',
    'Genitivpräpositionen'
];

const LEVEL_RANK = { A1: 1, A2: 2, B1: 3, B2: 4 };

const QUESTION_POOL = [
    {
        level: 'A1',
        topic: 'Artikel',
        text: 'Выбери правильный артикль.',
        display: '___ Zug kommt um acht Uhr.',
        options: ['Der', 'Die', 'Das', 'Den'],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Praesens',
        text: 'Выбери правильную форму глагола.',
        display: 'Maria ___ jeden Morgen Kaffee.',
        options: ['trinkt', 'trinken', 'trinke', 'trinkst'],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Akkusativ',
        text: 'Выбери форму в Akkusativ.',
        display: 'Ich sehe ___ Hund im Park.',
        options: ['den', 'der', 'dem', 'das'],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Wortstellung',
        text: 'Выбери правильный порядок слов.',
        display: 'morgen / ich / fahre / nach Berlin',
        options: [
            'Morgen fahre ich nach Berlin.',
            'Morgen ich fahre nach Berlin.',
            'Ich nach Berlin fahre morgen.',
            'Fahre ich morgen nach Berlin.'
        ],
        correct: 0
    },
    {
        level: 'A1',
        topic: 'Negation',
        text: 'Выбери правильное отрицание.',
        display: 'Wir haben ___ Zeit.',
        options: ['keine', 'nicht', 'kein', 'keinen'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Perfekt',
        text: 'Выбери правильную форму Perfekt.',
        display: 'Gestern ___ wir ins Museum gegangen.',
        options: ['sind', 'haben', 'sein', 'hat'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Dativ',
        text: 'Выбери форму в Dativ.',
        display: 'Ich helfe ___ neuen Nachbarin.',
        options: ['der', 'die', 'den', 'dem'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Modalverben',
        text: 'Выбери правильную конструкцию.',
        display: 'Am Abend ___ Lukas noch lernen.',
        options: ['muss', 'musst', 'mussen', 'muesst'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Wechselpraepositionen',
        text: 'Выбери правильный падеж.',
        display: 'Das Buch liegt auf ___ Tisch.',
        options: ['dem', 'den', 'der', 'das'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Trennbare Verben',
        text: 'Выбери правильный вариант.',
        display: 'Der Zug ___ um 9 Uhr ___.',
        options: ['kommt ... an', 'ankommt ...', 'kommt ... auf', 'kommt ... mit'],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Nebensatz',
        text: 'Выбери правильный порядок слов.',
        display: 'Ich bleibe zu Hause, weil ...',
        options: [
            'ich krank bin.',
            'ich bin krank.',
            'bin ich krank.',
            'krank ich bin.'
        ],
        correct: 0
    },
    {
        level: 'A2',
        topic: 'Adjektivdeklination',
        text: 'Выбери правильное окончание.',
        display: 'Das ist ein ___ Platz.',
        options: ['ruhiger', 'ruhige', 'ruhigen', 'ruhiges'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Konjunktiv II',
        text: 'Выбери вежливую форму.',
        display: '___ Sie mir bitte helfen?',
        options: ['Koennten', 'Koennen', 'Konnten', 'Kann'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Infinitiv mit zu',
        text: 'Выбери правильную конструкцию.',
        display: 'Anna versucht, den Text ___ verstehen.',
        options: ['zu', 'zum', 'um zu', ''],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Passiv',
        text: 'Выбери правильную форму Passiv.',
        display: 'Die Tuer ___ jeden Abend geschlossen.',
        options: ['wird', 'ist', 'hat', 'werden'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Relativsatz',
        text: 'Выбери правильное относительное местоимение.',
        display: 'Das ist der Mann, ___ ich gestern geholfen habe.',
        options: ['dem', 'den', 'der', 'dessen'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Praeteritum',
        text: 'Выбери правильную форму Praeteritum.',
        display: 'Als Kind ___ sie oft am Meer.',
        options: ['war', 'ist', 'sein', 'waere'],
        correct: 0
    },
    {
        level: 'B1',
        topic: 'Doppelkonjunktionen',
        text: 'Выбери правильную пару.',
        display: '___ der Film war spannend, ___ die Musik war gut.',
        options: ['Nicht nur ... sondern auch', 'Entweder ... aber', 'Sowohl ... oder', 'Je ... sondern'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Genitiv',
        text: 'Выбери форму Genitiv.',
        display: 'Waehrend ___ Treffens blieb das Handy aus.',
        options: ['des', 'dem', 'den', 'der'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Plusquamperfekt',
        text: 'Выбери правильную форму.',
        display: 'Nachdem er gegessen ___, ging er los.',
        options: ['hatte', 'hat', 'war', 'wurde'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Indirekte Frage',
        text: 'Выбери правильный порядок слов.',
        display: 'Kannst du mir sagen, ...',
        options: [
            'wann der Kurs beginnt?',
            'wann beginnt der Kurs?',
            'wann der Kurs beginnt.',
            'wann beginnt Kurs der?'
        ],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Konnektoren',
        text: 'Выбери подходящий союз.',
        display: '___ es stark regnet, gehen wir spazieren.',
        options: ['Obwohl', 'Weil', 'Damit', 'Sobald'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Nominalisierung',
        text: 'Выбери правильный вариант.',
        display: 'Nach ___ der Aufgabe durfte die Gruppe gehen.',
        options: ['der Loesung', 'die Loesung', 'dem Loesen', 'das Loesen'],
        correct: 0
    },
    {
        level: 'B2',
        topic: 'Wortstellung',
        text: 'Выбери грамматически правильное предложение.',
        display: 'trotzdem / kommt / er / puenktlich',
        options: [
            'Trotzdem kommt er puenktlich.',
            'Trotzdem er kommt puenktlich.',
            'Er puenktlich kommt trotzdem.',
            'Kommt trotzdem er puenktlich.'
        ],
        correct: 0
    }
];

const AUDIO_QUESTION_POOL = [
    {
        level: 'A1',
        audioText: 'Ich kaufe heute Brot und K\u00e4se.',
        options: [
            '\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u044f \u043f\u043e\u043a\u0443\u043f\u0430\u044e \u0445\u043b\u0435\u0431 \u0438 \u0441\u044b\u0440.',
            '\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u044f \u043f\u0440\u043e\u0434\u0430\u044e \u0445\u043b\u0435\u0431 \u0438 \u0441\u044b\u0440.',
            '\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u044f \u043f\u043e\u043a\u0443\u043f\u0430\u044e \u0431\u0443\u043b\u043e\u0447\u043a\u0438 \u0438 \u0441\u044b\u0440.',
            '\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u044f \u043f\u043e\u043a\u0443\u043f\u0430\u044e \u0445\u043b\u0435\u0431 \u0438 \u043a\u043e\u043b\u0431\u0430\u0441\u0443.'
        ],
        correct: 0
    },
    {
        level: 'A1',
        audioText: 'Der Zug kommt um acht Uhr an.',
        options: [
            '\u041f\u043e\u0435\u0437\u0434 \u043f\u0440\u0438\u0431\u044b\u0432\u0430\u0435\u0442 \u0432 \u0432\u043e\u0441\u0435\u043c\u044c \u0447\u0430\u0441\u043e\u0432.',
            '\u041f\u043e\u0435\u0437\u0434 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u0432 \u0432\u043e\u0441\u0435\u043c\u044c \u0447\u0430\u0441\u043e\u0432.',
            '\u041f\u043e\u0435\u0437\u0434 \u043f\u0440\u0438\u0431\u044b\u0432\u0430\u0435\u0442 \u043d\u0430 \u0432\u043e\u0441\u044c\u043c\u043e\u0439 \u043f\u0443\u0442\u044c.',
            '\u041d\u0430 \u043f\u043e\u0435\u0437\u0434 \u043d\u0443\u0436\u043d\u043e \u043f\u0435\u0440\u0435\u0441\u0435\u0441\u0442\u044c \u0432 \u0432\u043e\u0441\u0435\u043c\u044c \u0447\u0430\u0441\u043e\u0432.'
        ],
        correct: 0
    },
    {
        level: 'A2',
        audioText: 'Wir m\u00fcssen morgen fr\u00fch zum Arzt gehen.',
        options: [
            '\u0417\u0430\u0432\u0442\u0440\u0430 \u0440\u0430\u043d\u043e \u043c\u044b \u0434\u043e\u043b\u0436\u043d\u044b \u043f\u043e\u0439\u0442\u0438 \u043a \u0432\u0440\u0430\u0447\u0443.',
            '\u0417\u0430\u0432\u0442\u0440\u0430 \u0440\u0430\u043d\u043e \u043c\u044b \u0445\u043e\u0442\u0438\u043c \u043f\u043e\u0439\u0442\u0438 \u043a \u0432\u0440\u0430\u0447\u0443.',
            '\u0417\u0430\u0432\u0442\u0440\u0430 \u0440\u0430\u043d\u043e \u043c\u044b \u0434\u043e\u043b\u0436\u043d\u044b \u043f\u043e\u0439\u0442\u0438 \u0432 \u0430\u043f\u0442\u0435\u043a\u0443.',
            '\u0417\u0430\u0432\u0442\u0440\u0430 \u0440\u0430\u043d\u043e \u043d\u0430\u043c \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u043e \u043f\u043e\u0439\u0442\u0438 \u043a \u0432\u0440\u0430\u0447\u0443.'
        ],
        correct: 0
    },
    {
        level: 'A2',
        audioText: 'Sie hat den Schl\u00fcssel auf dem Tisch gelassen.',
        options: [
            '\u041e\u043d\u0430 \u043e\u0441\u0442\u0430\u0432\u0438\u043b\u0430 \u043a\u043b\u044e\u0447 \u043d\u0430 \u0441\u0442\u043e\u043b\u0435.',
            '\u041e\u043d\u0430 \u043f\u043e\u043b\u043e\u0436\u0438\u043b\u0430 \u043a\u043b\u044e\u0447 \u043d\u0430 \u0441\u0442\u0443\u043b.',
            '\u041e\u043d\u0430 \u043e\u0441\u0442\u0430\u0432\u0438\u043b\u0430 \u043a\u043b\u044e\u0447 \u0432 \u0441\u0442\u043e\u043b\u0435.',
            '\u041e\u043d\u0430 \u0437\u0430\u0431\u044b\u043b\u0430 \u0437\u0430\u043c\u043e\u043a \u043d\u0430 \u0441\u0442\u043e\u043b\u0435.'
        ],
        correct: 0
    },
    {
        level: 'B1',
        audioText: 'Obwohl es regnet, gehen die Kinder nach drau\u00dfen.',
        options: [
            '\u0425\u043e\u0442\u044f \u0438\u0434\u0435\u0442 \u0434\u043e\u0436\u0434\u044c, \u0434\u0435\u0442\u0438 \u0432\u044b\u0445\u043e\u0434\u044f\u0442 \u043d\u0430 \u0443\u043b\u0438\u0446\u0443.',
            '\u041f\u043e\u043a\u0430 \u0438\u0434\u0435\u0442 \u0434\u043e\u0436\u0434\u044c, \u0434\u0435\u0442\u0438 \u0432\u044b\u0445\u043e\u0434\u044f\u0442 \u043d\u0430 \u0443\u043b\u0438\u0446\u0443.',
            '\u041f\u043e\u0442\u043e\u043c\u0443 \u0447\u0442\u043e \u0438\u0434\u0435\u0442 \u0434\u043e\u0436\u0434\u044c, \u0434\u0435\u0442\u0438 \u0432\u044b\u0445\u043e\u0434\u044f\u0442 \u043d\u0430 \u0443\u043b\u0438\u0446\u0443.',
            '\u0425\u043e\u0442\u044f \u0438\u0434\u0435\u0442 \u0434\u043e\u0436\u0434\u044c, \u0434\u0435\u0442\u0438 \u0438\u0434\u0443\u0442 \u0432\u043d\u0443\u0442\u0440\u044c.'
        ],
        correct: 0
    },
    {
        level: 'B2',
        audioText: 'Je l\u00e4nger wir warten, desto schwieriger wird die Entscheidung.',
        options: [
            '\u0427\u0435\u043c \u0434\u043e\u043b\u044c\u0448\u0435 \u043c\u044b \u0436\u0434\u0435\u043c, \u0442\u0435\u043c \u0442\u0440\u0443\u0434\u043d\u0435\u0435 \u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u0440\u0435\u0448\u0435\u043d\u0438\u0435.',
            '\u0427\u0435\u043c \u0434\u043e\u043b\u044c\u0448\u0435 \u043c\u044b \u0436\u0434\u0435\u043c, \u0442\u0435\u043c \u0442\u0440\u0443\u0434\u043d\u0435\u0435 \u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u043e\u0431\u0441\u0443\u0436\u0434\u0435\u043d\u0438\u0435.',
            '\u0427\u0435\u043c \u0434\u043e\u043b\u044c\u0448\u0435 \u043c\u044b \u0441\u043e\u0432\u0435\u0442\u0443\u0435\u043c\u0441\u044f, \u0442\u0435\u043c \u0442\u0440\u0443\u0434\u043d\u0435\u0435 \u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u0440\u0435\u0448\u0435\u043d\u0438\u0435.',
            '\u0427\u0435\u043c \u0434\u043e\u043b\u044c\u0448\u0435 \u043c\u044b \u0436\u0434\u0435\u043c, \u0442\u0435\u043c \u043d\u0430\u0434\u0435\u0436\u043d\u0435\u0435 \u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u0440\u0435\u0448\u0435\u043d\u0438\u0435.'
        ],
        correct: 0
    }
];

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export class QuestionBank {
    constructor() {
        this.mode = 'grammar';
        this.level = 'A2';
        this.lexicalTopic = LEXICAL_TOPICS[0];
        this.fallbackCursor = 0;
        this.audioFallbackCursor = 0;
        this.grammarCursor = 0;
        this.selectedSlots = [];
        this.fallbackPool = shuffle(QUESTION_POOL);
        this.audioFallbackPool = shuffle(AUDIO_QUESTION_POOL);
        this.questionPool = Object.create(null);
        this.fetching = Object.create(null);
        this.usedDisplays = Object.create(null);
        this.poolSignature = '';
    }

    configure(settings = {}) {
        const nextMode = settings.questionMode === 'audio' ? 'audio' : 'grammar';
        const nextLevel = settings.langLevel || this.level;
        const nextLexicalTopic = settings.lexicalTopic || this.lexicalTopic;
        const nextSlots = (settings.grammarSlots || [])
            .filter((slot) => slot && slot.grammarTopic)
            .map((slot) => ({
                bridgeIndex: Number.isInteger(slot.bridgeIndex) ? slot.bridgeIndex : null,
                grammarTopic: slot.grammarTopic,
                isWortstellung: Boolean(slot.isWortstellung)
            }));
        const nextSignature = JSON.stringify({
            mode: nextMode,
            level: nextLevel,
            lexicalTopic: nextLexicalTopic,
            slots: nextSlots
        });
        const samePoolConfig = nextSignature === this.poolSignature;

        this.mode = nextMode;
        this.level = nextLevel;
        this.lexicalTopic = nextLexicalTopic;
        this.grammarCursor = 0;
        this.selectedSlots = nextSlots;
        this.poolSignature = nextSignature;

        if (!samePoolConfig) {
            this.fallbackCursor = 0;
            this.audioFallbackCursor = 0;
            this.fallbackPool = shuffle(QUESTION_POOL);
            this.audioFallbackPool = shuffle(AUDIO_QUESTION_POOL);
        }
    }

    hasBridgePool(bridgeIndex) {
        if (this.mode === 'audio') {
            const pool = this.questionPool[this._audioKey()];
            return Boolean(pool && pool.length > 0);
        }
        const slot = this.slotForBridge(bridgeIndex);
        if (!slot) return false;
        const pool = this.questionPool[this._slotKey(slot)];
        return Boolean(pool && pool.length > 0);
    }

    slotForBridge(bridgeIndex) {
        const slots = this._slotCycle();
        const direct = slots.find((slot) => slot.bridgeIndex === bridgeIndex);
        return direct || slots[bridgeIndex % slots.length] || slots[0];
    }

    async nextQuestion(slotOverride = null) {
        if (this.mode === 'audio') return this._nextAudioQuestion();

        const slot = slotOverride && slotOverride.grammarTopic ? slotOverride : this._nextGrammarSlot();
        try {
            const question = await this._getGeneratedQuestion(slot);
            if (question) return question;
        } catch (error) {
            console.warn('AI question generation fallback:', error);
        }

        return this._fallbackQuestion(slot);
    }

    async _nextAudioQuestion() {
        try {
            const question = await this._getGeneratedAudioQuestion();
            if (question) return question;
        } catch (error) {
            console.warn('AI audio question generation fallback:', error);
        }

        return this._fallbackAudioQuestion();
    }

    async _getGeneratedQuestion(slot) {
        const key = this._slotKey(slot);
        const pool = await this._ensurePool(slot);
        if (!pool || pool.length === 0) return null;

        const raw = pool.shift();
        const formatted = this._formatQuestion(raw, slot);
        const used = this.usedDisplays[key] || new Set();
        used.add(raw.display);
        this.usedDisplays[key] = used;
        return formatted;
    }

    async _getGeneratedAudioQuestion() {
        const key = this._audioKey();
        const pool = await this._ensureAudioPool();
        if (!pool || pool.length === 0) return null;

        const raw = pool.shift();
        const formatted = this._formatAudioQuestion(raw, true, key);
        const used = this.usedDisplays[key] || new Set();
        used.add(raw.audioText);
        this.usedDisplays[key] = used;
        return formatted;
    }

    returnQuestion(question) {
        if (!question || !question.generated || !question._poolKey || !question._rawQuestion) return;
        const pool = this.questionPool[question._poolKey] || [];
        const display = question._rawQuestion.audioText || question._rawQuestion.display;
        if (!pool.some((item) => item && (item.audioText || item.display) === display)) {
            pool.push(question._rawQuestion);
        }
        this.questionPool[question._poolKey] = pool;

        const used = this.usedDisplays[question._poolKey];
        if (used) used.delete(display);
    }

    async _ensurePool(slot) {
        const key = this._slotKey(slot);
        const pool = this.questionPool[key];
        if (pool && pool.length > 0) {
            return pool;
        }

        if (this.fetching[key]) {
            return this.fetching[key];
        }

        this.fetching[key] = this._fetchQuestions(slot)
            .catch((error) => {
                console.warn(`Не удалось загрузить вопросы для темы ${slot.grammarTopic}:`, error);
                return [];
            })
            .then((result) => {
                delete this.fetching[key];
                return result;
            }, (error) => {
                delete this.fetching[key];
                throw error;
            });

        return this.fetching[key];
    }

    async _ensureAudioPool() {
        const key = this._audioKey();
        const pool = this.questionPool[key];
        if (pool && pool.length > 0) return pool;
        if (this.fetching[key]) return this.fetching[key];

        this.fetching[key] = this._fetchAudioQuestions()
            .catch((error) => {
                console.warn('Failed to load audio questions:', error);
                return [];
            })
            .then((result) => {
                delete this.fetching[key];
                return result;
            }, (error) => {
                delete this.fetching[key];
                throw error;
            });

        return this.fetching[key];
    }

    async _fetchQuestions(slot) {
        const key = this._slotKey(slot);
        const seen = Array.from(this.usedDisplays[key] || []).slice(-12);
        const response = await fetch('/api/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: this.level,
                lexicalTopic: this.lexicalTopic,
                grammarTopic: slot.grammarTopic,
                isWortstellung: slot.isWortstellung,
                count: 10,
                exclude: seen
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const valid = (data.questions || []).filter((question) => this._isValidQuestion(question));
        if (!valid.length) return [];

        const pool = [...(this.questionPool[key] || []), ...shuffle(valid)];
        this.questionPool[key] = pool;
        return pool;
    }

    async _fetchAudioQuestions() {
        const key = this._audioKey();
        const seen = Array.from(this.usedDisplays[key] || []).slice(-12);
        const response = await fetch('/api/generate-audio-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: this.level,
                lexicalTopic: this.lexicalTopic,
                count: 10,
                exclude: seen
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const valid = (data.questions || []).filter((question) => this._isValidAudioQuestion(question));
        if (!valid.length) return [];

        const pool = [...(this.questionPool[key] || []), ...shuffle(valid)];
        this.questionPool[key] = pool;
        return pool;
    }

    _formatQuestion(rawQuestion, slot) {
        const correctAnswer = rawQuestion.options[rawQuestion.correct];
        const options = shuffle(rawQuestion.options);

        return {
            level: this.level,
            topic: slot.isWortstellung ? `Wortstellung + ${slot.grammarTopic}` : slot.grammarTopic,
            text: rawQuestion.text,
            display: rawQuestion.display,
            lexicalTopic: this.lexicalTopic,
            options,
            correctIndex: options.indexOf(correctAnswer),
            generated: true,
            _poolKey: this._slotKey(slot),
            _rawQuestion: rawQuestion
        };
    }

    _formatAudioQuestion(rawQuestion, generated = false, poolKey = '') {
        const correctAnswer = rawQuestion.options[rawQuestion.correct];
        const options = shuffle(rawQuestion.options);

        return {
            level: rawQuestion.level || this.level,
            topic: 'Audio',
            text: '\u041f\u0440\u043e\u0441\u043b\u0443\u0448\u0430\u0439 \u043d\u0435\u043c\u0435\u0446\u043a\u0443\u044e \u0444\u0440\u0430\u0437\u0443 \u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0442\u043e\u0447\u043d\u044b\u0439 \u043f\u0435\u0440\u0435\u0432\u043e\u0434.',
            display: '\u041d\u0435\u043c\u0435\u0446\u043a\u0430\u044f \u0444\u0440\u0430\u0437\u0430 \u0437\u0432\u0443\u0447\u0438\u0442 \u0432\u0441\u043b\u0443\u0445.',
            lexicalTopic: this.lexicalTopic,
            audioText: rawQuestion.audioText,
            options,
            correctIndex: options.indexOf(correctAnswer),
            generated,
            _poolKey: generated ? poolKey : '',
            _rawQuestion: generated ? rawQuestion : null
        };
    }

    _fallbackQuestion(slot) {
        const maxRank = LEVEL_RANK[this.level] || LEVEL_RANK.A2;
        const candidates = this.fallbackPool.filter((question) => LEVEL_RANK[question.level] <= maxRank);
        const source = candidates.length ? candidates : this.fallbackPool;
        const raw = source[this.fallbackCursor % source.length];
        this.fallbackCursor += 1;

        const correctAnswer = raw.options[raw.correct];
        const options = shuffle(raw.options);
        return {
            level: raw.level,
            topic: slot ? (slot.isWortstellung ? `Wortstellung + ${slot.grammarTopic}` : slot.grammarTopic) : raw.topic,
            text: raw.text,
            display: raw.display,
            lexicalTopic: this.lexicalTopic,
            options,
            correctIndex: options.indexOf(correctAnswer),
            generated: false
        };
    }

    _fallbackAudioQuestion() {
        const maxRank = LEVEL_RANK[this.level] || LEVEL_RANK.A2;
        const candidates = this.audioFallbackPool.filter((question) => LEVEL_RANK[question.level] <= maxRank);
        const source = candidates.length ? candidates : this.audioFallbackPool;
        const raw = source[this.audioFallbackCursor % source.length];
        this.audioFallbackCursor += 1;
        return this._formatAudioQuestion(raw);
    }

    _nextGrammarSlot() {
        const slots = this._slotCycle();
        const slot = slots[this.grammarCursor % slots.length];
        this.grammarCursor += 1;
        return slot;
    }

    _slotCycle() {
        if (this.selectedSlots.length > 0) {
            return this.selectedSlots;
        }

        const maxRank = LEVEL_RANK[this.level] || LEVEL_RANK.A2;
        if (maxRank <= LEVEL_RANK.A1) {
            return ['Präsens', 'Artikel', 'Nominativ', 'Akkusativ', 'Personalpronomen', 'Negation', 'Fragewörter', 'Wortstellung im Hauptsatz'].map((grammarTopic) => ({
                grammarTopic,
                isWortstellung: grammarTopic.includes('Wortstellung')
            }));
        }
        if (maxRank <= LEVEL_RANK.A2) {
            return ['Perfekt', 'Dativ', 'Modalverben', 'Wechselpräpositionen', 'Trennbare Verben', 'Possessivartikel', 'Adjektivdeklination', 'weil-Sätze'].map((grammarTopic) => ({
                grammarTopic,
                isWortstellung: grammarTopic.includes('Wortstellung')
            }));
        }
        if (maxRank <= LEVEL_RANK.B1) {
            return ['Präteritum', 'Futur I', 'Reflexive Verben', 'Verben mit Präpositionen', 'Relativsätze', 'Indirekte Fragen', 'Infinitiv mit zu', 'Passiv'].map((grammarTopic) => ({
                grammarTopic,
                isWortstellung: grammarTopic.includes('Wortstellung')
            }));
        }
        return ['Genitiv', 'Plusquamperfekt', 'Konjunktiv II', 'Passiv', 'Partizip I und II', 'Doppelkonjunktionen', 'Genitivpräpositionen', 'Wortstellung im Nebensatz'].map((grammarTopic) => ({
            grammarTopic,
            isWortstellung: grammarTopic.includes('Wortstellung')
        }));
    }

    _slotKey(slot) {
        const bridge = Number.isInteger(slot.bridgeIndex) ? slot.bridgeIndex : 'cycle';
        return `${this.poolSignature}:${bridge}:${slot.grammarTopic}:${slot.isWortstellung ? 'w' : 'g'}`;
    }

    _audioKey() {
        return `${this.poolSignature}:audio:${this.level}:${this.lexicalTopic}`;
    }

    _isValidQuestion(question) {
        return Boolean(
            question &&
            typeof question.text === 'string' &&
            typeof question.display === 'string' &&
            Array.isArray(question.options) &&
            question.options.length === 4 &&
            typeof question.correct === 'number' &&
            question.correct >= 0 &&
            question.correct <= 3
        );
    }

    _isValidAudioQuestion(question) {
        return this._isValidQuestion(question) && typeof question.audioText === 'string' && question.audioText.length > 0;
    }
}

export const questions = QUESTION_POOL.map((question) => ({
    q: `${question.text} ${question.display}`.trim(),
    options: question.options,
    correct: question.correct
}));

// Compatibility wrapper for the original Nad Gorizontom quiz flow.
export function pickQuestion() {
    const base = QUESTION_POOL[Math.floor(Math.random() * QUESTION_POOL.length)];
    const correctAnswer = base.options[base.correct];
    const options = shuffle(base.options);

    return {
        q: `${base.text} ${base.display}`.trim(),
        options,
        correct: options.indexOf(correctAnswer)
    };
}
