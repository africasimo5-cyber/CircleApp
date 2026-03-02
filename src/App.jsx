
import React, { useState, useEffect } from 'react';
import { getCurrentUser, logout } from './auth';
import Login from './components/Login';
import Chat from './components/Chat';

function App() {
  const [user, setUser] = useState(() => getCurrentUser());

  const handleLogin = (loggedInUser) => {
    console.log('Login successful for user:', loggedInUser.username, `(${loggedInUser.id})`);
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    console.log('Logging out user:', user?.username);
    logout();
    setUser(null);
  };

  return (
    <div className="app-container">
      {user ? (
        <Chat user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
