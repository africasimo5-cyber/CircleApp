import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { addFriendByUsername, deleteAccount } from '../auth';
import { createCircle, getUsersCircles, inviteToCircle, getCircleMembers } from '../circles';
import { getActiveStories } from '../stories';
import { toggleReaction, subscribeToReactions, getReactionsForMessages } from '../reactions';
import { updateStatusText, updateLastSeen, subscribeToPresence } from '../presence';
import { requestNotificationPermission, showPushNotification, resetUnreadCount } from '../notifications';
import StoriesBar from './StoriesBar';
import StoryViewer from './StoryViewer';
import { Send, RefreshCw, LogOut, Signal, AlertCircle, User, Users, ChevronLeft, Lock, UserPlus, Search, X, Trash2, Plus, Globe, SmilePlus, Bell } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

function Chat({ user, onLogout }) {
    const [messages, setMessages] = useState([]);
    const [friends, setFriends] = useState([]);
    const [circles, setCircles] = useState([]);
    const [viewMode, setViewMode] = useState('friends'); // 'friends' or 'circles'
    const [selectedItem, setSelectedItem] = useState(null); // Either a friend user or a circle object
    const [newMessage, setNewMessage] = useState('');
    const [isConnected, setIsConnected] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingSidebar, setLoadingSidebar] = useState(true);
    const [showSidebar, setShowSidebar] = useState(true);
    const [searchUsername, setSearchUsername] = useState('');
    const [circleName, setCircleName] = useState('');
    const [searchError, setSearchError] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showCreateCircle, setShowCreateCircle] = useState(false);

    // Stories State
    const [allStories, setAllStories] = useState([]); // Grouped by user
    const [activeStoryGroup, setActiveStoryGroup] = useState(null);
    const [circleMemberIds, setCircleMemberIds] = useState([]);

    // Emoji Reactions State
    const [reactions, setReactions] = useState({}); // { messageId: [reaction objects] }
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [showReactionMenuId, setShowReactionMenuId] = useState(null);
    const [reactionDetailsId, setReactionDetailsId] = useState(null);
    const REC_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    // Presence State
    const [onlineUserIds, setOnlineUserIds] = useState([]);
    const [usersPresence, setUsersPresence] = useState({}); // { userId: { status_text, last_seen } }
    const [myStatus, setMyStatus] = useState(user.status_text || '');
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    // Notifications State
    const [unreadCounts, setUnreadCounts] = useState({}); // { chatId: count }
    const [toastNotification, setToastNotification] = useState(null); // { id, senderName, avatarUrl, preview, chatId, chatType }

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const formatLastSeen = (dateString) => {
        if (!dateString) return 'Offline';
        const date = new Date(dateString);
        return `Last seen ${formatDistanceToNow(date, { addSuffix: true })}`;
    };

    useEffect(() => {
        if (messages.length > 0) scrollToBottom();
    }, [messages]);

    // Fetch stories and setup subscription
    const fetchStories = async () => {
        const res = await getActiveStories();
        if (res.success) setAllStories(res.groupedStories);
    };

    useEffect(() => {
        fetchStories();
        const storySub = supabase.channel('stories-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, fetchStories)
            .subscribe();

        return () => supabase.removeChannel(storySub);
    }, []);

    // Filter stories based on context
    const getFilteredStories = () => {
        if (!allStories) return [];
        
        if (viewMode === 'circles' && selectedItem) {
            // Only show stories from members of this circle
            return allStories.filter(group => group.user && circleMemberIds.includes(group.user.id));
        } else if (viewMode === 'friends') {
            // Show stories from yourself and your friends
            const friendIds = friends.map(f => f.id);
            return allStories.filter(group => group.user && (group.user.id === user.id || friendIds.includes(group.user.id)));
        }
        return allStories.filter(group => group.user);
    };

    // Fetch friends/circles based on viewMode
    const fetchData = async () => {
        setLoadingSidebar(true);
        try {
            if (viewMode === 'friends') {
                // 1. Fetch explicit friends
                const { data: friendsData } = await supabase
                    .from('friends')
                    .select('friend_id')
                    .eq('user_id', user.id);

                // 2. Fetch users from message history
                const { data: msgData } = await supabase
                    .from('messages')
                    .select('sender_id, recipient_id')
                    .is('circle_id', null)
                    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

                const contactIds = new Set();
                friendsData?.forEach(f => contactIds.add(f.friend_id));
                msgData?.forEach(m => {
                    if (m.sender_id !== user.id) contactIds.add(m.sender_id);
                    if (m.recipient_id !== user.id) contactIds.add(m.recipient_id);
                });

                if (contactIds.size === 0) {
                    setFriends([]);
                } else {
                    const { data: usersData } = await supabase
                        .from('app_users')
                        .select('id, username, display_name, status_text, last_seen')
                        .in('id', Array.from(contactIds));
                    setFriends(usersData || []);

                    // Sync presence data to a lookup map
                    const presenceMap = {};
                    usersData?.forEach(u => {
                        presenceMap[u.id] = { status_text: u.status_text, last_seen: u.last_seen };
                    });
                    setUsersPresence(prev => ({ ...prev, ...presenceMap }));
                }
            } else {
                const res = await getUsersCircles(user.id);
                if (res.success) setCircles(res.circles);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoadingSidebar(false);
        }
    };

    useEffect(() => {
        fetchData();
        
        // Dynamic subscriptions based on viewMode
        const channel = supabase.channel('sidebar-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members' }, fetchData)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user.id, viewMode]);

    // Presence Subscription
    useEffect(() => {
        requestNotificationPermission();

        const presenceChannel = subscribeToPresence(user, (onlineIds) => {
            setOnlineUserIds(onlineIds);
        });

        // Initialize Unread Counts
        const fetchUnreadCounts = async () => {
            const { data } = await supabase.from('unread_counts').select('chat_id, count').eq('user_id', user.id);
            if (data) {
                const initialCounts = {};
                data.forEach(row => { if (row.count > 0) initialCounts[row.chat_id] = row.count; });
                setUnreadCounts(initialCounts);
            }
        };
        fetchUnreadCounts();

        // Subscribe to unread count updates
        const unreadSub = supabase.channel('unread-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'unread_counts', filter: `user_id=eq.${user.id}` }, (payload) => {
                const record = payload.new;
                if (!record) return;
                setUnreadCounts(prev => {
                    const copy = { ...prev };
                    if (record.count > 0) {
                        copy[record.chat_id] = record.count;
                    } else {
                        delete copy[record.chat_id];
                    }
                    return copy;
                });
            }).subscribe();

        // Universal messages subscription for Toasts & Push
        const messagesSub = supabase.channel('global-messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                const msg = payload.new;
                if (msg.sender_id === user.id) return; // Ignore own messages

                const chatType = msg.circle_id ? 'circles' : 'friends';
                const chatId = msg.circle_id || msg.sender_id;

                // If currently viewing this chat, reset unread instantly
                if (selectedItem && selectedItem.id === chatId && viewMode === chatType) {
                    resetUnreadCount(user.id, chatId, msg.circle_id ? 'circle' : 'direct');
                    return; 
                }

                // Gather details for notification
                let senderName = 'Someone';
                let avatarUrl = null;

                if (msg.circle_id) {
                    const { data: circleData } = await supabase.from('circles').select('name').eq('id', msg.circle_id).single();
                    if (circleData) senderName = `${circleData.name} (Group)`;
                } else {
                    const { data: userData } = await supabase.from('app_users').select('display_name').eq('id', msg.sender_id).single();
                    if (userData) senderName = userData.display_name;
                }

                const title = `New message from ${senderName}`;
                const preview = msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;

                // Trigger push (handled inside function if tab is backgrounded)
                showPushNotification(title, preview, () => {
                    setViewMode(chatType);
                    setSelectedItem({ id: chatId, name: senderName, display_name: senderName }); // Simplistic mock select
                });

                // Show in-app toast
                if (document.visibilityState === 'visible') {
                    setToastNotification({
                        id: msg.id,
                        senderName,
                        preview,
                        chatId,
                        chatType
                    });

                    // Auto-hide toast after 5s
                    setTimeout(() => {
                        setToastNotification(current => current?.id === msg.id ? null : current);
                    }, 5000);
                }
            }).subscribe();

        // Update last seen on mount and occasionally
        updateLastSeen(user.id);
        const interval = setInterval(() => updateLastSeen(user.id), 60000 * 5); // every 5 mins

        return () => {
            clearInterval(interval);
            supabase.removeChannel(presenceChannel);
            supabase.removeChannel(unreadSub);
            supabase.removeChannel(messagesSub);
        };
    }, [user.id, selectedItem, viewMode]);

    // Listen for status updates of others
    useEffect(() => {
        const sub = supabase.channel('presence-db-updates')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_users' }, (payload) => {
                const updatedUser = payload.new;
                setUsersPresence(prev => ({
                    ...prev,
                    [updatedUser.id]: { 
                        status_text: updatedUser.status_text, 
                        last_seen: updatedUser.last_seen 
                    }
                }));
            })
            .subscribe();
        return () => supabase.removeChannel(sub);
    }, []);

    const handleUpdateStatus = async (e) => {
        e.preventDefault();
        setIsUpdatingStatus(true);
        const res = await updateStatusText(user.id, myStatus);
        if (res.success) {
            setShowSettings(false);
        } else {
            alert('Failed to update status');
        }
        setIsUpdatingStatus(false);
    };

    const handleAddFriend = async (e) => {
        e.preventDefault();
        setSearchError('');
        const trimmed = searchUsername.trim();
        if (!trimmed) return;
        setSearchLoading(true);
        const res = await addFriendByUsername(user.id, trimmed);
        if (res.success) {
            setSearchUsername('');
            fetchData();
        } else {
            setSearchError(res.error);
        }
        setSearchLoading(false);
    };

    const handleCreateCircle = async (e) => {
        e.preventDefault();
        const trimmed = circleName.trim();
        if (!trimmed) return;
        setSearchLoading(true);
        const res = await createCircle(user.id, trimmed);
        if (res.success) {
            setCircleName('');
            setShowCreateCircle(false);
            setSelectedItem(res.circle);
            fetchData();
        } else {
            setSearchError(res.error);
        }
        setSearchLoading(false);
    };

    // Messages Subscription Logic
    useEffect(() => {
        if (!selectedItem) {
            setMessages([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const isCircle = viewMode === 'circles';

        const fetchMessages = async () => {
            let query = supabase.from('messages').select('*');
            if (isCircle) {
                query = query.eq('circle_id', selectedItem.id);
            } else {
                query = query.is('circle_id', null).or(`and(sender_id.eq.${user.id},recipient_id.eq.${selectedItem.id}),and(sender_id.eq.${selectedItem.id},recipient_id.eq.${user.id})`);
            }
            const { data, error } = await query.order('created_at', { ascending: true });
            if (!error) setMessages(data);
            setLoading(false);
        };

        fetchMessages();

        const channelId = isCircle ? `circle:${selectedItem.id}` : `private:${user.id}:${selectedItem.id}`;
        const subscription = supabase.channel(channelId)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                const isRelevant = isCircle 
                    ? msg.circle_id === selectedItem.id
                    : (!msg.circle_id && ((msg.sender_id === user.id && msg.recipient_id === selectedItem.id) || (msg.sender_id === selectedItem.id && msg.recipient_id === user.id)));
                
                if (isRelevant) {
                    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
                    
                    // Mark as read if the chat is actively open
                    if (msg.sender_id !== user.id) {
                        resetUnreadCount(user.id, selectedItem.id, isCircle ? 'circle' : 'direct');
                    }
                }
            })
            .subscribe(status => setIsConnected(status === 'SUBSCRIBED'));

        // Reset unread counts whenever a chat is opened
        resetUnreadCount(user.id, selectedItem.id, isCircle ? 'circle' : 'direct');

        return () => supabase.removeChannel(subscription);
    }, [user.id, selectedItem?.id, viewMode]);

    // Fetch and Subscribe to Reactions
    useEffect(() => {
        const msgIds = messages.map(m => m.id);
        if (msgIds.length === 0) {
            setReactions({});
            return;
        }

        getReactionsForMessages(msgIds).then(res => {
            if (res.success) {
                const grouped = {};
                res.reactions.forEach(r => {
                    if (!grouped[r.message_id]) grouped[r.message_id] = [];
                    grouped[r.message_id].push(r);
                });
                setReactions(grouped);
            }
        });
    }, [messages.length, selectedItem?.id]); // Refetch when chat window / lengths change

    useEffect(() => {
        const sub = subscribeToReactions((payload) => {
            const { eventType, new: newRec, old: oldRec } = payload;
            
            setReactions(prev => {
                const copy = { ...prev };
                if (eventType === 'INSERT') {
                    if (!copy[newRec.message_id]) copy[newRec.message_id] = [];
                    // add if it doesn't already exist (dedup)
                    if (!copy[newRec.message_id].some(r => r.id === newRec.id)) {
                        copy[newRec.message_id].push(newRec);
                    }
                } else if (eventType === 'DELETE') {
                    // Remove from all known just in case
                    for (const msgId in copy) {
                        copy[msgId] = copy[msgId].filter(r => r.id !== oldRec.id);
                    }
                }
                return copy;
            });
        });
        return () => supabase.removeChannel(sub);
    }, []);

    const handleEmojiSelect = async (msgId, emoji) => {
        setShowReactionMenuId(null);
        await toggleReaction(msgId, user.id, emoji);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedItem) return;

        const content = newMessage.trim();
        const isCircle = viewMode === 'circles';
        const tempId = crypto.randomUUID();

        const optimisticMsg = {
            id: tempId,
            content,
            sender_id: user.id,
            recipient_id: isCircle ? null : selectedItem.id,
            circle_id: isCircle ? selectedItem.id : null,
            created_at: new Date().toISOString(),
            status: 'sending'
        };

        setMessages(prev => [...prev, optimisticMsg]);
        setNewMessage('');

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert([{
                    content,
                    sender_id: user.id,
                    recipient_id: isCircle ? null : selectedItem.id,
                    circle_id: isCircle ? selectedItem.id : null
                }])
                .select();

            if (error) throw error;
            setMessages(prev => prev.map(m => m.id === tempId ? data[0] : m));
        } catch (error) {
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
        }
    };

    const [circleMembers, setCircleMembers] = useState({}); // {userId: {username, display_name}}
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Fetch circle members when selectedItem changes (if it's a circle)
    useEffect(() => {
        if (viewMode === 'circles' && selectedItem) {
            const fetchMembers = async () => {
                const res = await getCircleMembers(selectedItem.id);
                if (res.success) {
                    const memberMap = {};
                    res.members.forEach(m => memberMap[m.id] = m);
                    setCircleMembers(memberMap);
                    setCircleMemberIds(res.members.map(m => m.id));
                }
            };
            fetchMembers();
        } else {
            setCircleMembers({});
            setCircleMemberIds([]);
        }
    }, [selectedItem?.id, viewMode]);

    const handleInviteFriend = async (friendId) => {
        const res = await inviteToCircle(selectedItem.id, friendId);
        if (res.success) {
            // Refresh members
            const mRes = await getCircleMembers(selectedItem.id);
            if (mRes.success) {
                const memberMap = {};
                mRes.members.forEach(m => memberMap[m.id] = m);
                setCircleMembers(memberMap);
            }
        } else {
            alert(res.error);
        }
    };

    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteAccount = async () => {
        if (!window.confirm('Are you absolutely sure you want to delete your account? This action cannot be undone and will permanently delete all your messages, friends, circles, and stories.')) {
            return;
        }
        
        setIsDeleting(true);
        const res = await deleteAccount(user.id);
        if (res.success) {
            onLogout(); // This will redirect to login page
        } else {
            alert('Failed to delete account: ' + res.error);
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-1 w-full h-full min-h-0 bg-slate-950 overflow-hidden select-none">
            {/* Sidebar */}
            <aside className={`
                ${selectedItem ? 'hidden lg:flex' : 'flex'} 
                lg:flex fixed lg:static inset-0 z-30 w-full lg:w-80 bg-slate-900/95 backdrop-blur-2xl border-r border-slate-800 flex-col min-h-0 overflow-hidden
            `}>
                <header className="p-6 border-b border-slate-800/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-2.5 rounded-2xl text-blue-500">
                                <Globe size={22} className="animate-pulse" />
                            </div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Circle</h2>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setShowSettings(!showSettings); setShowCreateCircle(false); setShowInviteModal(false); }} className={`p-2 rounded-xl transition-all ${showSettings ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                                <User size={20} />
                            </button>
                        </div>
                    </div>

                    {/* View Switcher */}
                    <div className="flex p-1 bg-slate-800/50 rounded-2xl mb-6">
                        <button 
                            onClick={() => { setViewMode('friends'); setSelectedItem(null); setShowSettings(false); setShowCreateCircle(false); setShowInviteModal(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'friends' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <User size={14} /> Friends
                        </button>
                        <button 
                            onClick={() => { setViewMode('circles'); setSelectedItem(null); setShowSettings(false); setShowCreateCircle(false); setShowInviteModal(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'circles' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Users size={14} /> Circles
                        </button>
                    </div>

                    {!showSettings && !showCreateCircle && (
                        <div className="flex items-center justify-between px-1 mb-4">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{viewMode}</h3>
                            {viewMode === 'circles' && (
                                <button onClick={() => setShowCreateCircle(true)} className="p-1 px-2 bg-blue-600/10 text-blue-500 rounded-lg text-xs font-bold hover:bg-blue-600/20 transition-all flex items-center gap-1">
                                    <Plus size={12} /> New
                                </button>
                            )}
                        </div>
                    )}

                    {!showSettings && !showCreateCircle && viewMode === 'friends' && (
                        <form onSubmit={handleAddFriend} className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500" size={18} />
                            <input
                                type="text"
                                value={searchUsername}
                                onChange={(e) => setSearchUsername(e.target.value)}
                                placeholder="Add by username..."
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-3 pl-11 pr-12 text-sm text-slate-200 outline-none focus:border-blue-500/50 transition-all"
                            />
                            {searchError && <p className="text-[10px] text-red-400 mt-2 ml-2 flex items-center gap-1"><AlertCircle size={10} /> {searchError}</p>}
                        </form>
                    )}

                    {showCreateCircle && (
                        <form onSubmit={handleCreateCircle} className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30 animate-slide-up">
                            <h3 className="text-xs font-bold text-slate-100 mb-3 uppercase tracking-wider">Start a new Circle</h3>
                            <input 
                                type="text" 
                                value={circleName} 
                                onChange={(e) => setCircleName(e.target.value)}
                                placeholder="Circle name..."
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:border-blue-500/50 mb-3"
                                autoFocus
                            />
                            <div className="flex items-center gap-2 mb-4">
                                <label className="flex-1 flex items-center justify-center gap-2 p-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-[10px] font-bold text-slate-400 cursor-pointer hover:border-blue-500/50 transition-all">
                                    <Globe size={12} />
                                    <span>Add Photo</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                        // Simplified: logic for circle photo upload would go here
                                        console.log('Circle photo selected:', e.target.files[0]);
                                    }} />
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-500">Create</button>
                                <button type="button" onClick={() => setShowCreateCircle(false)} className="px-3 py-2 bg-slate-700 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
                            </div>
                        </form>
                    )}

                    {showSettings && (
                        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30 animate-slide-up space-y-2">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{user.display_name.charAt(0)}</div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-100 truncate">{user.display_name}</p>
                                    <p className="text-[11px] text-slate-500 truncate">@{user.username}</p>
                                </div>
                            </div>
                            
                            <form onSubmit={handleUpdateStatus} className="space-y-2 mb-4">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">My Status</p>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={myStatus}
                                        onChange={(e) => setMyStatus(e.target.value)}
                                        placeholder="What's on your mind?..."
                                        className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:border-blue-500/50"
                                    />
                                    <button 
                                        type="submit" 
                                        disabled={isUpdatingStatus}
                                        className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-500 disabled:opacity-50"
                                    >
                                        {isUpdatingStatus ? '...' : 'Save'}
                                    </button>
                                </div>
                            </form>

                            <button onClick={onLogout} className="w-full flex items-center justify-center gap-3 p-3 bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600/50 rounded-xl text-sm font-bold transition-all">
                                <LogOut size={16} /> Logout
                            </button>
                            <button 
                                onClick={handleDeleteAccount} 
                                disabled={isDeleting}
                                className="w-full flex items-center justify-center gap-3 p-3 bg-red-950/30 text-red-500 hover:bg-red-900/50 hover:text-red-400 border border-red-900/50 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                            >
                                {isDeleting ? (
                                    <><RefreshCw size={14} className="animate-spin" /> Deleting...</>
                                ) : (
                                    <><Trash2 size={14} /> Delete Account</>
                                )}
                            </button>
                        </div>
                    )}
                </header>

                <nav className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar min-h-0">
                    {loadingSidebar ? (
                        <div className="flex justify-center py-10"><RefreshCw size={24} className="animate-spin text-slate-700" /></div>
                    ) : viewMode === 'friends' ? (
                        friends.length === 0 ? (
                            <p className="text-center text-xs text-slate-600 py-10 italic">No friends found. Add some!</p>
                        ) : friends.map(u => {
                            const hasStory = (allStories || []).some(g => g.user && g.user.id === u.id);
                            return (
                                <button
                                    key={u.id}
                                    onClick={() => { setSelectedItem(u); setShowSidebar(false); }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedItem?.id === u.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800/50'}`}
                                >
                                    <div className="relative">
                                        <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold relative z-10 ${selectedItem?.id === u.id ? 'bg-white/20' : 'bg-slate-800'}`}>
                                            {u.display_name.charAt(0)}
                                        </div>
                                        {hasStory && (
                                            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-blue-600 to-purple-500 animate-pulse" />
                                        )}
                                        {onlineUserIds.includes(u.id) && (
                                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full z-20" />
                                        )}
                                        {unreadCounts[u.id] && (
                                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-slate-900 z-30 animate-scale-in">
                                                {unreadCounts[u.id] > 99 ? '99+' : unreadCounts[u.id]}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-left min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm truncate ${unreadCounts[u.id] ? 'font-black text-white' : 'font-bold'}`}>{u.display_name}</p>
                                            {onlineUserIds.includes(u.id) ? (
                                                <span className="text-[9px] font-bold text-green-500 uppercase tracking-tighter">Online</span>
                                            ) : (
                                                <span className="text-[9px] text-slate-600 truncate ml-2">{formatLastSeen(usersPresence[u.id]?.last_seen)}</span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                            {usersPresence[u.id]?.status_text ? (
                                                <span className="text-slate-300 italic">"{usersPresence[u.id].status_text}"</span>
                                            ) : (
                                                `@${u.username}`
                                            )}
                                        </p>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        circles.length === 0 ? (
                            <p className="text-center text-xs text-slate-600 py-10 italic">You aren't in any circles. Create one!</p>
                        ) : circles.map(c => (
                            <button
                                key={c.id}
                                onClick={() => { setSelectedItem(c); setShowSidebar(false); }}
                                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedItem?.id === c.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800/50'}`}
                            >
                                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold relative ${selectedItem?.id === c.id ? 'bg-white/20' : 'bg-slate-800'}`}>
                                    {c.photo_url ? <img src={c.photo_url} className="w-full h-full rounded-full object-cover" /> : c.name.charAt(0)}
                                    {unreadCounts[c.id] && (
                                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-slate-900 z-30 animate-scale-in">
                                            {unreadCounts[c.id] > 99 ? '99+' : unreadCounts[c.id]}
                                        </div>
                                    )}
                                </div>
                                <div className="text-left min-w-0">
                                    <p className={`text-sm truncate ${unreadCounts[c.id] ? 'font-black text-white' : 'font-bold'}`}>{c.name}</p>
                                    <p className={`text-[11px] ${selectedItem?.id === c.id ? 'text-blue-100' : 'text-slate-500'}`}>Group Chat</p>
                                </div>
                            </button>
                        ))
                    )}
                </nav>
            </aside>

            {/* Chat Area */}
            <main className={`
                ${selectedItem ? 'flex' : 'hidden lg:flex'} 
                flex-1 flex-col relative h-full overflow-hidden min-h-0 bg-slate-950
            `}>
                <header className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 p-4 h-[72px] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedItem(null)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-all">
                            <ChevronLeft size={24} />
                        </button>
                        {selectedItem ? (
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                                        {viewMode === 'friends' ? selectedItem.display_name.charAt(0) : (selectedItem.photo_url ? <img src={selectedItem.photo_url} className="w-full h-full rounded-full object-cover" /> : selectedItem.name.charAt(0))}
                                    </div>
                                    {viewMode === 'friends' && onlineUserIds.includes(selectedItem.id) && (
                                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-900 rounded-full z-20" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h1 className="font-bold text-slate-100 leading-tight truncate">{viewMode === 'friends' ? selectedItem.display_name : selectedItem.name}</h1>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{viewMode === 'friends' ? 'Private' : 'Circle'}</span>
                                        {viewMode === 'friends' && (
                                            <>
                                                <span className="text-slate-700">•</span>
                                                <span className="text-[10px] font-medium text-slate-400 truncate">
                                                    {onlineUserIds.includes(selectedItem.id) 
                                                        ? (usersPresence[selectedItem.id]?.status_text || 'Online') 
                                                        : formatLastSeen(usersPresence[selectedItem.id]?.last_seen)
                                                    }
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-slate-500"><Signal size={20} /> <span className="font-medium">Pick a {viewMode === 'friends' ? 'friend' : 'circle'} to start</span></div>
                        )}
                    </div>

                    {viewMode === 'circles' && selectedItem && (
                        <button 
                            onClick={() => setShowInviteModal(!showInviteModal)}
                            className="bg-slate-800 text-slate-300 p-2.5 rounded-xl hover:bg-slate-700 transition-all flex items-center gap-2 text-xs font-bold"
                        >
                            <UserPlus size={18} /> <span className="hidden sm:inline">Invite</span>
                        </button>
                    )}
                </header>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {/* Stories Bar */}
                    <div className="flex-shrink-0">
                        <StoriesBar 
                            user={user} 
                            userStories={getFilteredStories()} 
                            onStoryClick={setActiveStoryGroup} 
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 custom-scrollbar min-h-0">
                    {loading ? (
                        <div className="flex-1 flex justify-center items-center"><RefreshCw size={24} className="animate-spin text-slate-700" /></div>
                    ) : messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-20"><Users size={64} /> <p className="text-sm font-bold mt-4">Start the conversation</p></div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isMe = msg.sender_id === user.id;
                            const showTime = idx === 0 || new Date(msg.created_at).getTime() - new Date(messages[idx-1].created_at).getTime() > 300000;
                            const senderDetails = circleMembers[msg.sender_id];
                            const msgReactions = reactions[msg.id] || [];

                            return (
                                <div 
                                    key={msg.id} 
                                    className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up mb-2`}
                                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                                    onMouseLeave={() => setHoveredMessageId(null)}
                                >
                                    <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}>
                                        {showTime && <span className="text-[10px] text-slate-600 mb-2 font-bold uppercase tracking-widest">{format(new Date(msg.created_at), 'HH:mm')}</span>}
                                        
                                        <div className="relative group flex items-center">
                                            {/* Left Reaction Picker (if isMe) */}
                                            {isMe && (hoveredMessageId === msg.id || showReactionMenuId === msg.id) && (
                                                <div className="mr-2 hidden sm:flex relative">
                                                    <button 
                                                        onClick={() => setShowReactionMenuId(showReactionMenuId === msg.id ? null : msg.id)}
                                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-all border border-slate-700/50 shadow-lg"
                                                    >
                                                        <SmilePlus size={16} />
                                                    </button>
                                                    
                                                    {showReactionMenuId === msg.id && (
                                                        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 z-40 bg-slate-800 border border-slate-700 rounded-full p-2 flex gap-1 shadow-xl animate-fade-in">
                                                            {REC_EMOJIS.map(emoji => (
                                                                <button key={emoji} onClick={() => handleEmojiSelect(msg.id, emoji)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded-full text-lg transition-all">{emoji}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className={`p-4 rounded-3xl relative ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                                                {!isMe && viewMode === 'circles' && (
                                                    <p className="text-[10px] font-bold text-blue-400 mb-1 uppercase tracking-tighter">
                                                        {senderDetails ? senderDetails.display_name : 'User'}
                                                    </p>
                                                )}
                                                <p className="text-sm leading-relaxed">{msg.content}</p>
                                            </div>

                                            {/* Right Reaction Picker (if !isMe) */}
                                            {!isMe && (hoveredMessageId === msg.id || showReactionMenuId === msg.id) && (
                                                <div className="ml-2 hidden sm:flex relative">
                                                    <button 
                                                        onClick={() => setShowReactionMenuId(showReactionMenuId === msg.id ? null : msg.id)}
                                                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-all border border-slate-700/50 shadow-lg"
                                                    >
                                                        <SmilePlus size={16} />
                                                    </button>
                                                    
                                                    {showReactionMenuId === msg.id && (
                                                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-40 bg-slate-800 border border-slate-700 rounded-full p-2 flex gap-1 shadow-xl animate-fade-in">
                                                            {REC_EMOJIS.map(emoji => (
                                                                <button key={emoji} onClick={() => handleEmojiSelect(msg.id, emoji)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded-full text-lg transition-all">{emoji}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Reaction Pill */}
                                        {msgReactions.length > 0 && (
                                            <div 
                                                onClick={() => setReactionDetailsId(msg.id)}
                                                className={`mt-1 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-full px-2 py-1 flex gap-1 items-center cursor-pointer shadow-sm select-none transition-all ${isMe ? 'self-end' : 'self-start'} z-10 -m-2`}
                                            >
                                                {Array.from(new Set(msgReactions.map(r => r.emoji))).slice(0, 3).map(e => (
                                                    <span key={e} className="text-[11px]">{e}</span>
                                                ))}
                                                <span className="text-slate-400 font-bold text-[10px] ml-0.5">{msgReactions.length}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {selectedItem && (
                    <div className="p-4 sm:p-6 bg-slate-950 border-t border-slate-900 flex-shrink-0">
                        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-4">
                            <input 
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Write a message..."
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-slate-100 outline-none focus:border-blue-600 transition-all font-medium"
                            />
                            <button type="submit" className="bg-blue-600 text-white p-4 rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-900/20 active:scale-95 transition-all"><Send size={22} /></button>
                        </form>
                    </div>
                )}

                {/* Invite Modal */}
                {showInviteModal && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[32px] p-8 animate-slide-up shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-white">Invite Friends</h2>
                                <button onClick={() => setShowInviteModal(false)} className="text-slate-500 hover:text-white transition-all"><X size={24} /></button>
                            </div>
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                {friends.length === 0 ? (
                                    <p className="text-center text-sm text-slate-500 py-6">No friends to invite.</p>
                                ) : friends.map(f => {
                                    const isAlreadyMember = circleMembers[f.id];
                                    return (
                                        <div key={f.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-2xl">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-500 flex items-center justify-center font-bold text-xs">{f.display_name.charAt(0)}</div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-200 truncate">{f.display_name}</p>
                                                    <p className="text-[10px] text-slate-500">@{f.username}</p>
                                                </div>
                                            </div>
                                            {isAlreadyMember ? (
                                                <span className="text-[10px] font-bold text-slate-600 uppercase">Joined</span>
                                            ) : (
                                                <button onClick={() => handleInviteFriend(f.id)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500 transition-all">Invite</button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Reaction Details Modal */}
                {reactionDetailsId && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setReactionDetailsId(null)}>
                        <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[32px] p-6 animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold text-white">Reactions</h2>
                                <button onClick={() => setReactionDetailsId(null)} className="text-slate-500 hover:text-white transition-all"><X size={20} /></button>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                {(reactions[reactionDetailsId] || []).map(r => {
                                    const reactUser = r.app_users || (r.user_id === user.id ? user : (circleMembers[r.user_id] || friends.find(f => f.id === r.user_id) || { display_name: 'Unknown User', username: 'unknown' }));
                                    return (
                                        <div key={r.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-2xl">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-500 flex items-center justify-center font-bold text-xs">{reactUser?.display_name?.charAt(0) || '?'}</div>
                                                <p className="text-sm font-bold text-slate-200">{reactUser?.display_name || 'Unknown User'}</p>
                                            </div>
                                            <span className="text-xl">{r.emoji}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Story Viewer Modal */}
                {activeStoryGroup && (
                    <StoryViewer 
                        group={activeStoryGroup} 
                        user={user}
                        onClose={() => setActiveStoryGroup(null)} 
                    />
                )}
            </main>
            {/* In-App Toast Notification */}
            {toastNotification && (
                <div 
                    onClick={() => {
                        setViewMode(toastNotification.chatType);
                        setSelectedItem({ id: toastNotification.chatId, name: toastNotification.senderName, display_name: toastNotification.senderName });
                        setToastNotification(null);
                    }}
                    className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] cursor-pointer animate-slide-up hover:scale-105 transition-transform"
                >
                    <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px] max-w-sm">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-600 text-white font-bold text-lg flex-shrink-0 relative">
                            {toastNotification.senderName.charAt(0)}
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-800 flex items-center justify-center">
                                <Bell size={8} className="text-white" />
                            </div>
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-bold text-white truncate">{toastNotification.senderName}</p>
                            <p className="text-xs text-slate-300 truncate">{toastNotification.preview}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setToastNotification(null); }} className="text-slate-500 hover:text-white p-1">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;
