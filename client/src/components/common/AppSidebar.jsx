import React, { useContext, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogIn, LogOut, ShoppingCart, ShoppingBag, User, UserPlus } from "lucide-react";
import { AuthContext } from "../../context/AuthContext";
import { CartContext } from "../../context/CartContext";

const AppSidebar = () => {
  const { user, logout } = useContext(AuthContext);
  const { cart } = useContext(CartContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginRoute = location.pathname === "/login";

  const role = String(user?.role || "").trim().toLowerCase();
  const profileLabel = String(user?.name || "").trim() || "Profile";
  const isPrivileged = ["admin", "pharmacist"].includes(role);
  const hideGlobalSidebar = isPrivileged && location.pathname === "/dashboard";

  const links = useMemo(() => {
    if (!user || isLoginRoute) {
      return [
        { to: "/shop", label: "Shop", icon: ShoppingBag },
        { to: "/login", label: "Login", icon: LogIn },
        { to: "/register", label: "Register", icon: UserPlus },
      ];
    }

    if (role === "pharmacist") {
      return [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
    }

    if (role === "admin") {
      return [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
    }

    return [
      { to: "/shop", label: "Shop", icon: ShoppingBag },
      { to: "/cart", label: "Cart", icon: ShoppingCart, badge: cart?.totalItems || 0 },
      { to: "/orders", label: "Orders", icon: LayoutDashboard },
    ];
  }, [user, role, cart?.totalItems, isLoginRoute]);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (to) => {
    if (to === "/") return location.pathname === "/";
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  if (hideGlobalSidebar) {
    return null;
  }

  return (
    <aside className="global-side-nav">
      <Link
        to={user && !isLoginRoute ? (isPrivileged ? "/dashboard" : "/shop") : "/login"}
        className="global-side-brand"
      >
        <span className="brand-medi">Medi</span>
        <span className="brand-sync">Sync</span>
      </Link>

      <nav className="global-side-menu">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`global-side-link${isActive(item.to) ? " is-active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {typeof item.badge === "number" ? (
                <span className="global-side-badge">{item.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {user && !isLoginRoute ? (
        <div className="global-side-footer">
          <Link to="/profile" className={`global-side-link${isActive("/profile") ? " is-active" : ""}`}>
            <User size={18} />
            <span className="sidebar-link-label" title={profileLabel}>{profileLabel}</span>
          </Link>
          <button type="button" className="global-side-link global-side-logout" onClick={onLogout}>
            <LogOut size={18} />
            <span className="sidebar-link-label">Logout</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
};

export default AppSidebar;
