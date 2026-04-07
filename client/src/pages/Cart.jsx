import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Trash2 } from "lucide-react";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";
import CustomSelect from "../components/common/CustomSelect";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";
import { getMedicineById } from "../services/inventoryService";
import { buildAddressConfig } from "../utils/addressOptions";

const Cart = () => {
  const { cart, updateItem, removeItem, clearCart, loading } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [resolvedImages, setResolvedImages] = useState({});
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );
  const [manualHostelBlock, setManualHostelBlock] = useState(() =>
    String(localStorage.getItem("manualHostelBlock") || "").trim().toUpperCase()
  );
  const [manualHostelRoomNo, setManualHostelRoomNo] = useState(() =>
    String(localStorage.getItem("manualHostelRoomNo") || "").trim()
  );
  const [isBillDetailsOpen, setIsBillDetailsOpen] = useState(false);
  const addressConfig = useMemo(
    () => buildAddressConfig(user, manualHostelBlock, manualHostelRoomNo),
    [user, manualHostelBlock, manualHostelRoomNo]
  );
  const {
    options: addressOptions,
    hostelAddressLabel,
    hasHostelAddress,
    isPatientUser,
    showManualHostelEntry,
  } = addressConfig;

  const [selectedAddress, setSelectedAddress] = useState(() => {
    const saved = localStorage.getItem("selectedAddress");
    return saved || "";
  });

  useEffect(() => {
    if (!addressOptions.length) {
      setSelectedAddress("");
      localStorage.removeItem("selectedAddress");
      return;
    }

    if (!addressOptions.includes(selectedAddress)) {
      const nextAddress = addressOptions[0];
      setSelectedAddress(nextAddress);
      localStorage.setItem("selectedAddress", nextAddress);
      return;
    }

    if (selectedAddress) {
      localStorage.setItem("selectedAddress", selectedAddress);
    }
  }, [addressOptions, selectedAddress]);

  useEffect(() => {
    if (manualHostelBlock) {
      localStorage.setItem("manualHostelBlock", manualHostelBlock);
    } else {
      localStorage.removeItem("manualHostelBlock");
    }
  }, [manualHostelBlock]);

  useEffect(() => {
    if (manualHostelRoomNo) {
      localStorage.setItem("manualHostelRoomNo", manualHostelRoomNo);
    } else {
      localStorage.removeItem("manualHostelRoomNo");
    }
  }, [manualHostelRoomNo]);

  const isHostelPlaceholderSelected =
    isPatientUser && !hasHostelAddress && selectedAddress === hostelAddressLabel;
  const subtotal = Number(cart.subtotal || 0);
  const tax = Number((subtotal * 0.05).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncMobileState = (event) => {
      setIsMobileView(event.matches);
    };

    setIsMobileView(mediaQuery.matches);
    mediaQuery.addEventListener("change", syncMobileState);
    return () => {
      mediaQuery.removeEventListener("change", syncMobileState);
    };
  }, []);

  useEffect(() => {
    if (!cart.items.length) {
      setResolvedImages({});
      return;
    }

    const knownItemIds = new Set(cart.items.map((item) => String(item.medicineId)));
    setResolvedImages((current) => {
      const nextEntries = Object.entries(current).filter(([medicineId]) => knownItemIds.has(medicineId));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [cart.items]);

  useEffect(() => {
    const missingItems = cart.items.filter(
      (item) =>
        !String(item.imageData || "").trim() &&
        item.medicineId &&
        !Object.prototype.hasOwnProperty.call(resolvedImages, String(item.medicineId))
    );

    if (!missingItems.length) {
      return undefined;
    }

    let isActive = true;

    const loadImages = async () => {
      const fetchedEntries = await Promise.all(
        missingItems.map(async (item) => {
          try {
            const medicine = await getMedicineById(item.medicineId);
            return [String(item.medicineId), String(medicine?.imageData || "").trim()];
          } catch (_error) {
            return [String(item.medicineId), ""];
          }
        })
      );

      if (!isActive) {
        return;
      }

      setResolvedImages((current) => {
        const next = { ...current };
        fetchedEntries.forEach(([medicineId, imageData]) => {
          next[medicineId] = imageData;
        });
        return next;
      });
    };

    loadImages();

    return () => {
      isActive = false;
    };
  }, [cart.items, resolvedImages]);

  const getCartImage = (item) =>
    String(item.imageData || "").trim() || String(resolvedImages[String(item.medicineId)] || "").trim();

  const onUpdateQuantity = async (medicineId, quantity) => {
    try {
      await updateItem(medicineId, quantity);
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to update quantity");
    }
  };

  const onRemove = async (medicineId) => {
    try {
      await removeItem(medicineId);
      toast.success("Item removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to remove item");
    }
  };

  const onClear = async () => {
    try {
      await clearCart();
      toast.success("Cart cleared");
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to clear cart");
    }
  };

  const onAdjustQuantity = (medicineId, currentQuantity, delta) => {
    const normalizedCurrentQuantity = Math.max(1, Math.min(20, Number(currentQuantity || 1)));

    if (delta < 0 && normalizedCurrentQuantity === 1 && isMobileView) {
      onRemove(medicineId);
      return;
    }

    const nextQuantity = Math.max(1, Math.min(20, normalizedCurrentQuantity + delta));
    if (nextQuantity === normalizedCurrentQuantity) {
      return;
    }

    onUpdateQuantity(medicineId, nextQuantity);
  };

  return (
    <main className="page-wrap cart-page">
      <MedicineBrowseBar />
      <h1 className="page-title">Your Cart</h1>
      <p className="page-subtitle">Review medicines and proceed to payment.</p>

      {!cart.items.length ? (
        <section className="panel" style={{ padding: "24px" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Your cart is empty.
          </p>
          <Link className="btn-primary" to="/shop">
            Continue Shopping
          </Link>
        </section>
      ) : (
        <section className="cart-layout">
          <aside className="cart-side-column">
            <section className="panel cart-address-panel">
              <div className="cart-side-head">
                <h3 className="cart-side-title">Pickup Address</h3>
              </div>
              <div className="cart-address-block">
                <label htmlFor="address-select" className="muted cart-address-label">
                  Select Address
                </label>
                <CustomSelect
                  id="address-select"
                  value={selectedAddress}
                  options={addressOptions}
                  onChange={setSelectedAddress}
                />
                {showManualHostelEntry ? (
                  <div className="cart-address-inline">
                    <input
                      className="input"
                      placeholder="Block"
                      style={{ width: "82px", textTransform: "uppercase" }}
                      value={manualHostelBlock}
                      onChange={(event) =>
                        setManualHostelBlock(event.target.value.toUpperCase().slice(0, 4))
                      }
                    />
                    <input
                      className="input"
                      placeholder="Room No"
                      style={{ width: "128px" }}
                      value={manualHostelRoomNo}
                      onChange={(event) => setManualHostelRoomNo(event.target.value.slice(0, 20))}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className={`panel cart-summary-panel${isBillDetailsOpen ? " is-expanded" : ""}`}>
              <div className="cart-side-head">
                <h3 className="cart-side-title">Amount Summary</h3>
              </div>

              <div className="cart-summary-stack">
                <div className="cart-amount-only">
                  <span className="muted">Amount Payable</span>
                  <strong className="cart-summary-total">Rs {total.toFixed(2)}</strong>
                </div>
                <button
                  type="button"
                  className="cart-summary-toggle"
                  onClick={() => setIsBillDetailsOpen((current) => !current)}
                >
                  <span>View Detailed Bill Summary</span>
                  <span className={`cart-summary-toggle-caret ${isBillDetailsOpen ? "is-open" : ""}`}>^</span>
                </button>
                {isBillDetailsOpen ? (
                  <div className="cart-billing-list">
                    <div className="cart-billing-row">
                      <span>Subtotal:</span>
                      <strong>Rs {subtotal.toFixed(2)}</strong>
                    </div>
                    <div className="cart-billing-row">
                      <span>Tax (5%):</span>
                      <strong>Rs {tax.toFixed(2)}</strong>
                    </div>
                    <div className="cart-billing-row cart-billing-total">
                      <span>Total:</span>
                      <strong>Rs {total.toFixed(2)}</strong>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="cart-action-row">
                <button className="btn-secondary" type="button" onClick={onClear}>
                  Clear Cart
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={loading || !selectedAddress || isHostelPlaceholderSelected}
                  onClick={() => navigate("/checkout", { state: { selectedAddress } })}
                >
                  Proceed to Payment
                </button>
              </div>
            </section>
          </aside>

          <section className="panel cart-items-panel">
            {cart.items.map((item) => (
              <article key={item.medicineId} className="cart-item-card">
                <div className="cart-item-shell">
                  <div className="cart-item-media">
                    {getCartImage(item) ? (
                      <img
                        src={getCartImage(item)}
                        alt={item.medicineName}
                        className="cart-item-image"
                      />
                    ) : (
                      <div className="cart-item-image cart-item-image-placeholder">
                        <span>No Image</span>
                      </div>
                    )}
                  </div>

                  <div className="cart-item-main">
                    <div className="cart-item-head">
                      <div className="stack cart-item-info">
                        <div className="cart-item-title-row">
                          <strong className="cart-item-name">{item.medicineName}</strong>
                        </div>
                      </div>

                      <div className="cart-item-head-actions">
                        <div className="qty-stepper cart-qty-stepper cart-qty-stepper-inline" id={`cart-qty-${item.medicineId}`}>
                          <button
                            type="button"
                            className="qty-btn cart-qty-step-btn"
                            disabled={loading || (!isMobileView && item.quantity <= 1)}
                            onClick={() => onAdjustQuantity(item.medicineId, item.quantity, -1)}
                            aria-label={`Decrease quantity for ${item.medicineName}`}
                          >
                            -
                          </button>
                          <span className="qty-value cart-qty-value">{item.quantity}</span>
                          <button
                            type="button"
                            className="qty-btn cart-qty-step-btn"
                            disabled={loading || item.quantity >= 20}
                            onClick={() => onAdjustQuantity(item.medicineId, item.quantity, 1)}
                            aria-label={`Increase quantity for ${item.medicineName}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          className="btn-danger cart-remove-btn cart-remove-icon-btn"
                          type="button"
                          onClick={() => onRemove(item.medicineId)}
                          aria-label={`Delete ${item.medicineName} from cart`}
                          title="Delete item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="cart-item-metrics">
                      <div className="cart-metric-card">
                        <span className="muted">Unit Price</span>
                        <strong>Rs {Number(item.unitPrice).toFixed(2)}</strong>
                      </div>

                      <div className="cart-metric-card cart-metric-card-accent">
                        <span className="muted">Total</span>
                        <strong>Rs {Number(item.lineTotal).toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </section>
      )}
    </main>
  );
};

export default Cart;
