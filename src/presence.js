import { supabase } from './supabaseClient';

/**
 * Updates the user's custom status text in the database.
 */
export const updateStatusText = async (userId, text) => {
    try {
        const { error } = await supabase
            .from('app_users')
            .update({ status_text: text })
            .eq('id', userId);
        
        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error('[Presence] Error updating status:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Updates the user's last_seen timestamp in the database.
 */
export const updateLastSeen = async (userId) => {
    try {
        const { error } = await supabase
            .from('app_users')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', userId);

        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error('[Presence] Error updating last seen:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Subscribes to Supabase Realtime Presence to track who is online.
 * @param {object} user The current user object
 * @param {function} onSync Callback when the presence state changes, receives array of online user IDs
 * @returns {object} The Supabase channel
 */
export const subscribeToPresence = (user, onSync) => {
    const channel = supabase.channel('online-users', {
        config: {
            presence: {
                key: user.id,
            },
        },
    });

    channel
        .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            // Extract the user IDs from the dictionary keys
            const onlineIds = Object.keys(newState);
            onSync(onlineIds);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Track our own presence
                await channel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString(),
                });
            }
        });

    return channel;
};
