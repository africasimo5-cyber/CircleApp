import { supabase } from './supabaseClient';

/**
 * Toggles a reaction for a user on a specific message.
 * If the reaction exists, it deletes it. If not, it creates it.
 */
export const toggleReaction = async (messageId, userId, emoji) => {
    console.log('[ReactionsAPI] Toggling reaction:', emoji, 'on msg:', messageId);
    try {
        // 1. Check if it exists
        const { data: existing, error: checkError } = await supabase
            .from('message_reactions')
            .select('id')
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .eq('emoji', emoji)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existing) {
            // Remove
            const { error: delError } = await supabase
                .from('message_reactions')
                .delete()
                .eq('id', existing.id);
            if (delError) throw delError;
            return { success: true, action: 'removed' };
        } else {
            // Add
            const { error: insError } = await supabase
                .from('message_reactions')
                .insert([{
                    message_id: messageId,
                    user_id: userId,
                    emoji: emoji
                }]);
            if (insError) throw insError;
            return { success: true, action: 'added' };
        }
    } catch (err) {
        console.error('[ReactionsAPI] toggleReaction error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Subscribes to real-time updates for reactions.
 * @param {function} onUpdate Callback function when a reaction is added/deleted
 * @returns {object} The Supabase channel (to unsubscribe later)
 */
export const subscribeToReactions = (onUpdate) => {
    console.log('[ReactionsAPI] Subscribing to reactions');
    const channel = supabase
        .channel('public:message_reactions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, payload => {
            console.log('[ReactionsAPI] Realtime reaction update:', payload);
            onUpdate(payload);
        })
        .subscribe();

    return channel;
};

/**
 * Fetches all reactions for a set of messages.
 * Note: A better approach is to join this in the main messages query, 
 * but this works nicely if we decouple it for now.
 * @param {Array<string>} messageIds 
 */
export const getReactionsForMessages = async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return { success: true, reactions: [] };
    
    try {
        const { data, error } = await supabase
            .from('message_reactions')
            .select(`
                *,
                app_users (
                    id, 
                    display_name,
                    username
                )
            `)
            .in('message_id', messageIds);

        if (error) throw error;
        return { success: true, reactions: data };
    } catch (err) {
        console.error('[ReactionsAPI] fetchReactions error:', err);
        return { success: false, error: err.message };
    }
};
