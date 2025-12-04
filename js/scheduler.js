/**
 * Scheduler Module
 * Handles scheduling music to play at specific times
 */

const Scheduler = (function() {
    const SCHEDULES_KEY = 'spotify_schedules';
    const SCHEDULE_CHECK_INTERVAL_MS = 1000; // Check every second for precise timing
    const MAX_TRACK_MONITOR_SECONDS = 600; // Monitor track for up to 10 minutes
    
    let schedules = [];
    let checkInterval = null;
    let previousPlaybackState = null;
    let activeSchedule = null; // Track currently playing scheduled track
    let activeScheduleStartTime = null; // When the scheduled track started playing

    /**
     * Initialize the scheduler
     */
    function init() {
        loadSchedules();
        startChecking();
    }

    /**
     * Load schedules from localStorage
     */
    function loadSchedules() {
        const stored = localStorage.getItem(SCHEDULES_KEY);
        if (stored) {
            try {
                schedules = JSON.parse(stored);
                // Filter out any past schedules that don't repeat
                schedules = schedules.filter(s => !s.triggered || s.repeat);
                // Reset triggered flag for repeating schedules on new day
                schedules.forEach(s => {
                    if (s.repeat) {
                        const lastTriggered = s.lastTriggeredDate;
                        const today = new Date().toDateString();
                        if (lastTriggered !== today) {
                            s.triggered = false;
                        }
                    }
                });
                saveSchedules();
            } catch {
                schedules = [];
            }
        }
    }

    /**
     * Save schedules to localStorage
     */
    function saveSchedules() {
        localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
    }

    /**
     * Add a new schedule
     * @param {Object} schedule - Schedule object
     * @param {string} schedule.time - Time in HH:MM format
     * @param {string} schedule.trackUri - Spotify track URI
     * @param {string} schedule.trackName - Track name for display
     * @param {string} schedule.artistName - Artist name for display
     * @param {number} schedule.volume - Volume level (0-100)
     * @param {boolean} schedule.restorePlayback - Whether to restore previous playback after song ends
     * @param {boolean} schedule.repeat - Whether to repeat daily
     * @param {number} schedule.playbackDuration - Duration to play in seconds
     * @param {number} schedule.trackDuration - Full track duration in seconds
     */
    function addSchedule(schedule) {
        const newSchedule = {
            id: Date.now().toString(),
            time: schedule.time,
            trackUri: schedule.trackUri,
            trackName: schedule.trackName || 'Unknown Track',
            artistName: schedule.artistName || 'Unknown Artist',
            volume: schedule.volume || 50,
            restorePlayback: schedule.restorePlayback || false,
            repeat: schedule.repeat !== false, // Default to repeat daily
            triggered: false,
            enabled: true,
            playbackDuration: schedule.playbackDuration || null,
            trackDuration: schedule.trackDuration || null
        };
        schedules.push(newSchedule);
        saveSchedules();
        return newSchedule;
    }

    /**
     * Remove a schedule by ID
     * @param {string} scheduleId - Schedule ID
     */
    function removeSchedule(scheduleId) {
        schedules = schedules.filter(s => s.id !== scheduleId);
        saveSchedules();
    }

    /**
     * Toggle schedule enabled state
     * @param {string} scheduleId - Schedule ID
     */
    function toggleSchedule(scheduleId) {
        const schedule = schedules.find(s => s.id === scheduleId);
        if (schedule) {
            schedule.enabled = !schedule.enabled;
            saveSchedules();
        }
    }

    /**
     * Get all schedules
     */
    function getSchedules() {
        return [...schedules];
    }

    /**
     * Start checking for scheduled times
     */
    function startChecking() {
        if (checkInterval) {
            clearInterval(checkInterval);
        }
        // Check every second for precise timing at schedule time
        checkInterval = setInterval(checkSchedules, SCHEDULE_CHECK_INTERVAL_MS);
    }

    /**
     * Stop checking for scheduled times
     */
    function stopChecking() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
    }

    /**
     * Check if any schedules should be triggered
     */
    async function checkSchedules() {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentSeconds = now.getSeconds();

        for (const schedule of schedules) {
            // Only trigger at the start of the minute (within first 2 seconds)
            if (schedule.enabled && !schedule.triggered && schedule.time === currentTime && currentSeconds < 2) {
                await triggerSchedule(schedule);
            }
        }
    }

    /**
     * Trigger a scheduled playback
     * @param {Object} schedule - Schedule to trigger
     */
    async function triggerSchedule(schedule) {
        try {
            console.log(`Triggering schedule: ${schedule.trackName} at ${schedule.time}`);

            // Store current playback state if restore is enabled
            if (schedule.restorePlayback) {
                previousPlaybackState = await SpotifyAPI.getPlaybackState();
            }

            // Pause current playback
            try {
                await SpotifyAPI.pause();
            } catch {
                // Ignore if nothing is playing
            }

            // Wait a moment for pause to take effect
            await new Promise(resolve => setTimeout(resolve, 500));

            // Set volume
            await SpotifyAPI.setVolume(schedule.volume);

            // Play the scheduled track
            await SpotifyAPI.play({
                uris: [schedule.trackUri]
            });

            // Mark as triggered and set as active
            schedule.triggered = true;
            schedule.lastTriggeredDate = new Date().toDateString();
            activeSchedule = schedule;
            activeScheduleStartTime = Date.now();
            saveSchedules();

            // Show notification
            showNotification(`Now playing: ${schedule.trackName}`);

            // If playback duration is set and less than full track, monitor and stop
            if (schedule.playbackDuration && schedule.trackDuration && schedule.playbackDuration < schedule.trackDuration) {
                monitorPlaybackDuration(schedule);
            } else if (schedule.restorePlayback && previousPlaybackState) {
                // If restore is enabled and playing full track, monitor for track end
                monitorTrackEnd(schedule, previousPlaybackState);
            }

        } catch (error) {
            console.error('Error triggering schedule:', error);
            showNotification(`Error: ${error.message}`, true);
            // Clear active schedule on error
            activeSchedule = null;
            activeScheduleStartTime = null;
        }
    }

    /**
     * Monitor playback and stop after specified duration
     * @param {Object} schedule - The triggered schedule
     */
    async function monitorPlaybackDuration(schedule) {
        const targetDuration = schedule.playbackDuration * 1000; // Convert to ms
        const startTime = Date.now();
        
        const checkPlayback = setInterval(async () => {
            try {
                const elapsed = Date.now() - startTime;
                
                // Stop playback when duration is reached
                if (elapsed >= targetDuration) {
                    clearInterval(checkPlayback);
                    
                    const currentState = await SpotifyAPI.getPlaybackState();
                    
                    // Only pause if still playing the scheduled track
                    if (currentState && currentState.item?.uri === schedule.trackUri) {
                        await SpotifyAPI.pause();
                        
                        // If restore is enabled, restore previous playback
                        if (schedule.restorePlayback && previousPlaybackState) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await restorePreviousPlayback(previousPlaybackState);
                        }
                    }
                    
                    // Clear active schedule
                    activeSchedule = null;
                    activeScheduleStartTime = null;
                    return;
                }
                
                // Check if user changed the track
                const currentState = await SpotifyAPI.getPlaybackState();
                if (!currentState || currentState.item?.uri !== schedule.trackUri) {
                    clearInterval(checkPlayback);
                    // User changed the track, don't interfere
                    activeSchedule = null;
                    activeScheduleStartTime = null;
                    return;
                }
                
            } catch (error) {
                console.error('Error monitoring playback duration:', error);
                clearInterval(checkPlayback);
                activeSchedule = null;
                activeScheduleStartTime = null;
            }
        }, 1000);
    }

    /**
     * Monitor for track end and restore previous playback
     * @param {Object} schedule - The triggered schedule
     * @param {Object} prevState - Previous playback state to restore
     */
    async function monitorTrackEnd(schedule, prevState) {
        let checkCount = 0;

        const checkPlayback = setInterval(async () => {
            checkCount++;
            if (checkCount > MAX_TRACK_MONITOR_SECONDS) {
                clearInterval(checkPlayback);
                activeSchedule = null;
                activeScheduleStartTime = null;
                return;
            }

            try {
                const currentState = await SpotifyAPI.getPlaybackState();

                // Check if the scheduled track is still playing
                if (!currentState || !currentState.is_playing) {
                    clearInterval(checkPlayback);
                    activeSchedule = null;
                    activeScheduleStartTime = null;
                    await restorePreviousPlayback(prevState);
                    return;
                }

                // Check if a different track is now playing (user changed it)
                const currentTrackUri = currentState.item?.uri;
                if (currentTrackUri && currentTrackUri !== schedule.trackUri) {
                    clearInterval(checkPlayback);
                    activeSchedule = null;
                    activeScheduleStartTime = null;
                    // User changed the track, don't restore
                    return;
                }

                // Check if track has ended (progress near duration)
                if (currentState.item && currentState.progress_ms >= currentState.item.duration_ms - 1000) {
                    clearInterval(checkPlayback);
                    activeSchedule = null;
                    activeScheduleStartTime = null;
                    await restorePreviousPlayback(prevState);
                }

            } catch (error) {
                console.error('Error monitoring playback:', error);
            }
        }, 1000);
    }

    /**
     * Restore previous playback state
     * @param {Object} prevState - Previous playback state
     */
    async function restorePreviousPlayback(prevState) {
        try {
            console.log('Restoring previous playback...');

            // Wait a moment for the track to fully end
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Restore volume
            if (prevState.device?.volume_percent !== undefined) {
                await SpotifyAPI.setVolume(prevState.device.volume_percent);
            }

            // If there was a context (playlist/album), restore it and start playback
            if (prevState.context?.uri) {
                await SpotifyAPI.play({
                    contextUri: prevState.context.uri,
                    positionMs: prevState.progress_ms || 0,
                });
                showNotification('Restored previous playback');
            } else if (prevState.item?.uri) {
                // Otherwise, just play the previous track and start playback
                await SpotifyAPI.play({
                    uris: [prevState.item.uri],
                    positionMs: prevState.progress_ms || 0,
                });
                showNotification('Restored previous playback');
            } else {
                // No previous playback to restore, just notify
                showNotification('Previous playback restored (was paused)');
            }

        } catch (error) {
            console.error('Error restoring playback:', error);
            showNotification('Could not restore previous playback', true);
        }
    }

    /**
     * Show a notification (delegated to app)
     */
    function showNotification(message, isError = false) {
        // This will be handled by the app module
        if (typeof App !== 'undefined' && App.showToast) {
            App.showToast(message, isError);
        } else {
            console.log(message);
        }
    }

    /**
     * Reset all schedules for a new day
     */
    function resetDailySchedules() {
        schedules.forEach(s => {
            if (s.repeat) {
                s.triggered = false;
            }
        });
        saveSchedules();
    }

    /**
     * Manually trigger a schedule (for testing)
     * @param {string} scheduleId - Schedule ID
     */
    async function triggerNow(scheduleId) {
        const schedule = schedules.find(s => s.id === scheduleId);
        if (schedule) {
            schedule.triggered = false;
            await triggerSchedule(schedule);
        }
    }

    /**
     * Get the currently active schedule (if any)
     * @returns {Object|null} Active schedule info with elapsed and remaining time
     */
    function getActiveScheduleInfo() {
        if (!activeSchedule || !activeScheduleStartTime) {
            return null;
        }

        const elapsedMs = Date.now() - activeScheduleStartTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        let remainingSeconds = null;
        if (activeSchedule.playbackDuration) {
            remainingSeconds = Math.max(0, activeSchedule.playbackDuration - elapsedSeconds);
        }

        return {
            scheduleId: activeSchedule.id,
            elapsedSeconds,
            remainingSeconds,
        };
    }

    // Public API
    return {
        init,
        addSchedule,
        removeSchedule,
        toggleSchedule,
        getSchedules,
        startChecking,
        stopChecking,
        resetDailySchedules,
        triggerNow,
        getActiveScheduleInfo,
    };
})();
