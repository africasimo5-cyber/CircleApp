import { supabase } from './supabaseClient';

/**
 * Uploads a photo or video story to Supabase Storage and records it in the database.
 */
export const uploadStory = async (userId, file) => {
    console.log('[StoriesAPI] Uploading story for user:', userId);
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        const filePath = `active/${fileName}`;
        const type = file.type.startsWith('video') ? 'video' : 'image';

        // 1. Upload to Storage
        const { error: uploadError, data } = await supabase.storage
            .from('stories')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('stories')
            .getPublicUrl(filePath);

        // 3. Insert into Database
        const { data: story, error: dbError } = await supabase
            .from('stories')
            .insert([{
                user_id: userId,
                type,
                url: publicUrl
            }])
            .select()
            .single();

        if (dbError) throw dbError;

        console.log('[StoriesAPI] Story uploaded successfully:', story.id);
        return { success: true, story };
    } catch (err) {
        console.error('[StoriesAPI] uploadStory error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Fetches all active stories from the community.
 * (In a real app, this would be filtered by friends/circles)
 */
export const getActiveStories = async () => {
    console.log('[StoriesAPI] Fetching active stories');
    try {
        const { data, error } = await supabase
            .from('stories')
            .select(`
                *,
                app_users (
                    id,
                    username,
                    display_name
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group stories by user
        const storiesByUser = {};
        data.forEach(story => {
            const uid = story.user_id;
            if (!storiesByUser[uid]) {
                storiesByUser[uid] = {
                    user: story.app_users,
                    stories: []
                };
            }
            storiesByUser[uid].stories.push(story);
        });

        return { success: true, groupedStories: Object.values(storiesByUser) };
    } catch (err) {
        console.error('[StoriesAPI] getActiveStories error:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Deletes a story from both storage and database.
 */
export const deleteStory = async (storyId, url) => {
    console.log('[StoriesAPI] Deleting story:', storyId);
    try {
        // 1. Extract file path from URL
        // Example URL: https://.../storage/v1/object/public/stories/userId/timestamp.jpg
        const pathMatch = url.match(/stories\/(.+)$/);
        if (pathMatch) {
            const filePath = pathMatch[1];
            await supabase.storage.from('stories').remove([filePath]);
        }

        // 2. Delete from Database
        const { error } = await supabase
            .from('stories')
            .delete()
            .eq('id', storyId);

        if (error) throw error;

        return { success: true };
    } catch (err) {
        console.error('[StoriesAPI] deleteStory error:', err);
        return { success: false, error: err.message };
    }
};
