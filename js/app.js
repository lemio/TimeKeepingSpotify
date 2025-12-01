/**
 * Main Application Module
 * Coordinates all other modules and handles UI
 */

const App = (function() {
    // DOM Elements
    let loginSection;
    let appSection;
    let loginBtn;
    let logoutBtn;
    let userAvatar;
    let userName;
    let userEmail;
    let currentPlayback;
    let scheduleForm;
    let scheduleTime;
    let scheduleTrack;
    let scheduleVolume;
    let volumeDisplay;
    let scheduleRestore;
    let searchResults;
    let schedulesList;
    let toast;

    // State
    let selectedTrack = null;
    let searchTimeout = null;
    let playbackInterval = null;

    /**
     * Initialize the application
     */
    async function init() {
        // Cache DOM elements
        cacheElements();

        // Attach event listeners
        attachEventListeners();

        // Check for OAuth callback
        const callbackHandled = await SpotifyAuth.handleCallback();

        // Check login status
        if (SpotifyAuth.isLoggedIn()) {
            await showApp();
        } else if (!callbackHandled) {
            showLogin();
        }
    }

    /**
     * Cache DOM elements for later use
     */
    function cacheElements() {
        loginSection = document.getElementById('login-section');
        appSection = document.getElementById('app-section');
        loginBtn = document.getElementById('login-btn');
        logoutBtn = document.getElementById('logout-btn');
        userAvatar = document.getElementById('user-avatar');
        userName = document.getElementById('user-name');
        userEmail = document.getElementById('user-email');
        currentPlayback = document.getElementById('current-playback');
        scheduleForm = document.getElementById('schedule-form');
        scheduleTime = document.getElementById('schedule-time');
        scheduleTrack = document.getElementById('schedule-track');
        scheduleVolume = document.getElementById('schedule-volume');
        volumeDisplay = document.getElementById('volume-display');
        scheduleRestore = document.getElementById('schedule-restore');
        searchResults = document.getElementById('search-results');
        schedulesList = document.getElementById('schedules-list');
        toast = document.getElementById('toast');
    }

    /**
     * Attach event listeners
     */
    function attachEventListeners() {
        // Login button
        loginBtn.addEventListener('click', () => {
            SpotifyAuth.login();
        });

        // Logout button
        logoutBtn.addEventListener('click', handleLogout);

        // Volume slider
        scheduleVolume.addEventListener('input', () => {
            volumeDisplay.textContent = `${scheduleVolume.value}%`;
        });

        // Track search
        scheduleTrack.addEventListener('input', handleTrackSearch);
        scheduleTrack.addEventListener('focus', () => {
            if (searchResults.children.length > 0) {
                searchResults.classList.remove('hidden');
            }
        });

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!scheduleTrack.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('hidden');
            }
        });

        // Schedule form submission
        scheduleForm.addEventListener('submit', handleScheduleSubmit);
    }

    /**
     * Show login section
     */
    function showLogin() {
        loginSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }

    /**
     * Show main app section
     */
    async function showApp() {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');

        try {
            // Load user profile
            const user = await SpotifyAPI.getCurrentUser();
            userName.textContent = user.display_name || 'User';
            userEmail.textContent = user.email || '';
            if (user.images && user.images.length > 0) {
                userAvatar.src = user.images[0].url;
            } else {
                userAvatar.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%231DB954"/><text x="50" y="60" text-anchor="middle" fill="white" font-size="40">👤</text></svg>';
            }

            // Initialize scheduler
            Scheduler.init();

            // Load schedules
            renderSchedules();

            // Start playback monitoring
            startPlaybackMonitoring();

        } catch (error) {
            console.error('Error loading app:', error);
            showToast('Error loading app. Please try logging in again.', true);
        }
    }

    /**
     * Handle logout
     */
    function handleLogout() {
        SpotifyAuth.logout();
        Scheduler.stopChecking();
        if (playbackInterval) {
            clearInterval(playbackInterval);
        }
        showLogin();
        showToast('Logged out successfully');
    }

    /**
     * Handle track search input
     */
    async function handleTrackSearch(e) {
        const query = e.target.value.trim();

        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Check if it's a Spotify URI or URL
        const trackId = SpotifyAPI.extractTrackId(query);
        if (trackId) {
            try {
                const track = await SpotifyAPI.getTrack(trackId);
                selectTrack(track);
                searchResults.classList.add('hidden');
            } catch {
                // Not a valid track, continue with search
            }
            return;
        }

        // Don't search for short queries
        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }

        // Debounce search
        searchTimeout = setTimeout(async () => {
            try {
                const tracks = await SpotifyAPI.searchTracks(query);
                renderSearchResults(tracks);
            } catch (error) {
                console.error('Search error:', error);
            }
        }, 300);
    }

    /**
     * Render search results
     */
    function renderSearchResults(tracks) {
        if (tracks.length === 0) {
            searchResults.classList.add('hidden');
            return;
        }

        searchResults.innerHTML = tracks.map(track => `
            <div class="search-result-item" data-uri="${track.uri}" data-name="${escapeHtml(track.name)}" data-artist="${escapeHtml(track.artists[0]?.name || 'Unknown')}">
                <img src="${track.album.images[2]?.url || track.album.images[0]?.url || ''}" alt="">
                <div class="track-info">
                    <div class="track-name">${escapeHtml(track.name)}</div>
                    <div class="track-artist">${escapeHtml(track.artists.map(a => a.name).join(', '))}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers to results
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const track = {
                    uri: item.dataset.uri,
                    name: item.dataset.name,
                    artists: [{ name: item.dataset.artist }]
                };
                selectTrack(track);
            });
        });

        searchResults.classList.remove('hidden');
    }

    /**
     * Select a track from search results
     */
    function selectTrack(track) {
        selectedTrack = {
            uri: track.uri,
            name: track.name,
            artist: track.artists[0]?.name || 'Unknown'
        };
        scheduleTrack.value = `${track.name} - ${selectedTrack.artist}`;
        searchResults.classList.add('hidden');
    }

    /**
     * Handle schedule form submission
     */
    async function handleScheduleSubmit(e) {
        e.preventDefault();

        if (!selectedTrack) {
            showToast('Please select a track first', true);
            return;
        }

        const time = scheduleTime.value;
        if (!time) {
            showToast('Please set a time', true);
            return;
        }

        const schedule = Scheduler.addSchedule({
            time: time,
            trackUri: selectedTrack.uri,
            trackName: selectedTrack.name,
            artistName: selectedTrack.artist,
            volume: parseInt(scheduleVolume.value),
            restorePlayback: scheduleRestore.checked,
        });

        // Reset form
        scheduleForm.reset();
        volumeDisplay.textContent = '50%';
        selectedTrack = null;

        // Refresh schedule list
        renderSchedules();

        showToast(`Scheduled: ${schedule.trackName} at ${schedule.time}`);
    }

    /**
     * Render the list of schedules
     */
    function renderSchedules() {
        const schedules = Scheduler.getSchedules();

        if (schedules.length === 0) {
            schedulesList.innerHTML = '<p class="text-muted">No scheduled items</p>';
            return;
        }

        // Sort by time
        schedules.sort((a, b) => a.time.localeCompare(b.time));

        schedulesList.innerHTML = schedules.map(schedule => `
            <div class="schedule-item ${schedule.enabled ? '' : 'disabled'}" data-id="${schedule.id}">
                <span class="time">${schedule.time}</span>
                <div class="track-info">
                    <div class="track-name">${escapeHtml(schedule.trackName)}</div>
                    <div class="track-details">
                        ${escapeHtml(schedule.artistName)} · Volume: ${schedule.volume}%
                        ${schedule.restorePlayback ? '<span class="restore-badge">↩ Restore</span>' : ''}
                    </div>
                </div>
                <div class="schedule-actions">
                    <button class="btn btn-secondary btn-small toggle-btn" title="${schedule.enabled ? 'Disable' : 'Enable'}">
                        ${schedule.enabled ? '⏸' : '▶'}
                    </button>
                    <button class="btn btn-secondary btn-small test-btn" title="Test now">
                        🔊
                    </button>
                    <button class="btn btn-danger btn-small delete-btn" title="Delete">
                        ✕
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        schedulesList.querySelectorAll('.schedule-item').forEach(item => {
            const id = item.dataset.id;

            item.querySelector('.toggle-btn').addEventListener('click', () => {
                Scheduler.toggleSchedule(id);
                renderSchedules();
            });

            item.querySelector('.test-btn').addEventListener('click', async () => {
                await Scheduler.triggerNow(id);
            });

            item.querySelector('.delete-btn').addEventListener('click', () => {
                Scheduler.removeSchedule(id);
                renderSchedules();
                showToast('Schedule removed');
            });
        });
    }

    /**
     * Start monitoring current playback
     */
    function startPlaybackMonitoring() {
        updatePlaybackDisplay();
        playbackInterval = setInterval(updatePlaybackDisplay, 5000);
    }

    /**
     * Update current playback display
     */
    async function updatePlaybackDisplay() {
        try {
            const state = await SpotifyAPI.getPlaybackState();

            if (!state || !state.item) {
                currentPlayback.innerHTML = '<p class="text-muted">No active playback</p>';
                return;
            }

            const track = state.item;
            const albumArt = track.album.images[1]?.url || track.album.images[0]?.url || '';

            currentPlayback.innerHTML = `
                <img src="${albumArt}" alt="Album art">
                <div class="now-playing">
                    <div class="now-playing-label">${state.is_playing ? '♫ Now Playing' : '⏸ Paused'}</div>
                    <div class="now-playing-track">${escapeHtml(track.name)}</div>
                    <div class="now-playing-artist">${escapeHtml(track.artists.map(a => a.name).join(', '))}</div>
                </div>
            `;
        } catch (error) {
            console.error('Error updating playback:', error);
        }
    }

    /**
     * Show a toast notification
     */
    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        showToast,
    };
})();
