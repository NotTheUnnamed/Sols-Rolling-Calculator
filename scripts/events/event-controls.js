(() => {
    'use strict';
    let configuration;
    const rows = [];
    let groups = [];
    const scheduleDays = new Map();
    const dateFormatters = new Map();
    let scheduleTimer;
    const scheduled = event => Array.isArray(event.defaultEnabledDates);
    const locked = event => !scheduled(event) && event.defaultEnabled && event.status !== 'ended';
    function yearsForEvent(event) {
        const start = event.startsOn?.slice(0, 4) ?? event.label.match(/\d{4}$/)?.[0];
        const end = event.endsOn?.slice(0, 4);
        return [...new Set([start, end].filter(year => /^\d{4}$/.test(year)))];
    }

    function dateKey(event, now = Date.now()) {
        const timeZone = event.defaultTimeZone || 'UTC';
        if (!dateFormatters.has(timeZone)) dateFormatters.set(timeZone,
            new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
        const parts = Object.fromEntries(dateFormatters.get(timeZone).formatToParts(now).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    }
    function defaultEnabled(event, now = Date.now()) {
        if (event.status === 'upcoming') return false;
        return scheduled(event) ? event.status !== 'ended' && event.defaultEnabledDates.includes(dateKey(event, now)) : event.defaultEnabled;
    }
    function refreshSchedule() {
        clearTimeout(scheduleTimer);
        if (!configuration) return;
        for (const event of configuration.events.filter(scheduled)) {
            const day = dateKey(event);
            if (scheduleDays.get(event.id) === day) continue;
            scheduleDays.set(event.id, day);
            // Apply each day's default once; manual choices remain usable that day.
            configuration.onChange(event.id, defaultEnabled(event));
        }
        update();
        scheduleTimer = setTimeout(refreshSchedule, 60000 - Date.now() % 60000 + 20);
    }
    function badgeText(event) {
        if (scheduled(event)) return `${defaultEnabled(event) ? 'Concert day · on by default (CET)' : 'Optional · concert-day defaults (CET)'}${event.auras.length ? '' : ' · Aura details pending'}`;
        return event.status === 'upcoming' ? 'Upcoming' : locked(event) ? 'Live · stays enabled until the event ends' : event.status === 'active' ? 'Live' : 'Historical';
    }
    function update() {
        if (!configuration) return;
        const { events, enabled, summary, reset, status } = configuration;
        const selected = events.filter(event => enabled.has(event.id));
        const optional = selected.filter(event => !locked(event));
        const text = selected.length === 0 ? 'No events enabled' : selected.length === 1 ? selected[0].label : `${selected.length} events enabled`;
        summary.querySelector('[data-event-summary]').textContent = text;
        summary.classList.toggle('form-field__input--placeholder', !selected.length);
        summary.title = selected.map(event => event.label).join(', ') || text;
        reset.hidden = !optional.length;
        reset.disabled = !optional.length;
        reset.textContent = optional.length === 1 ? `Turn off ${optional[0].label}` : 'Reset events';
        reset.title = optional.length === 1 ? `Turn off ${optional[0].label}.` : 'Turn off optional events; live default events stay enabled.';
        status.textContent = `${selected.length} enabled${selected.some(locked) ? ' · Live events stay on until they end.' : ''}`;
        for (const { event, input, row, badge } of rows) {
            input.checked = enabled.has(event.id);
            input.disabled = event.status === 'upcoming' || locked(event);
            row.classList.toggle('interface-select__option--active', input.checked);
            badge.textContent = badgeText(event);
        }
    }
    function initialize({ events, enabled, onChange }) {
        const details = document.getElementById('event-selector');
        const menu = document.getElementById('event-option-list');
        const summary = document.getElementById('event-selector-summary');
        const search = document.getElementById('event-search');
        const panel = document.getElementById('event-picker-panel');
        const reset = document.getElementById('reset-events');
        const status = document.getElementById('event-selection-status');
        if (!details || !menu || configuration) return;
        configuration = { events, enabled, onChange, summary, reset, status };
        const eventYears = new Map(events.map(event => [event.id, yearsForEvent(event)]));
        const years = [...new Set([...eventYears.values()].flat())].sort().reverse();
        groups = years.map(year => {
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'event-picker__year';
            const legend = document.createElement('legend');
            legend.textContent = year;
            fieldset.append(legend);
            const entries = events.filter(event => eventYears.get(event.id).includes(year))
                .sort((a, b) => Number(locked(b)) - Number(locked(a)) || b.order - a.order);
            for (const event of entries) {
                const row = document.createElement('label');
                row.className = 'interface-select__option interface-select__option--checkbox event-picker__option';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.dataset.eventId = event.id;
                input.value = event.id;
                const text = document.createElement('span');
                text.className = 'interface-select__option-label';
                const name = document.createElement('span');
                name.className = event.sigilClass;
                name.textContent = event.label;
                const badge = document.createElement('small');
                badge.id = `event-status-${event.id}-${year}`;
                badge.textContent = badgeText(event);
                input.setAttribute('aria-describedby', badge.id);
                input.setAttribute('aria-label', event.label);
                text.append(name, badge);
                row.append(input, text);
                input.addEventListener('change', () => { onChange(event.id, input.checked); update(); });
                rows.push({ event, input, row, badge, searchText: `${event.label} ${year} ${event.status}`.toLowerCase() });
                fieldset.append(row);
            }
            return fieldset;
        });
        menu.replaceChildren(...groups);
        const close = (focus = false) => {
            details.open = false;
            summary.setAttribute('aria-expanded', 'false');
            if (focus) summary.focus();
        };
        const position = () => {
            if (!details.open) return;
            const bounds = summary.getBoundingClientRect();
            const below = innerHeight - bounds.bottom - 16;
            const above = bounds.top - 16;
            const upwards = below < 240 && above > below;
            details.dataset.eventPlacement = upwards ? 'above' : 'below';
            panel.style.maxHeight = `${Math.max(120, Math.min(460, upwards ? above : below))}px`;
            panel.style.maxWidth = `${Math.max(180, innerWidth - bounds.left - 12)}px`;
        };
        const filter = () => {
            const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
            for (const { row, searchText } of rows) row.hidden = !terms.every(term => searchText.includes(term));
            for (const group of groups) group.hidden = ![...group.querySelectorAll('label')].some(row => !row.hidden);
            document.getElementById('event-no-matches').hidden = groups.some(group => !group.hidden);
        };
        search.addEventListener('input', filter);
        reset.addEventListener('click', () => {
            events.filter(event => enabled.has(event.id) && !locked(event)).forEach(event => onChange(event.id, false));
            update();
            if (reset.hidden || reset.disabled) summary.focus();
        });
        details.addEventListener('toggle', () => {
            summary.setAttribute('aria-expanded', String(details.open));
            if (details.open) { search.value = ''; filter(); position(); }
        });
        window.addEventListener('resize', position, { passive: true });
        document.addEventListener('scroll', event => { if (!panel.contains(event.target)) position(); }, { capture: true, passive: true });
        details.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || (event.target === search && ['Home', 'End'].includes(event.key))) return;
            event.preventDefault();
            details.open = true;
            const available = rows.filter(({ input, row }) => !input.disabled && !row.hidden).map(({ input }) => input);
            if (!available.length) { search.focus(); return; }
            const current = available.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : current < 0 ? (event.key === 'ArrowUp' ? available.length - 1 : 0) : (current + (event.key === 'ArrowUp' ? -1 : 1) + available.length) % available.length;
            available[next].focus();
        });
        details.addEventListener('focusout', event => { if (event.relatedTarget && !details.contains(event.relatedTarget)) close(); });
        if (events.some(scheduled)) {
            refreshSchedule();
            window.addEventListener('focus', refreshSchedule);
            window.addEventListener('pageshow', refreshSchedule);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSchedule(); });
        }
        update();
    }
    globalThis.EventControls = Object.freeze({ initialize, update, locked, defaultEnabled, dateKey, refreshSchedule });
})();
