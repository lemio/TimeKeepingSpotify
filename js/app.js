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
    let playbackDuration;
    let playbackDurationNumber;
    let playbackDurationDisplay;
    let trackDurationInfo;
    let trackDurationDisplay;

    // State
    let selectedTrack = null;
    let searchTimeout = null;
    let playbackInterval = null;
    let countdownInterval = null;

    // Default avatar for users without a profile image
    const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="50" fill="#1DB954"/>' +
        '<text x="50" y="60" text-anchor="middle" fill="white" font-size="40">👤</text>' +
        '</svg>'
    );

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
        playbackDuration = document.getElementById('playback-duration');
        playbackDurationNumber = document.getElementById('playback-duration-number');
        playbackDurationDisplay = document.getElementById('playback-duration-display');
        trackDurationInfo = document.getElementById('track-duration-info');
        trackDurationDisplay = document.getElementById('track-duration-display');
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

        // Playback duration slider and number input
        playbackDuration.addEventListener('input', () => {
            const seconds = parseInt(playbackDuration.value);
            playbackDurationNumber.value = seconds;
            updatePlaybackDurationDisplay(seconds);
        });

        playbackDurationNumber.addEventListener('input', () => {
            const seconds = Math.max(0, parseInt(playbackDurationNumber.value) || 0);
            const maxSeconds = parseInt(playbackDuration.max);
            const clampedSeconds = Math.min(seconds, maxSeconds);
            playbackDuration.value = clampedSeconds;
            playbackDurationNumber.value = clampedSeconds;
            updatePlaybackDurationDisplay(clampedSeconds);
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
                userAvatar.src = DEFAULT_AVATAR;
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
        if (countdownInterval) {
            clearInterval(countdownInterval);
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
            <div class="search-result-item" data-uri="${track.uri}" data-name="${escapeHtml(track.name)}" data-artist="${escapeHtml(track.artists[0]?.name || 'Unknown')}" data-duration="${track.duration_ms || 0}">
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
                    artists: [{ name: item.dataset.artist }],
                    duration_ms: parseInt(item.dataset.duration)
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
            artist: track.artists[0]?.name || 'Unknown',
            duration_ms: track.duration_ms
        };
        scheduleTrack.value = `${track.name} - ${selectedTrack.artist}`;
        searchResults.classList.add('hidden');
        
        // Update track duration display
        if (track.duration_ms) {
            const durationSeconds = Math.floor(track.duration_ms / 1000);
            trackDurationDisplay.textContent = formatTime(durationSeconds);
            trackDurationInfo.classList.remove('hidden');
            
            // Update playback duration slider max
            playbackDuration.max = durationSeconds;
            playbackDurationNumber.max = durationSeconds;
            
            // Set to full track by default
            playbackDuration.value = durationSeconds;
            playbackDurationNumber.value = durationSeconds;
            updatePlaybackDurationDisplay(durationSeconds);
        }
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

        const playbackDurationSeconds = parseInt(playbackDuration.value);

        const schedule = Scheduler.addSchedule({
            time: time,
            trackUri: selectedTrack.uri,
            trackName: selectedTrack.name,
            artistName: selectedTrack.artist,
            volume: parseInt(scheduleVolume.value),
            restorePlayback: scheduleRestore.checked,
            playbackDuration: playbackDurationSeconds,
            trackDuration: selectedTrack.duration_ms ? Math.floor(selectedTrack.duration_ms / 1000) : null
        });

        // Only reset the time field (keep volume, track, checkbox, and playback duration)
        scheduleTime.value = '';

        // Refresh schedule list
        renderSchedules();

        // Suggest next time based on pattern
        suggestNextTime(schedule.time);

        showToast(`Scheduled: ${schedule.trackName} at ${schedule.time}`);
    }

    /**
     * Render the list of schedules
     */
    function renderSchedules() {
        const schedules = Scheduler.getSchedules();
        const activeStatus = Scheduler.getActiveScheduleStatus();

        if (schedules.length === 0) {
            schedulesList.innerHTML = '<p class="text-muted">No scheduled items</p>';
            return;
        }

        // Sort by time
        schedules.sort((a, b) => a.time.localeCompare(b.time));

        schedulesList.innerHTML = schedules.map(schedule => {
            const countdownText = getCountdownText(schedule.time);
            const playbackInfo = schedule.playbackDuration && schedule.trackDuration ? 
                ` · Play: ${formatTime(schedule.playbackDuration)}/${formatTime(schedule.trackDuration)}` : '';
            
            const isActive = activeStatus && activeStatus.schedule.id === schedule.id;
            const activeClass = isActive ? 'active-schedule' : '';
            
            let activeStatusHTML = '';
            if (isActive) {
                const elapsedText = formatTime(activeStatus.elapsed);
                const remainingText = activeStatus.remaining !== null ? formatTime(activeStatus.remaining) : '?';
                const restoreText = activeStatus.willRestore ? ' → will restore' : '';
                activeStatusHTML = `
                    <div class="active-status" data-schedule-id="${schedule.id}">
                        <span class="active-badge">🔊 PLAYING</span>
                        <span class="active-time">Elapsed: <strong>${elapsedText}</strong> | Remaining: <strong>${remainingText}</strong>${restoreText}</span>
                    </div>
                `;
            }
            
            return `
                <div class="schedule-item ${schedule.enabled ? '' : 'disabled'} ${activeClass}" data-id="${schedule.id}">
                    <span class="time">${schedule.time}</span>
                    <div class="track-info">
                        <div class="track-name">${escapeHtml(schedule.trackName)}</div>
                        <div class="track-details">
                            ${escapeHtml(schedule.artistName)} · Volume: ${schedule.volume}%${playbackInfo}
                            ${schedule.restorePlayback ? '<span class="restore-badge">↩ Restore</span>' : ''}
                        </div>
                        ${activeStatusHTML}
                        <div class="countdown" data-time="${schedule.time}">${countdownText}</div>
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
            `;
        }).join('');

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
        
        // Start countdown updates and active schedule updates
        startCountdownUpdates();
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

    /**
     * Format seconds to MM:SS
     */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Suggest next schedule time based on previous pattern
     */
    function suggestNextTime(lastTime) {
        const schedules = Scheduler.getSchedules();
        
        // If we have at least 2 schedules, calculate the time difference
        if (schedules.length >= 2) {
            // Sort by time
            const sorted = schedules.slice().sort((a, b) => a.time.localeCompare(b.time));
            const lastTwo = sorted.slice(-2);
            
            // Calculate time difference in minutes
            const [h1, m1] = lastTwo[0].time.split(':').map(Number);
            const [h2, m2] = lastTwo[1].time.split(':').map(Number);
            let time1 = h1 * 60 + m1;
            let time2 = h2 * 60 + m2;
            
            // Handle day boundary - if time2 is less than time1, add 24 hours to time2
            if (time2 < time1) {
                time2 += 24 * 60;
            }
            
            const diff = time2 - time1;
            
            // Apply the same difference
            const [h, m] = lastTime.split(':').map(Number);
            const currentMinutes = h * 60 + m;
            let nextMinutes = currentMinutes + diff;
            
            // Handle day overflow - normalize to 0-1439 range
            nextMinutes = ((nextMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
            
            const nextHours = Math.floor(nextMinutes / 60);
            const nextMins = nextMinutes % 60;
            
            const suggestedTime = `${String(nextHours).padStart(2, '0')}:${String(nextMins).padStart(2, '0')}`;
            scheduleTime.value = suggestedTime;
        } else {
            // No pattern yet, suggest next round time (:00 or :30)
            const [h, m] = lastTime.split(':').map(Number);
            let nextMinutes;
            let nextHours = h;
            
            if (m < 30) {
                nextMinutes = 30;
            } else {
                nextMinutes = 0;
                nextHours = (h + 1) % 24;
            }
            
            const suggestedTime = `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
            scheduleTime.value = suggestedTime;
        }
    }

    /**
     * Get countdown text for a schedule time
     */
    function getCountdownText(scheduleTime) {
        const now = new Date();
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        
        const scheduleDate = new Date();
        scheduleDate.setHours(hours, minutes, 0, 0);
        
        // If the time is in the past today, it's for tomorrow
        if (scheduleDate <= now) {
            scheduleDate.setDate(scheduleDate.getDate() + 1);
        }
        
        const diffMs = scheduleDate - now;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        
        if (diffSeconds < 60) {
            return `in ${diffSeconds} second${diffSeconds !== 1 ? 's' : ''}`;
        } else if (diffMinutes < 60) {
            const secs = diffSeconds % 60;
            return `in ${diffMinutes}:${String(secs).padStart(2, '0')} minutes`;
        } else if (diffHours < 24) {
            const mins = diffMinutes % 60;
            return `in ${diffHours}:${String(mins).padStart(2, '0')} hours`;
        } else {
            const days = Math.floor(diffHours / 24);
            return `in ${days} day${days !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Start updating countdowns and active schedule status
     */
    function startCountdownUpdates() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        
        countdownInterval = setInterval(() => {
            // Update countdowns
            document.querySelectorAll('.countdown').forEach(element => {
                const scheduleTime = element.dataset.time;
                if (scheduleTime) {
                    const countdownText = getCountdownText(scheduleTime);
                    element.textContent = countdownText;
                    
                    // Update class based on countdown
                    if (countdownText === 'Past') {
                        element.classList.add('past');
                    } else {
                        element.classList.remove('past');
                    }
                }
            });
            
            // Update active schedule status
            const activeStatus = Scheduler.getActiveScheduleStatus();
            document.querySelectorAll('.active-status').forEach(element => {
                const scheduleId = element.dataset.scheduleId;
                if (activeStatus && activeStatus.schedule.id === scheduleId) {
                    const elapsedText = formatTime(activeStatus.elapsed);
                    const remainingText = activeStatus.remaining !== null ? formatTime(activeStatus.remaining) : '?';
                    const restoreText = activeStatus.willRestore ? ' → will restore' : '';
                    element.querySelector('.active-time').innerHTML = 
                        `Elapsed: <strong>${elapsedText}</strong> | Remaining: <strong>${remainingText}</strong>${restoreText}`;
                } else {
                    // Active schedule ended, re-render to remove active status
                    renderSchedules();
                }
            });
        }, 1000);
    }

    /**
     * Update playback duration display
     */
    function updatePlaybackDurationDisplay(seconds) {
        const formatted = formatTime(seconds);
        const maxSeconds = parseInt(playbackDuration.max);
        const isFullTrack = seconds >= maxSeconds;
        playbackDurationDisplay.textContent = formatted;
        
        const hintElement = playbackDurationDisplay.nextElementSibling;
        if (hintElement && hintElement.classList.contains('duration-hint')) {
            hintElement.textContent = isFullTrack ? '(full track)' : '(partial)';
        }
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        showToast,
    };
})();
