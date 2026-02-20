import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react'; // Added professional icons
import { loginUser } from '../services/authService';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false); // Visibility state
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = await loginUser({ email, password });
            const role = data?.user?.role || data?.role;
            login({
                token: data.token,
                role,
                userId: data?.user?.id,
                name: data?.user?.name,
                email: data?.user?.email,
                gender: data?.user?.gender,
                block: data?.user?.block,
                roomNo: data?.user?.roomNo
            });
            role === 'admin' ? navigate('/dashboard') : navigate('/');
        } catch (err) {
            alert("Login Failed: " + (err.response?.data?.message || "Server Error"));
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2 style={styles.title}>
                    Welcome to <span style={{color: '#24aeb1'}}>Medi</span><span style={{color: '#ef4281'}}>Sync</span>
                </h2>
                <p style={styles.subtitle}>Login to access your healthcare dashboard</p>
                
                <form onSubmit={handleSubmit} style={styles.form}>
                    <label style={styles.label}>Email Address</label>
                    <input type="email" placeholder="Enter your email" style={styles.input} onChange={(e) => setEmail(e.target.value)} required />
                    
                    <label style={styles.label}>Password</label>
                    {/* Added relative wrapper for the toggle button */}
                    <div style={{ position: 'relative' }}>
                        <input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Enter your password" 
                            style={{ ...styles.input, paddingRight: '45px' }} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={styles.eyeButton}
                        >
                            {showPassword ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
                        </button>
                    </div>
                    
                    <button type="submit" style={styles.button}>Login</button>
                </form>

                <p style={styles.footerText}>
                    New to MediSync? <Link to="/register" style={styles.link}>Create Account</Link>
                </p>
            </div>
        </div>
    );
};

const styles = {
    container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f0f4f8' },
    card: { backgroundColor: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' },
    title: { fontSize: '24px', marginBottom: '8px', color: '#333' },
    subtitle: { color: '#666', marginBottom: '30px', fontSize: '14px' },
    form: { textAlign: 'left' },
    label: { display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold', color: '#555' },
    input: { width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' },
    // Eye button positioning
    eyeButton: {
        position: 'absolute',
        right: '12px',
        top: '38%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0',
        display: 'flex',
        alignItems: 'center',
        zIndex: 10
    },
    button: { width: '100%', padding: '12px', backgroundColor: '#24aeb1', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' },
    footerText: { marginTop: '20px', fontSize: '14px', color: '#666' },
    link: { color: '#ef4281', textDecoration: 'none', fontWeight: 'bold' }
};

export default Login;
