import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { deleteStory } from '../stories';

function StoryViewer({ group, user, onClose }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isMuted, setIsMuted] = useState(true);
    const story = group.stories[currentIndex];

    // Auto-advance logic
    useEffect(() => {
        setProgress(0);
        const duration = story.type === 'video' ? 15000 : 5000; // 5s for images, up to 15s for videos
        const interval = 50;
        const step = (interval / duration) * 100;

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    if (currentIndex < group.stories.length - 1) {
                        setCurrentIndex(prevIdx => prevIdx + 1);
                        return 0;
                    } else {
                        onClose();
                        return 100;
                    }
                }
                return prev + step;
            });
        }, interval);

        return () => clearInterval(timer);
    }, [currentIndex, group.stories.length, story.type, onClose]);

    const handleNext = () => {
        if (currentIndex < group.stories.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this story?')) return;
        
        const res = await deleteStory(story.id, story.url);
        if (res.success) {
            if (group.stories.length === 1) {
                onClose();
            } else {
                handleNext();
            }
        } else {
            alert('Failed to delete story: ' + res.error);
        }
    };

    const isOwnStory = group?.user?.id === user?.id || story?.user_id === user?.id;

    return (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-fade-in">
            {/* Progress Bars */}
            <div className="absolute top-4 left-4 right-4 flex gap-1 z-20">
                {group.stories.map((s, idx) => (
                    <div key={s.id} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-white transition-all duration-100 ease-linear"
                            style={{ 
                                width: idx < currentIndex ? '100%' : (idx === currentIndex ? `${progress}%` : '0%') 
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold border-2 border-white/20 shadow-xl">
                        {group.user.display_name.charAt(0)}
                    </div>
                    <div className="text-white drop-shadow-md">
                        <p className="text-sm font-bold">{group.user.display_name}</p>
                        <p className="text-[10px] font-medium opacity-80 uppercase tracking-widest">
                            {formatDistanceToNow(new Date(story.created_at))} ago
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isOwnStory && (
                        <button 
                            onClick={handleDelete} 
                            className="p-2 text-white/60 hover:text-red-500 transition-all drop-shadow-md"
                            title="Delete story"
                        >
                            <Trash2 size={24} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-2 text-white/80 hover:text-white transition-all drop-shadow-md">
                        <X size={28} />
                    </button>
                </div>
            </div>

            {/* Media Content */}
            <div className="w-full h-full flex items-center justify-center relative">
                {story.type === 'video' ? (
                    <video 
                        src={story.url} 
                        autoPlay 
                        muted={isMuted} 
                        playsInline
                        className="max-h-full w-auto object-contain"
                        onEnded={handleNext}
                    />
                ) : (
                    <img 
                        src={story.url} 
                        alt="Story" 
                        className="max-h-full w-auto object-contain select-none shadow-2xl shadow-white/5"
                    />
                )}

                {/* Navigation Buttons (Desktop) */}
                <button 
                    onClick={handlePrev} 
                    className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-sm"
                >
                    <ChevronLeft size={32} />
                </button>
                <button 
                    onClick={handleNext} 
                    className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-sm"
                >
                    <ChevronRight size={32} />
                </button>

                {/* Interaction Overlay (Mobile Tap) */}
                <div className="absolute inset-0 flex sm:hidden">
                    <div className="w-1/3 h-full" onClick={handlePrev} />
                    <div className="w-2/3 h-full" onClick={handleNext} />
                </div>

                {story.type === 'video' && (
                    <button 
                        onClick={() => setIsMuted(!isMuted)} 
                        className="absolute bottom-10 right-10 p-4 bg-black/40 rounded-full text-white"
                    >
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                )}
            </div>
        </div>
    );
}

export default StoryViewer;
