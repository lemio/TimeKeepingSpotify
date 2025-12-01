/**
 * Spotify OAuth 2.0 PKCE Authentication for Static Web Apps
 * This module handles the authentication flow with Spotify
 */

const SpotifyAuth = (function() {
    // Configuration - User should update CLIENT_ID with their Spotify App Client ID
    // Redirect URI should match what's registered in Spotify Developer Dashboard
    const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID'; // Replace with your Spotify Client ID
    const REDIRECT_URI = window.location.origin + window.location.pathname;
    const SCOPES = [
        'user-read-private',
        'user-read-email',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'streaming'
    ].join(' ');

    const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
    const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

    // Storage keys
    const ACCESS_TOKEN_KEY = 'spotify_access_token';
    const REFRESH_TOKEN_KEY = 'spotify_refresh_token';
    const TOKEN_EXPIRY_KEY = 'spotify_token_expiry';
    const CODE_VERIFIER_KEY = 'spotify_code_verifier';

    /**
     * Generate a random string for PKCE
     */
    function generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], '');
    }

    /**
     * Generate SHA-256 hash
     */
    async function sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest('SHA-256', data);
    }

    /**
     * Base64 URL encode
     */
    function base64urlencode(arrayBuffer) {
        let str = '';
        const bytes = new Uint8Array(arrayBuffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            str += String.fromCharCode(bytes[i]);
        }
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Generate PKCE code challenge from verifier
     */
    async function generateCodeChallenge(codeVerifier) {
        const hashed = await sha256(codeVerifier);
        return base64urlencode(hashed);
    }

    /**
     * Initiate the login flow
     */
    async function login() {
        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Store code verifier for later use
        localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            show_dialog: 'true'
        });

        window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
    }

    /**
     * Handle the callback from Spotify OAuth
     */
    async function handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            console.error('Authorization error:', error);
            return false;
        }

        if (!code) {
            return false;
        }

        const codeVerifier = localStorage.getItem(CODE_VERIFIER_KEY);
        if (!codeVerifier) {
            console.error('Code verifier not found');
            return false;
        }

        try {
            const response = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    code_verifier: codeVerifier,
                }),
            });

            const data = await response.json();

            if (data.error) {
                console.error('Token error:', data.error);
                return false;
            }

            // Store tokens
            storeTokens(data);

            // Clear the URL parameters
            window.history.replaceState({}, document.title, REDIRECT_URI);

            // Clear code verifier
            localStorage.removeItem(CODE_VERIFIER_KEY);

            return true;
        } catch (error) {
            console.error('Token exchange error:', error);
            return false;
        }
    }

    /**
     * Store tokens in localStorage
     */
    function storeTokens(tokenData) {
        const expiryTime = Date.now() + (tokenData.expires_in * 1000);
        localStorage.setItem(ACCESS_TOKEN_KEY, tokenData.access_token);
        localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
        if (tokenData.refresh_token) {
            localStorage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token);
        }
    }

    /**
     * Refresh the access token
     */
    async function refreshToken() {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (!refreshToken) {
            return false;
        }

        try {
            const response = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            });

            const data = await response.json();

            if (data.error) {
                console.error('Token refresh error:', data.error);
                return false;
            }

            storeTokens(data);
            return true;
        } catch (error) {
            console.error('Token refresh error:', error);
            return false;
        }
    }

    /**
     * Get the current access token, refreshing if necessary
     */
    async function getAccessToken() {
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        const tokenExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

        if (!accessToken) {
            return null;
        }

        // Check if token is expired or will expire in the next 5 minutes
        const expiryBuffer = 5 * 60 * 1000; // 5 minutes
        if (tokenExpiry && Date.now() > (parseInt(tokenExpiry) - expiryBuffer)) {
            const refreshed = await refreshToken();
            if (!refreshed) {
                return null;
            }
            return localStorage.getItem(ACCESS_TOKEN_KEY);
        }

        return accessToken;
    }

    /**
     * Check if user is logged in
     */
    function isLoggedIn() {
        return localStorage.getItem(ACCESS_TOKEN_KEY) !== null;
    }

    /**
     * Logout - clear all stored tokens
     */
    function logout() {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        localStorage.removeItem(CODE_VERIFIER_KEY);
    }

    /**
     * Get the Client ID (for verification)
     */
    function getClientId() {
        return CLIENT_ID;
    }

    // Public API
    return {
        login,
        handleCallback,
        getAccessToken,
        isLoggedIn,
        logout,
        refreshToken,
        getClientId
    };
})();
