import React, { useContext, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";

const Profile = () => {
  const { user } = useContext(AuthContext);

  const hostelAddress = useMemo(() => {
    const block = String(user?.block || "").trim();
    const roomNo = String(user?.roomNo || "").trim();
    if (!block || !roomNo) {
      return "Not set";
    }
    return `Hostel Room - ${block} ${roomNo}`;
  }, [user]);

  const roleLabel = user?.role === "admin" ? "Pharmacist / Admin" : "Student / Patient";

  return (
    <main className="page-wrap">
      <h1 className="page-title">My Account</h1>
      <p className="page-subtitle">Profile details for your MediSync account.</p>

      <section className="panel profile-panel">
        <div className="profile-grid">
          <div className="profile-item">
            <span className="profile-key">Full Name</span>
            <strong className="profile-value">{user?.name || "N/A"}</strong>
          </div>
          <div className="profile-item">
            <span className="profile-key">Email</span>
            <strong className="profile-value">{user?.email || "N/A"}</strong>
          </div>
          <div className="profile-item">
            <span className="profile-key">Role</span>
            <strong className="profile-value">{roleLabel}</strong>
          </div>
          <div className="profile-item">
            <span className="profile-key">Gender</span>
            <strong className="profile-value">
              {user?.gender ? user.gender[0].toUpperCase() + user.gender.slice(1) : "N/A"}
            </strong>
          </div>
          <div className="profile-item">
            <span className="profile-key">Block</span>
            <strong className="profile-value">{user?.block || "N/A"}</strong>
          </div>
          <div className="profile-item">
            <span className="profile-key">Room No</span>
            <strong className="profile-value">{user?.roomNo || "N/A"}</strong>
          </div>
        </div>
        <div className="profile-address-box">
          <span className="profile-key">Default Hostel Address</span>
          <strong className="profile-value">{hostelAddress}</strong>
        </div>
      </section>
    </main>
  );
};

export default Profile;
