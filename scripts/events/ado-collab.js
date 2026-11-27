(() => {
    'use strict';

    const backdrop = document.querySelector('.ado-theme-banner__backdrop');
    const artwork = backdrop?.querySelector('img');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    if (artwork) {
        const backdropSpeed = 0.7;
        const counterScroll = 1 - backdropSpeed;
        let pendingFrame = 0;

        const updateBackdrop = () => {
            pendingFrame = 0;
            if (!artwork.naturalWidth || reducedMotion.matches
                || document.body.matches('.reduce-motion, .quality-no-ui-animations')) return;
            const { top, bottom, width, height } = backdrop.getBoundingClientRect();
            if (!height || bottom <= 0 || top >= innerHeight) return;

            // Only the visible part of the card needs overscan as it enters and leaves the viewport.
            const scrollStart = Math.max(0, scrollY + top - innerHeight);
            const topTravel = (scrollY + top - scrollStart) * counterScroll;
            const bottomTravel = Math.max(0, scrollY + bottom - innerHeight - scrollStart) * counterScroll;
            const coverHeight = width * artwork.naturalHeight / artwork.naturalWidth;
            const imageHeight = Math.max(coverHeight, height + Math.max(0, topTravel - bottomTravel));
            const focalPoint = parseFloat(getComputedStyle(backdrop).getPropertyValue('--ado-backdrop-y')) / 100;
            const startingCrop = Math.max(topTravel, (imageHeight - height) * focalPoint);
            const shift = (scrollY - scrollStart) * counterScroll - startingCrop;
            const scale = height / backdrop.clientHeight;
            backdrop.style.setProperty('--ado-backdrop-height', `${(imageHeight / scale).toFixed(2)}px`);
            backdrop.style.setProperty('--ado-backdrop-shift', `${(shift / scale).toFixed(2)}px`);
            backdrop.dataset.parallax = '';
        };
        const requestBackdropUpdate = () => {
            if (!pendingFrame) pendingFrame = requestAnimationFrame(updateBackdrop);
        };
        window.addEventListener('scroll', requestBackdropUpdate, { passive: true });
        window.addEventListener('resize', requestBackdropUpdate);
        window.addEventListener('pageshow', requestBackdropUpdate);
        reducedMotion.addEventListener('change', requestBackdropUpdate);
        artwork.addEventListener('load', requestBackdropUpdate);
        new ResizeObserver(requestBackdropUpdate).observe(backdrop);
        new MutationObserver(requestBackdropUpdate).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        requestBackdropUpdate();
    }

    const decoration = document.getElementById('ado-decoration');
    const link = document.getElementById('ado-collab-link');
    const audio = document.getElementById('ado-collab-sound');
    const status = document.getElementById('ado-collab-status');
    if (!decoration || !link || !audio) return;

    const portraitDock = document.querySelector('.ado-theme-banner__portrait-dock');
    if (portraitDock) {
        const smallScreen = matchMedia('(max-width: 760px)');
        const originalParent = decoration.parentNode;
        const originalNextSibling = decoration.nextSibling;
        const dockPortrait = () => {
            const docked = smallScreen.matches && document.body.classList.contains('theme-event-ado');
            const parent = docked ? portraitDock : originalParent;
            if (decoration.parentNode !== parent) {
                parent.insertBefore(decoration, docked ? null : originalNextSibling);
            }
        };
        smallScreen.addEventListener('change', dockPortrait);
        new MutationObserver(dockPortrait).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        dockPortrait();
    }

    let opening = false;
    let visit = 0;
    let directOpen = false;

    const reset = () => {
        visit++;
        opening = false;
        decoration.classList.remove('ado-decoration--opening');
        link.removeAttribute('aria-busy');
        status.textContent = '';
        audio.pause();
    };
    window.addEventListener('pageshow', reset);
    window.addEventListener('pagehide', reset);

    link.addEventListener('click', async event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (directOpen) return;
        event.preventDefault();
        if (opening) return;
        opening = true;
        const currentVisit = ++visit;
        decoration.classList.add('ado-decoration--opening');
        link.setAttribute('aria-busy', 'true');
        status.textContent = 'Opening the official Ado collaboration website in a new tab…';
        const reduced = reducedMotion.matches
            || document.body.matches('.reduce-motion, .quality-no-ui-animations');
        const animation = new Promise(resolve => setTimeout(resolve, reduced ? 150 : 950));
        const volume = globalThis.AuraAudio?.getVolume('effects') ?? 0.5;
        const sound = volume > 0 ? new Promise(resolve => {
            let timer;
            const finish = () => {
                clearTimeout(timer);
                audio.removeEventListener('ended', finish);
                audio.removeEventListener('error', finish);
                resolve();
            };
            audio.addEventListener('ended', finish, { once: true });
            audio.addEventListener('error', finish, { once: true });
            timer = setTimeout(finish, 2400);
            audio.src ||= audio.dataset.src;
            audio.muted = false;
            audio.volume = Math.min(1, Math.max(0, volume));
            audio.currentTime = 0;
            audio.play().catch(finish);
        }) : Promise.resolve();
        await Promise.all([animation, sound]);
        if (visit !== currentVisit) return;
        const newTab = window.open(link.href, '_blank');
        if (newTab) newTab.opener = null;
        reset();
        if (!newTab) {
            directOpen = true;
            status.textContent = 'Your browser blocked the new tab. Click Meet Ado again to open it.';
        }
    });
})();
