/**
 * Spotify Web API Wrapper
 * Handles all Spotify API calls for playback control
 */

const SpotifyAPI = (function() {
    const API_BASE = 'https://api.spotify.com/v1';

    /**
     * Make an authenticated API request
     */
    async function apiRequest(endpoint, options = {}) {
        const accessToken = await SpotifyAuth.getAccessToken();
        if (!accessToken) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        // Handle 204 No Content
        if (response.status === 204) {
            return null;
        }

        // Handle errors
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API Error: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Get current user profile
     */
    async function getCurrentUser() {
        return apiRequest('/me');
    }

    /**
     * Get current playback state
     */
    async function getPlaybackState() {
        try {
            return await apiRequest('/me/player');
        } catch (error) {
            // No active device returns null
            return null;
        }
    }

    /**
     * Get user's available devices
     */
    async function getDevices() {
        const response = await apiRequest('/me/player/devices');
        return response.devices || [];
    }

    /**
     * Start/resume playback
     * @param {Object} options - Playback options
     * @param {string} options.deviceId - Target device ID
     * @param {string} options.contextUri - Spotify URI of context (album, playlist, etc.)
     * @param {string[]} options.uris - Array of track URIs to play
     * @param {number} options.positionMs - Position to start playback
     */
    async function play(options = {}) {
        const query = options.deviceId ? `?device_id=${options.deviceId}` : '';
        const body = {};

        if (options.contextUri) {
            body.context_uri = options.contextUri;
        }
        if (options.uris) {
            body.uris = options.uris;
        }
        if (options.positionMs !== undefined) {
            body.position_ms = options.positionMs;
        }

        return apiRequest(`/me/player/play${query}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    /**
     * Pause playback
     * @param {string} deviceId - Target device ID (optional)
     */
    async function pause(deviceId) {
        const query = deviceId ? `?device_id=${deviceId}` : '';
        return apiRequest(`/me/player/pause${query}`, {
            method: 'PUT',
        });
    }

    /**
     * Set volume
     * @param {number} volumePercent - Volume level (0-100)
     * @param {string} deviceId - Target device ID (optional)
     */
    async function setVolume(volumePercent, deviceId) {
        const query = new URLSearchParams({
            volume_percent: Math.min(100, Math.max(0, volumePercent)),
        });
        if (deviceId) {
            query.append('device_id', deviceId);
        }
        return apiRequest(`/me/player/volume?${query.toString()}`, {
            method: 'PUT',
        });
    }

    /**
     * Skip to next track
     */
    async function next() {
        return apiRequest('/me/player/next', {
            method: 'POST',
        });
    }

    /**
     * Skip to previous track
     */
    async function previous() {
        return apiRequest('/me/player/previous', {
            method: 'POST',
        });
    }

    /**
     * Search for tracks
     * @param {string} query - Search query
     * @param {number} limit - Number of results (default: 5)
     */
    async function searchTracks(query, limit = 5) {
        const params = new URLSearchParams({
            q: query,
            type: 'track',
            limit: limit,
        });
        const response = await apiRequest(`/search?${params.toString()}`);
        return response.tracks?.items || [];
    }

    /**
     * Get track information
     * @param {string} trackId - Spotify track ID
     */
    async function getTrack(trackId) {
        return apiRequest(`/tracks/${trackId}`);
    }

    /**
     * Get current playing track
     */
    async function getCurrentlyPlaying() {
        try {
            return await apiRequest('/me/player/currently-playing');
        } catch {
            return null;
        }
    }

    /**
     * Transfer playback to a specific device
     * @param {string} deviceId - Target device ID
     * @param {boolean} play - Start playing on new device
     */
    async function transferPlayback(deviceId, play = false) {
        return apiRequest('/me/player', {
            method: 'PUT',
            body: JSON.stringify({
                device_ids: [deviceId],
                play: play,
            }),
        });
    }

    /**
     * Extract track ID from Spotify URI or URL
     * @param {string} input - Spotify URI or URL
     */
    function extractTrackId(input) {
        // Handle Spotify URI format: spotify:track:XXXX
        const uriMatch = input.match(/spotify:track:([a-zA-Z0-9]+)/);
        if (uriMatch) {
            return uriMatch[1];
        }

        // Handle Spotify URL format: https://open.spotify.com/track/XXXX
        const urlMatch = input.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
            return urlMatch[1];
        }

        return null;
    }

    /**
     * Convert track ID to URI
     * @param {string} trackId - Spotify track ID
     */
    function trackIdToUri(trackId) {
        return `spotify:track:${trackId}`;
    }

    // Public API
    return {
        getCurrentUser,
        getPlaybackState,
        getDevices,
        play,
        pause,
        setVolume,
        next,
        previous,
        searchTracks,
        getTrack,
        getCurrentlyPlaying,
        transferPlayback,
        extractTrackId,
        trackIdToUri,
    };
})();
