(() => {
    'use strict';

    const songs = EventData.ado26.concertSongs;
    const video = document.getElementById('ado-concert-player');
    const radio = document.getElementById('ado-radio');
    const inlineMount = document.getElementById('ado-video-mount');
    const backdrop = document.querySelector('.interface-backdrop');
    const backgroundNote = document.getElementById('ado-video-background-note');
    const menu = document.getElementById('ado-video-mode');
    const summary = menu?.querySelector('summary');
    const play = document.getElementById('ado-radio-play');
    const source = document.getElementById('ado-radio-source');
    const songLabel = document.getElementById('ado-radio-song');
    const position = document.getElementById('ado-radio-position');
    const message = document.getElementById('ado-radio-message');
    if (!video || !songs.length) return;

    let state = { active: false, playing: false, volume: 0 };
    let index = 0;
    let loadedIndex = -1;
    let surface = 'miniplayer';
    let pausedByUser = false;
    let playBlocked = false;
    let mediaFailed = false;
    let playAttempt;
    let fullscreenPlayer;
    let playerGain = 1;

    const canPlay = () => state.active && state.playing && state.volume > 0;

    function showMessage(text = '') {
        message.textContent = text;
        message.hidden = !text;
    }

    function updatePlayButton() {
        play.textContent = video.paused || video.ended ? 'Play music' : 'Pause music';
    }

    function loadSong() {
        if (loadedIndex === index) return;
        loadedIndex = index;
        playAttempt = null;
        video.preload = 'metadata';
        video.src = `files/videos/events/ado/${songs[index].videoFile}`;
    }

    function updatePlayback() {
        const volume = state.volume * playerGain;
        video.volume = state.routeVolume?.(video, volume) ?? volume;
        video.muted = volume === 0;
        if (!canPlay() || pausedByUser || mediaFailed) {
            video.pause();
            updatePlayButton();
            return;
        }
        if (playBlocked || playAttempt) return;
        loadSong();
        if (!video.paused) return;
        const attempt = video.play();
        playAttempt = attempt;
        updatePlayButton();
        attempt.catch(error => {
            if (playAttempt === attempt && error.name === 'NotAllowedError') {
                playBlocked = true;
                showMessage('Press Play music to start the video.');
            }
        }).finally(() => {
            if (playAttempt === attempt) playAttempt = null;
            updatePlayButton();
        });
    }

    function showSong() {
        const song = songs[index];
        songLabel.textContent = `${song.title} · Ado`;
        position.textContent = `${index + 1} / ${songs.length}`;
        video.setAttribute('aria-label', `${song.title} by Ado`);
        fullscreenPlayer?.root.setAttribute('aria-label', `${song.title} by Ado`);
        source.href = `https://www.youtube.com/watch?v=${song.videoId}`;
    }

    function nextSong() {
        index = (index + 1) % songs.length;
        playBlocked = false;
        mediaFailed = false;
        showSong();
        showMessage();
        loadSong();
        updatePlayback();
    }

    function moveVideo(mount) {
        const element = fullscreenPlayer?.root || video;
        if (element.parentElement === mount) return;
        if (typeof mount.moveBefore === 'function') mount.moveBefore(element, null);
        else {
            mount.append(element);
            requestAnimationFrame(updatePlayback);
        }
    }

    function showMode() {
        const fullscreen = fullscreenPlayer?.isFullscreen();
        if (!fullscreen) moveVideo(surface === 'background' ? backdrop : inlineMount);
        radio.dataset.videoMode = surface;
        backgroundNote.hidden = surface !== 'background';
        const currentMode = fullscreen ? 'fullscreen' : surface;
        menu.querySelectorAll('[data-ado-video-mode]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.adoVideoMode === currentMode));
        });
    }

    async function enterFullscreen() {
        const createPlayer = globalThis.AuraVideoPlayer?.createManagedPlayer;
        if (!createPlayer) {
            showMessage('The simulator media player could not load.');
            return;
        }
        loadSong();
        if (!fullscreenPlayer) {
            fullscreenPlayer = createPlayer(video, {
                toggle: togglePlayback,
                setGain(gain) {
                    playerGain = gain;
                    updatePlayback();
                },
                onFullscreenChange(fullscreen) {
                    showMode();
                    if (fullscreen) fullscreenPlayer.root.focus({ preventScroll: true });
                    else if (state.active) summary.focus({ preventScroll: true });
                }
            });
            fullscreenPlayer.root.classList.add('ado-fullscreen-player');
        }
        moveVideo(document.body);
        await fullscreenPlayer.toggleFullscreen();
        showMode();
    }

    function togglePlayback() {
        if (!video.paused && !video.ended) {
            pausedByUser = true;
            updatePlayback();
            return;
        }
        pausedByUser = false;
        playBlocked = false;
        if (mediaFailed) loadedIndex = -1;
        mediaFailed = false;
        showMessage();
        beginSimulationExperience();
        if (state.volume === 0) {
            showMessage('Turn up or unmute Background Music to play Ado.');
            return;
        }
        updatePlayback();
    }
    play.addEventListener('click', togglePlayback);
    document.getElementById('ado-radio-next').addEventListener('click', nextSong);
    video.addEventListener('ended', () => { if (state.active) nextSong(); });
    video.addEventListener('playing', () => {
        if (!canPlay()) video.pause();
        else {
            pausedByUser = false;
            showMessage();
        }
        updatePlayButton();
    });
    video.addEventListener('pause', updatePlayButton);
    video.addEventListener('error', () => {
        mediaFailed = true;
        updatePlayButton();
        showMessage('This video could not load. Try Play music, Next song, or the YouTube link.');
    });

    menu.addEventListener('click', event => {
        const option = event.target.closest('[data-ado-video-mode]');
        if (!option) return;
        menu.open = false;
        summary.focus();
        const mode = option.dataset.adoVideoMode;
        if (mode === 'fullscreen') {
            void enterFullscreen();
            return;
        }
        surface = mode;
        if (surface === 'background') loadSong();
        showMessage();
        showMode();
        updatePlayback();
    });
    menu.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu.open) return;
        event.stopPropagation();
        menu.open = false;
        summary.focus();
    });
    document.addEventListener('click', event => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
    });

    globalThis.AdoConcertMusic = Object.freeze({
        sync(options) {
            const wasActive = state.active;
            state = options;
            if (wasActive && !state.active) {
                menu.open = false;
                surface = 'miniplayer';
                if (fullscreenPlayer?.isFullscreen()) void fullscreenPlayer.toggleFullscreen();
                showMode();
            }
            updatePlayback();
        }
    });
    showSong();
})();
