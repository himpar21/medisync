import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShoppingBag,
  ShoppingCart,
  User,
  UserPlus,
} from "lucide-react";
import { AuthContext } from "../../context/AuthContext";
import { CartContext } from "../../context/CartContext";
import CustomSelect from "./CustomSelect";
import { buildAddressConfig } from "../../utils/addressOptions";

const AppSidebar = () => {
  const { user, logout } = useContext(AuthContext);
  const { cart } = useContext(CartContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginRoute = location.pathname === "/login";
  const [selectedAddress, setSelectedAddress] = useState(() => localStorage.getItem("selectedAddress") || "");

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

  const mobileBottomLinks = useMemo(() => {
    if (!user || isPrivileged || isLoginRoute) {
      return [];
    }

    return [
      { to: "/shop", label: "Shop", icon: ShoppingBag },
      { to: "/cart", label: "Cart", icon: ShoppingCart, badge: cart?.totalItems || 0 },
      { to: "/orders", label: "Orders", icon: ClipboardList },
    ];
  }, [user, isPrivileged, isLoginRoute, cart?.totalItems]);

  const showMobileAddressSelector = useMemo(
    () =>
      !isLoginRoute &&
      !isPrivileged &&
      (location.pathname === "/shop" || location.pathname.startsWith("/medicines/")),
    [isLoginRoute, isPrivileged, location.pathname]
  );

  const mobileAddressOptions = useMemo(() => buildAddressConfig(user).options, [user]);

  useEffect(() => {
    setSelectedAddress(localStorage.getItem("selectedAddress") || "");
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileAddressOptions.length) {
      setSelectedAddress("");
      localStorage.removeItem("selectedAddress");
      return;
    }

    if (!mobileAddressOptions.includes(selectedAddress)) {
      const nextAddress = mobileAddressOptions[0];
      setSelectedAddress(nextAddress);
      localStorage.setItem("selectedAddress", nextAddress);
      return;
    }

    if (selectedAddress) {
      localStorage.setItem("selectedAddress", selectedAddress);
    }
  }, [mobileAddressOptions, selectedAddress]);

  useEffect(() => {
    const isPaymentRoute = location.pathname.startsWith("/payments/");
    document.body.classList.toggle("route-payment", isPaymentRoute);

    const unhidePreviouslyHidden = () => {
      document.querySelectorAll('[data-hidden-stripe-widget="1"]').forEach((node) => {
        node.style.removeProperty("display");
        node.removeAttribute("data-hidden-stripe-widget");
      });
    };

    if (isPaymentRoute) {
      unhidePreviouslyHidden();
      return () => {
        document.body.classList.remove("route-payment");
      };
    }

    const hideNode = (node) => {
      if (!node || node === document.body) {
        return;
      }
      node.style.setProperty("display", "none", "important");
      node.setAttribute("data-hidden-stripe-widget", "1");
    };

    const hideStripeFloatingWidgets = () => {
      const candidates = new Set();
      const stripeSelectors = [
        "stripe-buy-button",
        "[id*='stripe' i]",
        "[class*='stripe' i]",
        "iframe[src*='stripe' i]",
        "a[href*='stripe' i]",
        "[aria-label*='stripe' i]",
        "[title*='stripe' i]",
      ];

      stripeSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => candidates.add(node));
      });

      document.querySelectorAll("iframe").forEach((node) => {
        const style = window.getComputedStyle(node);
        if (style.position !== "fixed") {
          return;
        }
        const rect = node.getBoundingClientRect();
        const nearBottom = rect.bottom >= window.innerHeight - 16;
        const nearRight = rect.right >= window.innerWidth - 16;
        const compactWidget = rect.width <= 280 && rect.height <= 140;
        if (nearBottom && nearRight && compactWidget) {
          candidates.add(node);
        }
      });

      candidates.forEach((node) => {
        let current = node;
        let fixedAncestor = null;

        for (let depth = 0; current && current !== document.body && depth < 7; depth += 1) {
          const style = window.getComputedStyle(current);
          if (style.position === "fixed") {
            fixedAncestor = current;
            break;
          }
          current = current.parentElement;
        }

        hideNode(fixedAncestor || node);
      });
    };

    hideStripeFloatingWidgets();
    const observer = new MutationObserver(() => hideStripeFloatingWidgets());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "id", "src", "href"],
    });
    const intervalId = window.setInterval(hideStripeFloatingWidgets, 1000);

    return () => {
      window.clearInterval(intervalId);
      observer.disconnect();
      document.body.classList.remove("route-payment");
    };
  }, [location.pathname]);

  if (hideGlobalSidebar) {
    return null;
  }

  return (
    <aside className={`global-side-nav${mobileBottomLinks.length ? " has-mobile-bottom-nav" : ""}`}>
      <header className="global-mobile-top">
        <Link
          to={user && !isLoginRoute ? (isPrivileged ? "/dashboard" : "/shop") : "/login"}
          className="global-side-brand global-mobile-brand"
        >
          <span className="brand-medi">Medi</span>
          <span className="brand-sync">Sync</span>
        </Link>
        <div className="global-mobile-top-actions">
          {user && !isLoginRoute ? (
            <Link to="/profile" className={`global-mobile-profile${isActive("/profile") ? " is-active" : ""}`}>
              <User size={16} />
              <span title={profileLabel}>{profileLabel}</span>
            </Link>
          ) : (
            <Link to="/login" className="global-mobile-login-link">
              Login
            </Link>
          )}
        </div>
      </header>

      {showMobileAddressSelector ? (
        <div className="global-mobile-address-strip">
          <span className="global-mobile-address-label">Select Address</span>
          <CustomSelect
            id="global-mobile-address-select"
            className="global-mobile-address-select"
            value={selectedAddress}
            options={mobileAddressOptions}
            onChange={setSelectedAddress}
          />
        </div>
      ) : null}

      <div className="global-side-desktop">
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
      </div>

      {mobileBottomLinks.length ? (
        <nav className="global-mobile-bottom">
          {mobileBottomLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`global-mobile-bottom-link${isActive(item.to) ? " is-active" : ""}`}
              >
                <span className="global-mobile-bottom-icon-wrap">
                  <Icon size={18} />
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="global-mobile-bottom-badge">{item.badge}</span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </aside>
  );
};

export default AppSidebar;
