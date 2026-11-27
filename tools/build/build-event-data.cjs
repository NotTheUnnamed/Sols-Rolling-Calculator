const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'data/events');
const events = fs.readdirSync(directory).filter(file => file.endsWith('.json')).map(file => {
    const event = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    if (!/^[a-zA-Z]+\d{2}$/.test(event.id) || typeof event.label !== 'string' || !event.label.trim()
        || !Number.isInteger(event.order) || !['active', 'ended', 'upcoming'].includes(event.status)
        || typeof event.defaultEnabled !== 'boolean' || !Array.isArray(event.auras)
        || (event.preserveRollDetails !== undefined && typeof event.preserveRollDetails !== 'boolean')
        || !['default', 'valentine', 'april-fools', 'summer', 'halloween', 'winter', 'easter', 'ado'].includes(event.theme)
        || !/^sigil-[\w-]+$/.test(event.sigilClass)
        || (event.status === 'upcoming' && event.defaultEnabled)) throw new Error(`Invalid event metadata: ${file}`);
    if (event.defaultEnabledDates !== undefined) {
        if (!Array.isArray(event.defaultEnabledDates) || !event.defaultEnabledDates.length
            || new Set(event.defaultEnabledDates).size !== event.defaultEnabledDates.length
            || event.defaultEnabledDates.some(date => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
                || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
            || typeof event.defaultTimeZone !== 'string') throw new Error(`Invalid concert dates: ${file}`);
        new Intl.DateTimeFormat('en', { timeZone: event.defaultTimeZone }).format();
    }
    if (event.concertSongs !== undefined && (!Array.isArray(event.concertSongs)
        || !event.concertSongs.length || event.concertSongs.some(song => typeof song?.title !== 'string'
            || !song.title.trim() || !/^[\w-]{11}$/.test(song.videoId) || !/^[\w-]+\.webm$/.test(song.videoFile)
            || !fs.existsSync(path.join(root, 'files/videos/events', event.theme, song.videoFile)))
        || new Set(event.concertSongs.map(song => song.videoId)).size !== event.concertSongs.length)) {
        throw new Error(`Invalid concert songs: ${file}`);
    }
    for (const field of ['biomes', 'auraBiomes', 'additionalAuraNames', 'auraDiscoveryTerms']) {
        if (event[field] !== undefined && (!Array.isArray(event[field]) || event[field].some(value => typeof value !== 'string' || !value.trim()))) throw new Error(`Invalid ${field}: ${file}`);
    }
    const names = new Set();
    for (const aura of event.auras) {
        if (typeof aura.name !== 'string' || !aura.name.trim() || names.has(aura.name)
            || !Number.isFinite(aura.chance) || aura.chance < 1) throw new Error(`Invalid or duplicate aura: ${file}`);
        names.add(aura.name);
    }
    return event;
}).sort((a, b) => a.order - b.order);
if (new Set(events.map(event => event.id)).size !== events.length || new Set(events.map(event => event.order)).size !== events.length) throw new Error('Duplicate event id or order');
const auras = new Map();
for (const event of events) {
    for (const aura of event.auras) {
        if (auras.has(aura.name) && JSON.stringify(auras.get(aura.name)) !== JSON.stringify(aura)) throw new Error(`Conflicting shared event aura: ${aura.name}`);
        auras.set(aura.name, aura);
    }
}
const source = 'globalThis.EventData = Object.freeze(' + JSON.stringify(Object.fromEntries(events.map(event => [event.id, event])), null, 2)
    + ');\nglobalThis.EventAuras = Object.freeze([...new Map(Object.values(EventData).flatMap(event => event.auras).map(aura => [aura.name, aura])).values()]);\n';
fs.mkdirSync(path.join(root, 'scripts/events'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/events/event-data.js'), source);
console.log(`Built ${events.length} events and ${auras.size} event auras.`);
