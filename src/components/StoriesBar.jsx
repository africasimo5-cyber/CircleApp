import React, { useState, useRef } from 'react';
import { Plus, Play, Eye, X } from 'lucide-react';
import { uploadStory } from '../stories';

function StoriesBar({ user, userStories, onStoryClick }) {
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const res = await uploadStory(user.id, file);
        if (res.success) {
            // The subscription in Chat.jsx will handle the UI update
            console.log('Story uploaded!');
        } else {
            alert(res.error);
        }
        setUploading(false);
    };

    return (
        <div className="flex items-center gap-4 p-4 py-6 bg-slate-900/40 border-b border-slate-800 overflow-x-auto no-scrollbar scroll-smooth">
            {/* My Story Add Button */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group" onClick={() => fileInputRef.current.click()}>
                <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 group-hover:border-blue-500 group-hover:text-blue-500 transition-all">
                        {uploading ? (
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Plus size={24} />
                        )}
                    </div>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add Story</span>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*,video/*" 
                    className="hidden" 
                />
            </div>

            {/* Other Users' Stories */}
            {userStories.map((group, idx) => {
                if (!group.user) return null;
                return (
                    <div 
                        key={group.user.id} 
                        className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer animate-fade-in"
                        onClick={() => onStoryClick(group)}
                    >
                        <div className="relative group">
                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-600 via-purple-500 to-pink-500 p-[2px] animate-spin-slow">
                                <div className="w-full h-full rounded-full bg-slate-950 p-[2px]">
                                    <div className="w-full h-full rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                                        {group.user.display_name.charAt(0)}
                                    </div>
                                </div>
                            </div>
                            {group.stories.some(s => s.type === 'video') && (
                                <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700 p-1 rounded-full text-blue-500">
                                    <Play size={10} fill="currentColor" />
                                </div>
                            )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-100 truncate w-16 text-center">{group.user.id === user.id ? 'You' : group.user.display_name}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default StoriesBar;
