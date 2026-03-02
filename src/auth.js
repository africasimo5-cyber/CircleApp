import { supabase } from './supabaseClient';

// Helper to log errors with full context
const logError = (context, error) => {
    console.error(`[Auth Error] ${context}:`, {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error
    });
};

export const login = async (username, password) => {
    console.log('[Auth] Login attempt for:', username);
    try {
        const { data: user, error } = await supabase
            .from('app_users')
            .select('*')
            .ilike('username', username.trim()) // Case-insensitive
            .eq('password', password)
            .maybeSingle();

        if (error) {
            logError('Login Query', error);
            return { success: false, error: 'Database connection error' };
        }

        if (!user) {
            console.warn('[Auth] No user found for credentials');
            return { success: false, error: 'Invalid username or password' };
        }

        console.log('[Auth] Login successful:', user.username);
        localStorage.setItem('chat_user', JSON.stringify(user));
        return { success: true, user };
    } catch (err) {
        console.error('[Auth] Unexpected error during login:', err);
        return { success: false, error: 'An unexpected error occurred' };
    }
};

export const signup = async (username, password, displayName) => {
    console.log('[Auth] Signup attempt:', { username, displayName });
    try {
        // 1. Check user count (Limit to 5)
        const { count, error: countError } = await supabase
            .from('app_users')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            logError('Count Check', countError);
            throw countError;
        }

        console.log('[Auth] Current user count:', count);
        if (count >= 10) {
            return { success: false, error: 'The app has reached its limit of 10 users.' };
        }

        // 2. Check if username exists (Case-insensitive)
        const { data: existingUser, error: checkError } = await supabase
            .from('app_users')
            .select('id, username')
            .ilike('username', username.trim())
            .maybeSingle();

        if (checkError) {
            logError('Duplicate Check', checkError);
        }

        if (existingUser) {
            console.warn('[Auth] Username taken:', existingUser.username);
            return { success: false, error: 'Username already taken.' };
        }

        // 3. Create user
        console.log('[Auth] Inserting new user...');
        const { data: newUser, error: signUpError } = await supabase
            .from('app_users')
            .insert([{
                username: username.trim(),
                password,
                display_name: displayName.trim()
            }])
            .select()
            .single();

        if (signUpError) {
            logError('Insert Operation', signUpError);
            return { success: false, error: `Signup failed: ${signUpError.message}` };
        }

        console.log('[Auth] User created successfully:', newUser);
        localStorage.setItem('chat_user', JSON.stringify(newUser));
        return { success: true, user: newUser };
    } catch (err) {
        console.error('[Auth] Unexpected error during signup:', err);
        return { success: false, error: 'An unexpected error occurred during signup' };
    }
};

export const logout = () => {
    console.log('[Auth] Logging out...');
    localStorage.removeItem('chat_user');
};

export const clearSession = () => {
    console.log('[Auth] Nuclear reset triggered!');
    localStorage.clear();
    window.location.reload();
};

export const getCurrentUser = () => {
    try {
        const userStr = localStorage.getItem('chat_user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (user) console.log('[Auth] Session found for:', user.username);
        return user;
    } catch (err) {
        console.error('[Auth] session parse error:', err);
        return null;
    }
};

export const deleteAccount = async (userId) => {
    console.log('[Auth] Deleting account and all associated data:', userId);
    try {
        // 1. Delete all messages where user is sender or recipient
        console.log('[Auth] Deleting messages...');
        const { error: msgError } = await supabase
            .from('messages')
            .delete()
            .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);

        if (msgError) {
            logError('Message Cleanup', msgError);
            throw new Error(`Failed to clean up messages: ${msgError.message}`);
        }

        // 2. Delete all friend relationships
        console.log('[Auth] Deleting friend relationships...');
        const { error: friendError } = await supabase
            .from('friends')
            .delete()
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (friendError) {
            logError('Friend Cleanup', friendError);
            throw new Error(`Failed to clean up friendships: ${friendError.message}`);
        }

        // 3. Delete the user record
        console.log('[Auth] Deleting user record...');
        const { error: userError } = await supabase
            .from('app_users')
            .delete()
            .eq('id', userId);

        if (userError) {
            logError('Account Delete', userError);
            throw userError;
        }

        console.log('[Auth] Account and data deleted successfully');
        localStorage.removeItem('chat_user');
        return { success: true };
    } catch (err) {
        console.error('[Auth] Delete fatal error:', err);
        return { success: false, error: err.message || 'An error occurred during account deletion' };
    }
};

export const addFriendByUsername = async (currentUserId, friendUsername) => {
    const target = friendUsername.trim();
    console.log('[Auth] Add friend search for:', target);
    try {
        // 1. Find the friend by username (case insensitive)
        const { data: friend, error: findError } = await supabase
            .from('app_users')
            .select('id, username, display_name')
            .ilike('username', target)
            .maybeSingle();

        if (findError) {
            logError('Friend Search Query', findError);
            return { success: false, error: 'Database search failed' };
        }

        if (!friend) {
            console.warn('[Auth] Friend search returned no results');
            return { success: false, error: 'User not found' };
        }

        console.log('[Auth] Found user:', friend);

        if (friend.id === currentUserId) {
            return { success: false, error: 'You cannot add yourself as a friend' };
        }

        // 2. Check if already friends
        const { data: existingFriend, error: relError } = await supabase
            .from('friends')
            .select('id')
            .eq('user_id', currentUserId)
            .eq('friend_id', friend.id)
            .maybeSingle();

        if (relError) logError('Existing Relation Check', relError);

        if (existingFriend) {
            console.warn('[Auth] Relationship already exists');
            return { success: false, error: 'This user is already in your circle' };
        }

        // 3. Add to friends table
        console.log('[Auth] Creating friendship relation...');
        const { error: insertError } = await supabase
            .from('friends')
            .insert([{ user_id: currentUserId, friend_id: friend.id }]);

        if (insertError) {
            logError('Friend Insert', insertError);
            if (insertError.code === '23505') {
                return { success: false, error: 'This user is already in your circle' };
            }
            return { success: false, error: insertError.message };
        }

        console.log('[Auth] Friend added successfully!');
        return { success: true, friend };
    } catch (err) {
        console.error('[Auth] Unexpected error adding friend:', err);
        return { success: false, error: 'System error while adding friend' };
    }
};

export const removeFriend = async (currentUserId, friendId) => {
    try {
        const { error } = await supabase
            .from('friends')
            .delete()
            .eq('user_id', currentUserId)
            .eq('friend_id', friendId);

        if (error) {
            logError('Remove Friend', error);
            throw error;
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: 'An error occurred while removing friend' };
    }
};
