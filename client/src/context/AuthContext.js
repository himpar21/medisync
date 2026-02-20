import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const role = localStorage.getItem('role');
        const userId = localStorage.getItem('userId');
        const name = localStorage.getItem('name');
        const email = localStorage.getItem('email');
        const gender = localStorage.getItem('gender');
        const block = localStorage.getItem('block');
        const roomNo = localStorage.getItem('roomNo');

        if (token && role) {
            setUser({ token, role, userId, name, email, gender, block, roomNo });
        }
        setLoading(false);
    }, []);

    const login = (userData) => {
        localStorage.setItem('token', userData.token);
        localStorage.setItem('role', userData.role);
        if (userData.userId) {
            localStorage.setItem('userId', userData.userId);
        }
        if (userData.name) {
            localStorage.setItem('name', userData.name);
        }
        if (userData.email) {
            localStorage.setItem('email', userData.email);
        }
        if (userData.gender) {
            localStorage.setItem('gender', userData.gender);
        } else {
            localStorage.removeItem('gender');
        }
        if (userData.block) {
            localStorage.setItem('block', userData.block);
        } else {
            localStorage.removeItem('block');
        }
        if (userData.roomNo) {
            localStorage.setItem('roomNo', userData.roomNo);
        } else {
            localStorage.removeItem('roomNo');
        }

        setUser({
            token: userData.token,
            role: userData.role,
            userId: userData.userId,
            name: userData.name,
            email: userData.email,
            gender: userData.gender,
            block: userData.block,
            roomNo: userData.roomNo
        });
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('userId');
        localStorage.removeItem('name');
        localStorage.removeItem('email');
        localStorage.removeItem('gender');
        localStorage.removeItem('block');
        localStorage.removeItem('roomNo');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
