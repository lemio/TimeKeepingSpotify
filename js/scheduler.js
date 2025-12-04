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
    let activeSchedule = null; // Track the currently active schedule
    let activeScheduleStartTime = null; // When the active schedule started playing

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
            let savedPlaybackState = null;
            if (schedule.restorePlayback) {
                savedPlaybackState = await SpotifyAPI.getPlaybackState();
                previousPlaybackState = savedPlaybackState; // Keep for module-level access
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

            // Mark as triggered and active
            schedule.triggered = true;
            schedule.lastTriggeredDate = new Date().toDateString();
            saveSchedules();
            
            // Set as active schedule
            activeSchedule = schedule;
            activeScheduleStartTime = Date.now();

            // Show notification
            showNotification(`Now playing: ${schedule.trackName}`);

            // If playback duration is set and less than full track, monitor and stop
            if (schedule.playbackDuration && schedule.trackDuration && schedule.playbackDuration < schedule.trackDuration) {
                monitorPlaybackDuration(schedule, savedPlaybackState);
            } else if (schedule.restorePlayback && savedPlaybackState) {
                // If restore is enabled and playing full track, monitor for track end
                monitorTrackEnd(schedule, savedPlaybackState);
            } else {
                // No restore needed, but still monitor to clear active state
                monitorForCompletion(schedule);
            }

        } catch (error) {
            console.error('Error triggering schedule:', error);
            showNotification(`Error: ${error.message}`, true);
            activeSchedule = null;
            activeScheduleStartTime = null;
        }
    }

    /**
     * Monitor playback and stop after specified duration
     * @param {Object} schedule - The triggered schedule
     * @param {Object} savedPlaybackState - The saved playback state to restore
     */
    async function monitorPlaybackDuration(schedule, savedPlaybackState) {
        const targetDuration = schedule.playbackDuration * 1000; // Convert to ms
        const startTime = Date.now();
        
        const checkPlayback = setInterval(async () => {
            try {
                const elapsed = Date.now() - startTime;
                
                // Stop playback when duration is reached
                if (elapsed >= targetDuration) {
                    clearInterval(checkPlayback);
                    
                    const currentState = await SpotifyAPI.getPlaybackState();
                    
                    // Only pause/restore if still playing the scheduled track
                    if (currentState && currentState.item?.uri === schedule.trackUri) {
                        await SpotifyAPI.pause();
                        
                        // If restore is enabled, restore previous playback
                        if (schedule.restorePlayback && savedPlaybackState) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await restorePreviousPlayback(savedPlaybackState);
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
                    // User changed the track, don't restore
                    activeSchedule = null;
                    activeScheduleStartTime = null;
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
                activeSchedule = null;
                activeScheduleStartTime = null;
            }
        }, 1000);
    }

    /**
     * Monitor for playback completion (no restore)
     * @param {Object} schedule - The triggered schedule
     */
    async function monitorForCompletion(schedule) {
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

                // Check if track is no longer playing or changed
                if (!currentState || !currentState.is_playing || currentState.item?.uri !== schedule.trackUri) {
                    clearInterval(checkPlayback);
                    activeSchedule = null;
                    activeScheduleStartTime = null;
                    return;
                }

            } catch (error) {
                console.error('Error monitoring playback completion:', error);
                clearInterval(checkPlayback);
                activeSchedule = null;
                activeScheduleStartTime = null;
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

            // If there was a context (playlist/album), restore it
            if (prevState.context?.uri) {
                await SpotifyAPI.play({
                    contextUri: prevState.context.uri,
                    positionMs: prevState.progress_ms || 0,
                });
            } else if (prevState.item?.uri) {
                // Otherwise, just play the previous track
                await SpotifyAPI.play({
                    uris: [prevState.item.uri],
                    positionMs: prevState.progress_ms || 0,
                });
            }

            showNotification('Restored previous playback');
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
     * Get the currently active schedule and its status
     * @returns {Object|null} Active schedule info or null
     */
    function getActiveScheduleStatus() {
        if (!activeSchedule || !activeScheduleStartTime) {
            return null;
        }

        const elapsed = Math.floor((Date.now() - activeScheduleStartTime) / 1000);
        let remaining = null;
        
        if (activeSchedule.playbackDuration && activeSchedule.trackDuration && 
            activeSchedule.playbackDuration < activeSchedule.trackDuration) {
            remaining = Math.max(0, activeSchedule.playbackDuration - elapsed);
        } else if (activeSchedule.trackDuration) {
            remaining = Math.max(0, activeSchedule.trackDuration - elapsed);
        }

        return {
            schedule: activeSchedule,
            elapsed: elapsed,
            remaining: remaining,
            willRestore: activeSchedule.restorePlayback
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
        getActiveScheduleStatus,
    };
})();
