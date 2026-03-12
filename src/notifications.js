import { supabase } from './supabaseClient';

/**
 * Resets the unread count for a specific chat for a specific user.
 * @param {string} userId - The ID of the current user.
 * @param {string} chatId - The ID of the chat (friend's user ID or circle ID).
 * @param {string} chatType - 'direct' or 'circle'
 */
export const resetUnreadCount = async (userId, chatId, chatType) => {
    try {
        const { error } = await supabase
            .from('unread_counts')
            .upsert({ 
                user_id: userId, 
                chat_id: chatId, 
                chat_type: chatType, 
                count: 0, 
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'user_id,chat_id' 
            });

        if (error) {
            console.error('Error resetting unread count:', error);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Unexpected error resetting unread count:', err);
        return false;
    }
};

/**
 * Requests browser permission to show push notifications.
 */
export const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notification");
        return false;
    }
    
    if (Notification.permission === "granted") {
        return true;
    }
    
    if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        return permission === "granted";
    }
    
    return false;
};

/**
 * Shows a browser push notification if permissions are granted 
 * and the document is not currently visible (in background/minimized).
 */
export const showPushNotification = (title, body, onClickCallback) => {
    if (!("Notification" in window)) return;
    
    // Only show if the user isn't actively looking at the page
    if (document.visibilityState === 'visible') return;

    if (Notification.permission === "granted") {
        const notification = new Notification(title, {
            body: body,
            icon: '/favicon.png', // Fallback to basic app icon if available
            badge: '/favicon.png'
        });

        notification.onclick = function(event) {
            event.preventDefault();
            window.focus(); // Try to bring the window to front
            notification.close();
            if (onClickCallback) {
                onClickCallback();
            }
        };
    }
};
