import React, { useContext, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";

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

  const role = String(user?.role || "").toLowerCase();
  const isStudentProfile = role === "student" || role === "patient";
  const roleLabel =
    role === "admin" ? "Admin" : role === "pharmacist" ? "Pharmacist" : "Student";

  return (
    <main className="page-wrap">
      <MedicineBrowseBar />
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
          {isStudentProfile ? (
            <>
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
            </>
          ) : null}
        </div>
        {isStudentProfile ? (
          <div className="profile-address-box">
            <span className="profile-key">Default Hostel Address</span>
            <strong className="profile-value">{hostelAddress}</strong>
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default Profile;
