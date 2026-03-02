import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { login, signup, addFriendByUsername, removeFriend, deleteAccount, clearSession } from '../auth';
import { Send, RefreshCw, LogOut, Signal, AlertCircle, User, Users, ChevronLeft, Lock, UserPlus, Search, X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

function Chat({ user, onLogout }) {
    const [messages, setMessages] = useState([]);
    const [friends, setFriends] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [isConnected, setIsConnected] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [showSidebar, setShowSidebar] = useState(true);
    const [searchUsername, setSearchUsername] = useState('');
    const [searchError, setSearchError] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Logging for state changes
    useEffect(() => {
        console.log('--- Circle State Update ---');
        console.log('Current User:', user.username, `(${user.id})`);
        console.log('Friends in state:', friends);
    }, [friends, user]);

    useEffect(() => {
        if (messages.length > 0) scrollToBottom();
    }, [messages]);

    // Fetch friends and message contacts
    useEffect(() => {
        const fetchContacts = async () => {
            setLoadingFriends(true);
            try {
                // 1. Fetch explicit friends
                const { data: friendsData, error: friendsError } = await supabase
                    .from('friends')
                    .select('friend_id')
                    .eq('user_id', user.id);

                // 2. Fetch users from message history
                const { data: msgData, error: msgError } = await supabase
                    .from('messages')
                    .select('sender_id, recipient_id')
                    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

                if (friendsError) console.error('Friends fetch error:', friendsError);
                if (msgError) console.error('Messages fetch error:', msgError);

                // 3. Extract unique IDs
                const contactIds = new Set();
                friendsData?.forEach(f => contactIds.add(f.friend_id));
                msgData?.forEach(m => {
                    if (m.sender_id !== user.id) contactIds.add(m.sender_id);
                    if (m.recipient_id !== user.id) contactIds.add(m.recipient_id);
                });

                if (contactIds.size === 0) {
                    setFriends([]);
                    setLoadingFriends(false);
                    return;
                }

                // 4. Fetch user details for all unique IDs
                const { data: usersData, error: usersError } = await supabase
                    .from('app_users')
                    .select('id, username, display_name')
                    .in('id', Array.from(contactIds));

                if (usersError) {
                    console.error('Users fetch error:', usersError);
                } else {
                    setFriends(usersData || []);
                }
            } catch (err) {
                console.error('General fetchContacts error:', err);
            } finally {
                setLoadingFriends(false);
            }
        };

        fetchContacts();

        // Subscribe to changes in friends table
        const friendSubscription = supabase
            .channel('public:friends_updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friends',
                filter: `user_id=eq.${user.id}`
            }, () => fetchContacts())
            .subscribe();

        // Subscribe to ANY incoming messages to catch new contacts
        const globalMessageSubscription = supabase
            .channel('public:messages_discovery')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `recipient_id=eq.${user.id}`
            }, (payload) => {
                const senderId = payload.new.sender_id;
                // If sender isn't in our current list, refresh
                setFriends(prev => {
                    if (!prev.some(u => u.id === senderId)) {
                        fetchContacts();
                    }
                    return prev;
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(friendSubscription);
            supabase.removeChannel(globalMessageSubscription);
        };
    }, [user.id]);

    const handleAddFriend = async (e) => {
        if (e) e.preventDefault();
        setSearchError('');
        const trimmedUsername = searchUsername.trim();

        console.log('[Circle] Add friend trigger. Input:', `"${trimmedUsername}"`);
        if (!trimmedUsername) {
            console.warn('[Circle] Empty username, skipping');
            return;
        }

        setSearchLoading(true);
        try {
            const result = await addFriendByUsername(user.id, trimmedUsername);
            console.log('[Circle] Add result:', result);

            if (result.success) {
                console.log('[Circle] Friend added successfully. Clearing input.');
                setSearchUsername('');
                // fetchFriends will be triggered by subscription or manual refresh
            } else {
                setSearchError(result.error);
            }
        } catch (err) {
            console.error('[Circle] Error in handleAddFriend:', err);
            setSearchError('A system error occurred.');
        } finally {
            setSearchLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (window.confirm('Are you sure you want to delete your account? This action is permanent and all messages will be lost.')) {
            const result = await deleteAccount(user.id);
            if (result.success) {
                onLogout();
            } else {
                alert(result.error);
            }
        }
    };

    // Fetch messages for selected conversation
    useEffect(() => {
        if (!selectedUser) {
            setMessages([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},recipient_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},recipient_id.eq.${user.id})`)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching messages:', error);
            } else {
                setMessages(data);
            }
            setLoading(false);
        };

        fetchMessages();

        // Subscribe to private messages between these two users
        const subscription = supabase
            .channel(`private:${user.id}:${selectedUser.id}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages'
                },
                (payload) => {
                    const incomingMsg = payload.new;

                    // Only care if it's between current user and selected user
                    const isRelevant = (incomingMsg.sender_id === user.id && incomingMsg.recipient_id === selectedUser.id) ||
                        (incomingMsg.sender_id === selectedUser.id && incomingMsg.recipient_id === user.id);

                    if (!isRelevant) return;

                    setMessages((prev) => {
                        if (prev.some(m => m.id === incomingMsg.id)) return prev;

                        // Avoid flicker for messages I sent (optimistic UI already handled it)
                        if (incomingMsg.sender_id === user.id) {
                            const optimisticMatch = prev.find(m =>
                                m.status === 'sending' &&
                                m.content === incomingMsg.content
                            );
                            if (optimisticMatch) return prev;
                        }

                        return [...prev, incomingMsg];
                    });
                }
            )
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user.id, selectedUser?.id]);

    useEffect(() => {
        const handleOnline = () => setIsConnected(true);
        const handleOffline = () => setIsConnected(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedUser) return;

        const content = newMessage.trim();
        const tempId = crypto.randomUUID();

        // Optimistic Update
        const optimisticMsg = {
            id: tempId,
            content,
            sender_id: user.id,
            recipient_id: selectedUser.id,
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
                    recipient_id: selectedUser.id
                }])
                .select();

            if (error) throw error;

            const realMsg = data[0];
            setMessages(prev => prev.map(m => m.id === tempId ? realMsg : m));

        } catch (error) {
            console.error('Send error:', error);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
        }
    };

    const handleRetry = async (msg) => {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sending' } : m));

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert([{
                    content: msg.content,
                    sender_id: user.id,
                    recipient_id: msg.recipient_id
                }])
                .select();

            if (error) throw error;

            const realMsg = data[0];
            setMessages(prev => prev.map(m => m.id === msg.id ? realMsg : m));

        } catch (err) {
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'error' } : m));
        }
    };

    return (
        <div className="flex h-full bg-slate-950 overflow-hidden">
            {/* User Sidebar */}
            <aside className={`${showSidebar ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-30 w-80 bg-slate-900/95 backdrop-blur-2xl border-r border-slate-800 transition-transform duration-300 ease-in-out flex flex-col`}>
                <header className="p-6 border-b border-slate-800/50">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-2.5 rounded-2xl text-blue-500 shadow-lg shadow-blue-500/10">
                                <Users size={22} />
                            </div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Circle</h2>
                        </div>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-2 rounded-xl transition-all ${showSettings ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                        >
                            <User size={20} />
                        </button>
                    </div>

                    {!showSettings ? (
                        <form onSubmit={handleAddFriend} className="relative group animate-fade-in">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input
                                type="text"
                                value={searchUsername}
                                onChange={(e) => setSearchUsername(e.target.value)}
                                placeholder="Add by username..."
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-3 pl-11 pr-12 text-sm text-slate-200 outline-none focus:border-blue-500/50 focus:bg-slate-800 transition-all placeholder:text-slate-600"
                            />
                            <button
                                type="submit"
                                disabled={searchLoading || !searchUsername.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 rounded-xl text-white hover:bg-blue-500 transition-all disabled:opacity-0 disabled:scale-90"
                            >
                                <UserPlus size={14} />
                            </button>
                            {searchError && (
                                <p className="text-[10px] text-red-400 mt-2 ml-2 font-medium flex items-center gap-1">
                                    <AlertCircle size={10} /> {searchError}
                                </p>
                            )}
                        </form>
                    ) : (
                        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30 animate-slide-up">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
                                    {user.display_name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-100 truncate">{user.display_name}</p>
                                    <p className="text-[11px] text-slate-500 truncate">@{user.username}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <button onClick={onLogout} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-all text-sm font-medium">
                                    <LogOut size={16} /> Logout
                                </button>
                                <button
                                    onClick={handleDeleteAccount}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl text-red-500/70 hover:bg-red-500/10 hover:text-red-400 transition-all text-sm font-medium"
                                >
                                    <Trash2 size={16} /> Delete Account
                                </button>
                                <div className="pt-2 border-t border-slate-700/50 mt-2 space-y-2">
                                </div>
                            </div>
                        </div>
                    )}
                </header>

                <nav className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    <div className="flex items-center justify-between px-2 pb-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your Friends ({friends.length}/5)</p>
                    </div>

                    {loadingFriends ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-40">
                            <RefreshCw size={24} className="animate-spin text-blue-500" />
                            <p className="text-xs font-medium text-slate-500">Loading circle...</p>
                        </div>
                    ) : friends.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4 animate-fade-in">
                            <div className="bg-slate-800/50 p-4 rounded-3xl text-slate-600">
                                <UserPlus size={32} strokeWidth={1.5} />
                            </div>
                            <p className="text-xs font-medium text-slate-500 leading-relaxed italic">
                                Search above to add friends to your private circle
                            </p>
                        </div>
                    ) : (
                        friends.map(u => (
                            <button
                                key={u.id}
                                onClick={() => {
                                    setSelectedUser(u);
                                    setShowSidebar(false);
                                }}
                                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 group
                                    ${selectedUser?.id === u.id
                                        ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20'
                                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'}
                                `}
                            >
                                <div className={`relative w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shadow-md transition-transform duration-300 group-hover:scale-105
                                    ${selectedUser?.id === u.id ? 'bg-white/20' : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'}
                                `}>
                                    {u.display_name.charAt(0)}
                                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                                </div>
                                <div className="text-left min-w-0 flex-1">
                                    <p className={`text-sm font-bold truncate ${selectedUser?.id === u.id ? 'text-white' : 'text-slate-200'}`}>{u.display_name}</p>
                                    <p className={`text-[11px] truncate ${selectedUser?.id === u.id ? 'text-blue-100' : 'text-slate-500'}`}>@{u.username}</p>
                                </div>
                            </button>
                        ))
                    )}
                </nav>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col relative">
                {/* Mobile Overlay */}
                {showSidebar && <div onClick={() => setShowSidebar(false)} className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-20 animate-fade-in" />}

                {/* Header */}
                <header className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 p-4 h-[72px] flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowSidebar(true)} className="lg:hidden p-2 text-slate-400 hover:bg-slate-800 rounded-xl">
                            <ChevronLeft size={24} />
                        </button>
                        {selectedUser ? (
                            <div className="flex items-center gap-3 animate-fade-in">
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                                    {selectedUser.display_name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <h1 className="font-bold text-slate-100 leading-tight truncate">{selectedUser.display_name}</h1>
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'} shadow-[0_0_5px_rgba(16,185,129,0.5)]`}></div>
                                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{isConnected ? 'Secure Line' : 'Offline'}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-slate-500">
                                <Signal size={20} />
                                <span className="font-medium">Pick a friend to start chatting</span>
                            </div>
                        )}
                    </div>
                </header>

                {/* Offline Banner */}
                {!isConnected && (
                    <div className="bg-red-500 text-white text-[10px] font-bold text-center py-1 absolute top-[72px] w-full z-20 tracking-widest uppercase">
                        Connection Lost - Reconnecting...
                    </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 custom-scrollbar">
                    {!selectedUser ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4 animate-fade-in">
                            <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800/50 shadow-2xl">
                                <Users size={64} className="opacity-20 mb-4 mx-auto" strokeWidth={1} />
                                <p className="text-center text-sm font-medium max-w-[200px]">Select a contact from the circle to start a private encrypted conversation.</p>
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="flex-1 flex justify-center items-center text-slate-500 gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-blue-100 rounded-full animate-bounce"></div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50">
                            <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-slate-800 flex items-center justify-center">
                                <Send size={24} />
                            </div>
                            <p className="text-sm font-medium">Say hello to {selectedUser.display_name}!</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isMe = msg.sender_id === user.id;
                            const showTime = idx === 0 ||
                                new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 300000;

                            return (
                                <React.Fragment key={msg.id}>
                                    {showTime && (
                                        <div className="flex justify-center my-2">
                                            <span className="bg-slate-900/50 text-slate-500 text-[10px] px-3 py-1 rounded-full border border-slate-800/50 font-medium">
                                                {format(new Date(msg.created_at), 'MMMM d, HH:mm')}
                                            </span>
                                        </div>
                                    )}
                                    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                                        <div className="relative flex flex-col max-w-[85%] sm:max-w-[70%]">
                                            <div className={`rounded-[22px] p-3.5 px-5 shadow-lg relative transition-all duration-200
                                                ${isMe
                                                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-[4px] shadow-blue-900/20'
                                                    : 'bg-slate-800 text-slate-100 rounded-tl-[4px] shadow-black/20'}
                                                ${msg.status === 'sending' ? 'opacity-70 saturate-50' : ''}
                                                ${msg.status === 'error' ? 'ring-1 ring-red-500/50 bg-red-900/20' : ''}
                                            `}>
                                                <p className="text-[15px] leading-relaxed break-words font-medium tracking-tight">{msg.content}</p>
                                                <div className={`text-[10px] mt-1.5 flex items-center justify-end gap-1.5 font-bold uppercase tracking-widest opacity-60
                                                    ${isMe ? 'text-blue-100' : 'text-slate-400'}
                                                `}>
                                                    {msg.status === 'sending' ? (
                                                        <RefreshCw size={10} className="animate-spin" />
                                                    ) : msg.status === 'error' ? (
                                                        <span className="text-red-400 flex items-center gap-1"><AlertCircle size={10} /> Fail</span>
                                                    ) : (
                                                        format(new Date(msg.created_at), 'HH:mm')
                                                    )}
                                                </div>

                                                {/* Retry Action */}
                                                {msg.status === 'error' && (
                                                    <button onClick={() => handleRetry(msg)} className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 bg-slate-900 border border-slate-800 rounded-full text-blue-400 hover:text-white hover:bg-blue-600 transition-all shadow-xl">
                                                        <RefreshCw size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                {selectedUser && (
                    <div className="bg-slate-900/90 backdrop-blur-md p-4 sm:p-6 border-t border-slate-800">
                        <form onSubmit={handleSendMessage} className="flex gap-4 items-center max-w-4xl mx-auto">
                            <div className="flex-1 relative group">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={`Message ${selectedUser.display_name}...`}
                                    className="w-full bg-slate-800/40 text-slate-100 placeholder:text-slate-600 rounded-2xl px-6 py-4 outline-none border border-slate-700/50 focus:border-blue-500/50 focus:bg-slate-800 transition-all font-medium text-sm lg:text-base pr-12"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500/50 transition-colors pointer-events-none">
                                    <Lock size={16} />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={!newMessage.trim() || !isConnected}
                                className="bg-blue-600 text-white p-4 rounded-2xl hover:bg-blue-500 disabled:opacity-20 disabled:grayscale transition-all active:scale-90 shadow-xl shadow-blue-900/40"
                            >
                                <Send size={22} />
                            </button>
                        </form>
                    </div>
                )}
            </main>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.2); }
            `}} />
        </div>
    );
}

export default Chat;
