import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react'; // Added professional icons
import { registerUser } from '../services/authService';

const MALE_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'];
const FEMALE_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'RJT'];

const Register = () => {
    const [formData, setFormData] = useState({ 
        name: '', 
        email: '', 
        password: '', 
        role: 'patient',
        gender: 'male',
        block: MALE_BLOCKS[0],
        roomNo: ''
    });
    
    // State to toggle password visibility
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const isPatient = formData.role === 'patient';
    const allowedBlocks = formData.gender === 'female' ? FEMALE_BLOCKS : MALE_BLOCKS;

    const handleGenderChange = (nextGender) => {
        const nextAllowedBlocks = nextGender === 'female' ? FEMALE_BLOCKS : MALE_BLOCKS;
        setFormData((prev) => ({
            ...prev,
            gender: nextGender,
            block: nextAllowedBlocks.includes(prev.block) ? prev.block : nextAllowedBlocks[0]
        }));
    };

    const handleRoleChange = (nextRole) => {
        setFormData((prev) => {
            if (nextRole === 'admin') {
                return {
                    ...prev,
                    role: nextRole,
                    gender: '',
                    block: '',
                    roomNo: ''
                };
            }

            return {
                ...prev,
                role: nextRole,
                gender: prev.gender || 'male',
                block: prev.block || MALE_BLOCKS[0]
            };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 1. Trigger the loading toast
        const loadingToast = toast.loading('Creating your account...');

        try {
            const payload = isPatient
                ? formData
                : {
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    role: formData.role
                };

            // 2. Call the Gateway (Port 5000)
            await registerUser(payload);
            
            // 3. Update toast to Success
            toast.success('Registration Successful! Welcome to MediSync.', { id: loadingToast });
            
            // 4. Wait 2 seconds so the user can see the message, then redirect
            setTimeout(() => {
                navigate('/login');
            }, 2000);
            
        } catch (err) {
            // 5. Update toast to Error with specific message from backend/gateway
            const errorMsg = err.response?.data?.message || "Registration Failed: Server Error";
            toast.error(errorMsg, { id: loadingToast });
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.brandSection}>
                    <h2 style={styles.logo}>
                        <span style={{color: '#24aeb1'}}>Medi</span><span style={{color: '#ef4281'}}>Sync</span>
                    </h2>
                    <p style={styles.subtitle}>Join our healthcare network</p>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    {/* Radio Button Group for Roles */}
                    <div style={styles.radioSection}>
                        <label style={styles.label}>Register as:</label>
                        <div style={styles.radioGroup}>
                            <label style={styles.radioLabel}>
                                <input 
                                    type="radio" 
                                    value="patient" 
                                    checked={formData.role === 'patient'}
                                    onChange={(e) => handleRoleChange(e.target.value)}
                                    style={styles.radioInput}
                                />
                                Patient
                            </label>
                            <label style={styles.radioLabel}>
                                <input 
                                    type="radio" 
                                    value="admin" 
                                    checked={formData.role === 'admin'}
                                    onChange={(e) => handleRoleChange(e.target.value)}
                                    style={styles.radioInput}
                                />
                                Pharmacist / Admin
                            </label>
                        </div>
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Full Name</label>
                        <input 
                            type="text" 
                            placeholder="Full name" 
                            style={styles.input} 
                            onChange={(e) => setFormData({...formData, name: e.target.value})} 
                            required 
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Email Address</label>
                        <input 
                            type="email" 
                            placeholder="example@mail.com" 
                            style={styles.input} 
                            onChange={(e) => setFormData({...formData, email: e.target.value})} 
                            required 
                        />
                    </div>

                    {isPatient && (
                        <>
                            <div style={styles.radioSection}>
                                <label style={styles.label}>Gender:</label>
                                <div style={styles.radioGroup}>
                                    <label style={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            value="male"
                                            checked={formData.gender === 'male'}
                                            onChange={(e) => handleGenderChange(e.target.value)}
                                            style={styles.radioInput}
                                        />
                                        Male
                                    </label>
                                    <label style={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            value="female"
                                            checked={formData.gender === 'female'}
                                            onChange={(e) => handleGenderChange(e.target.value)}
                                            style={styles.radioInput}
                                        />
                                        Female
                                    </label>
                                </div>
                            </div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Block</label>
                                <select
                                    style={styles.input}
                                    value={formData.block}
                                    onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                                    required={isPatient}
                                >
                                    {allowedBlocks.map((blockOption) => (
                                        <option key={blockOption} value={blockOption}>
                                            {blockOption}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Room No</label>
                                <input
                                    type="text"
                                    placeholder="Enter room number"
                                    style={styles.input}
                                    value={formData.roomNo}
                                    onChange={(e) => setFormData({ ...formData, roomNo: e.target.value })}
                                    required={isPatient}
                                />
                            </div>
                        </>
                    )}

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type={showPassword ? "text" : "password"} 
                                placeholder="Create password" 
                                style={{ ...styles.input, width: '100%', paddingRight: '45px' }} 
                                onChange={(e) => setFormData({...formData, password: e.target.value})} 
                                required 
                            />
                            {/* Updated Toggle Button with Icons */}
                            <button 
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={styles.eyeButton}
                            >
                                {showPassword ? <EyeOff size={18} color="#9ca3af" /> : <Eye size={18} color="#9ca3af" />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" style={styles.button}>Create Account</button>
                </form>

                <p style={styles.footerText}>
                    Already have an account? <Link to="/login" style={styles.link}>Login</Link>
                </p>
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - 74px)',
        backgroundColor: '#f4f7f9',
        padding: '10px 12px'
    },
    card: {
        backgroundColor: '#fff',
        padding: '24px 26px',
        borderRadius: '15px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
        width: '100%',
        maxWidth: '430px'
    },
    brandSection: { textAlign: 'center', marginBottom: '16px' },
    logo: { fontSize: '28px', fontWeight: 'bold', margin: 0 },
    subtitle: { color: '#777', fontSize: '13px', marginTop: '2px' },
    form: { display: 'flex', flexDirection: 'column', gap: '10px' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
    label: { fontSize: '12px', fontWeight: '700', color: '#444' },
    input: {
        padding: '10px 12px',
        minHeight: '40px',
        borderRadius: '8px',
        border: '1px solid #ddd',
        outline: 'none',
        fontSize: '14px',
        boxSizing: 'border-box'
    },
    radioSection: { marginTop: '2px' },
    radioGroup: { display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap' },
    radioLabel: { fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#555' },
    radioInput: { accentColor: '#24aeb1', width: '18px', height: '18px' },
    eyeButton: {
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0',
        display: 'flex',
        alignItems: 'center',
        zIndex: 10
    },
    button: { padding: '12px', backgroundColor: '#24aeb1', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', transition: 'background 0.3s' },
    footerText: { textAlign: 'center', marginTop: '12px', fontSize: '13px', color: '#666' },
    link: { color: '#ef4281', textDecoration: 'none', fontWeight: 'bold' }
};

export default Register;
