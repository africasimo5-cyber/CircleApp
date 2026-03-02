import React, { useState } from 'react';
import { login, signup } from '../auth';
import { MessageSquare, Lock, User, UserPlus } from 'lucide-react';

function Login({ onLogin }) {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const trimmedUser = username.trim();
        const trimmedPass = password; // Passwords shouldn't be trimmed usually
        const trimmedDisplay = displayName.trim();

        console.log(`[LoginUI] Attempting ${isLogin ? 'Login' : 'Signup'} for:`, trimmedUser);

        try {
            const result = isLogin
                ? await login(trimmedUser, trimmedPass)
                : await signup(trimmedUser, trimmedPass, trimmedDisplay);

            console.log('[LoginUI] Result:', result);

            if (result.success) {
                onLogin(result.user);
            } else {
                setError(result.error);
            }
        } catch (err) {
            console.error('[LoginUI] Fatal error:', err);
            setError('An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container flex flex-col items-center justify-center h-full p-6 bg-gradient-to-br from-gray-900 to-black text-white">
            <div className="w-full max-w-sm animate-fade-in">
                <div className="flex justify-center mb-8 animate-slide-up">
                    <div className="bg-blue-600/20 p-6 rounded-3xl text-blue-500 shadow-2xl shadow-blue-500/20 backdrop-blur-xl border border-blue-500/20">
                        <MessageSquare size={48} />
                    </div>
                </div>
                <h1 className="text-3xl font-bold text-center mb-2 tracking-tight">
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h1>
                <p className="text-center text-gray-400 mb-8">
                    {isLogin ? 'Enter your secure credentials' : 'Join the private circle'}
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {!isLogin && (
                        <div className="relative group">
                            <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="text"
                                placeholder="Display Name (e.g. John Doe)"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                required={!isLogin}
                                className="w-full p-4 pl-12 bg-gray-800/50 border border-gray-700 rounded-2xl text-lg outline-none focus:border-blue-500 focus:bg-gray-800 transition-all placeholder:text-gray-600"
                            />
                        </div>
                    )}

                    <div className="relative group">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="w-full p-4 pl-12 bg-gray-800/50 border border-gray-700 rounded-2xl text-lg outline-none focus:border-blue-500 focus:bg-gray-800 transition-all placeholder:text-gray-600"
                        />
                    </div>

                    <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full p-4 pl-12 bg-gray-800/50 border border-gray-700 rounded-2xl text-lg outline-none focus:border-blue-500 focus:bg-gray-800 transition-all placeholder:text-gray-600"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-center text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 rounded-2xl font-bold text-lg hover:from-blue-500 hover:to-blue-400 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Processing...' : (isLogin ? 'Enter Chat' : 'Sign Up')}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                        }}
                        className="text-blue-400 text-sm font-medium hover:text-blue-300 transition-colors"
                    >
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
                    </button>
                </form>

                <div className="mt-12 text-center text-gray-600 text-xs uppercase tracking-widest font-medium">
                    <p>Encrypted • Private • Secure</p>
                </div>
            </div>
        </div>
    );
}

export default Login;
