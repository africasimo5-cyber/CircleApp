import { supabase } from './supabaseClient';

/**
 * Creates a new Circle and adds the owner as the first member.
 */
export const createCircle = async (ownerId, name, photoUrl = null) => {
    console.log('[CirclesAPI] Creating circle:', name);
    try {
        // 1. Create the circle
        const { data: circle, error: createError } = await supabase
            .from('circles')
            .insert([{ name, owner_id: ownerId, photo_url: photoUrl }])
            .select()
            .single();

        if (createError) throw createError;

        // 2. Add owner as member
        const { error: memberError } = await supabase
            .from('circle_members')
            .insert([{ circle_id: circle.id, user_id: ownerId }]);

        if (memberError) throw memberError;

        console.log('[CirclesAPI] Circle created successfully:', circle.id);
        return { success: true, circle };
    } catch (err) {
        console.error('[CirclesAPI] createCircle error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Fetches all circles a user is a member of.
 */
export const getUsersCircles = async (userId) => {
    console.log('[CirclesAPI] Fetching circles for user:', userId);
    try {
        const { data, error } = await supabase
            .from('circle_members')
            .select(`
                circle_id,
                circles (
                    id,
                    name,
                    photo_url,
                    owner_id,
                    created_at
                )
            `)
            .eq('user_id', userId);

        if (error) throw error;

        // Flatten the nested join structure
        const circles = data.map(item => item.circles);
        return { success: true, circles };
    } catch (err) {
        console.error('[CirclesAPI] getUsersCircles error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Invites a friend to a circle.
 */
export const inviteToCircle = async (circleId, userId) => {
    console.log('[CirclesAPI] Inviting user to circle:', { circleId, userId });
    try {
        const { error } = await supabase
            .from('circle_members')
            .insert([{ circle_id: circleId, user_id: userId }]);

        if (error) {
            if (error.code === '23505') return { success: false, error: 'User is already in this circle' };
            throw error;
        }

        return { success: true };
    } catch (err) {
        console.error('[CirclesAPI] inviteToCircle error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Fetches member details for a specific circle.
 */
export const getCircleMembers = async (circleId) => {
    try {
        const { data, error } = await supabase
            .from('circle_members')
            .select(`
                user_id,
                app_users (
                    id,
                    username,
                    display_name
                )
            `)
            .eq('circle_id', circleId);

        if (error) throw error;

        const members = data.map(item => item.app_users);
        return { success: true, members };
    } catch (err) {
        console.error('[CirclesAPI] getCircleMembers error:', err);
        return { success: false, error: err.message };
    }
};
