# TimeKeepingSpotify

<img alt="Timekeeping app" src="https://github.com/user-attachments/assets/e3d93208-f507-4f56-8251-128ca5f22520" />

A timekeeping/alarm app that uses the Spotify API to play specific music on set times.

## Features

- **Spotify Login**: Secure OAuth 2.0 PKCE authentication (no server required)
- **Schedule Music**: Set specific times to play tracks from Spotify
- **Volume Control**: Set custom volume levels for each scheduled alarm
- **Restore Playback**: Option to return to your previous playlist after the scheduled song finishes
- **Search Tracks**: Search for songs or paste Spotify URIs/URLs directly
- **Daily Repeats**: Schedules automatically repeat daily

## Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the app details:
   - App name: TimeKeeping Spotify (or your preferred name)
   - App description: A music scheduling app
   - Redirect URI: Your hosting URL (e.g., `https://yourdomain.com/` or `http://localhost:8080/` for local testing)
4. Check the "Web API" checkbox
5. Accept the terms and click "Save"
6. Copy your **Client ID** from the app settings

### 2. Configure the App

1. Open `js/spotify-auth.js`
2. Replace `YOUR_SPOTIFY_CLIENT_ID` with your actual Spotify Client ID:
   ```javascript
   const CLIENT_ID = 'your-actual-client-id-here';
   ```

### 3. Host the App

This is a static web app that can be hosted on any HTTPS web server:

#### Local Development
```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

#### Apache Server
Simply copy all files to your Apache web root directory (e.g., `/var/www/html/`).

Make sure your Apache server:
- Has HTTPS enabled (required for Spotify API)
- The redirect URI in your Spotify app matches your hosting URL

## Usage

1. **Login**: Click "Login with Spotify" to authenticate
2. **Schedule Music**:
   - Set the time you want music to play
   - Search for a track or paste a Spotify URI/URL
   - Adjust the volume level
   - Optionally enable "Return to previous playlist when song finishes"
   - Click "Add Schedule"
3. **Manage Schedules**:
   - View all scheduled items
   - Toggle schedules on/off
   - Test a schedule immediately
   - Delete schedules

## Requirements

- A Spotify Premium account (required for playback control)
- An active Spotify device (app, web player, or device must be open)
- A modern web browser with JavaScript enabled
- HTTPS hosting (required for Spotify OAuth)

## File Structure

```
TimeKeepingSpotify/
├── index.html          # Main application page
├── css/
│   └── styles.css      # Application styles
├── js/
│   ├── spotify-auth.js # Spotify OAuth 2.0 PKCE authentication
│   ├── spotify-api.js  # Spotify Web API wrapper
│   ├── scheduler.js    # Schedule management and triggering
│   └── app.js          # Main application logic
└── README.md           # This file
```

## How It Works

1. **Authentication**: Uses Spotify's OAuth 2.0 PKCE flow (secure for client-side apps)
2. **Scheduling**: Stores schedules in browser localStorage
3. **Playback Control**: Uses Spotify Web API to:
   - Pause current playback
   - Set volume
   - Play the scheduled track
   - Restore previous playback (if enabled)

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## License

MIT License
