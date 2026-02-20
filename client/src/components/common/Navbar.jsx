import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, User } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { CartContext } from '../../context/CartContext';

const Navbar = () => {
    const { user, logout } = useContext(AuthContext);
    const { cart } = useContext(CartContext);
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);

    const handleLogout = () => {
        setMenuOpen(false);
        logout();
        navigate('/login');
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!profileMenuRef.current) return;
            if (!profileMenuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <nav className="app-nav">
            <Link to="/" className="logo-link">
                Medi<span>Sync</span>
            </Link>
            <div className="nav-links">
                <Link to="/" className="nav-link">Shop</Link>
                {user && (
                    <Link to="/cart" className="nav-link nav-cart-link">
                        Cart
                        <span className="cart-badge">{cart?.totalItems || 0}</span>
                    </Link>
                )}
                {user ? (
                    <div className="profile-menu-wrap" ref={profileMenuRef}>
                        <button
                            type="button"
                            className="profile-menu-btn"
                            onClick={() => setMenuOpen((prev) => !prev)}
                        >
                            <span className="profile-icon">
                                <User size={16} />
                            </span>
                            <span className="profile-btn-label">Profile</span>
                            <ChevronDown size={16} />
                        </button>

                        {menuOpen ? (
                            <div className="profile-dropdown">
                                <div className="profile-dropdown-header">
                                    <strong>{user?.name || 'User'}</strong>
                                    <span>{user?.email || ''}</span>
                                </div>
                                <Link
                                    to="/profile"
                                    className="profile-dropdown-item"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    My Account
                                </Link>
                                <Link
                                    to="/orders"
                                    className="profile-dropdown-item"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    Order History
                                </Link>
                                {user.role === 'admin' && (
                                    <Link
                                        to="/dashboard"
                                        className="profile-dropdown-item"
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        Admin Dashboard
                                    </Link>
                                )}
                                <button
                                    type="button"
                                    className="profile-dropdown-item profile-logout-item"
                                    onClick={handleLogout}
                                >
                                    Logout
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <Link to="/login" className="btn-primary">Login</Link>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
