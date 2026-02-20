import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";

const STATIC_ADDRESS_OPTIONS = ["SJT", "TT", "SMV", "Main Building", "MGR"];

const Cart = () => {
  const { cart, updateItem, removeItem, clearCart, loading } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [manualHostelBlock, setManualHostelBlock] = useState(() =>
    String(localStorage.getItem("manualHostelBlock") || "").trim().toUpperCase()
  );
  const [manualHostelRoomNo, setManualHostelRoomNo] = useState(() =>
    String(localStorage.getItem("manualHostelRoomNo") || "").trim()
  );

  const userBlock = String(user?.block || localStorage.getItem("block") || "").trim();
  const userRoomNo = String(user?.roomNo || localStorage.getItem("roomNo") || "").trim();
  const effectiveBlock = userBlock || manualHostelBlock;
  const effectiveRoomNo = userRoomNo || manualHostelRoomNo;
  const hasHostelAddress = Boolean(effectiveBlock && effectiveRoomNo);
  const isPatientUser = user?.role === "patient";
  const hostelAddressLabel = hasHostelAddress
    ? `Hostel Room - ${effectiveBlock} ${effectiveRoomNo}`
    : "Hostel Room - Enter Block and Room No";
  const showManualHostelEntry = isPatientUser && !hasHostelAddress;
  const addressOptions = useMemo(() => {
    const options = [...STATIC_ADDRESS_OPTIONS];
    if (isPatientUser) {
      options.unshift(hostelAddressLabel);
    }
    return options;
  }, [isPatientUser, hostelAddressLabel]);

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

  return (
    <main className="page-wrap">
      <h1 className="page-title">Your Cart</h1>
      <p className="page-subtitle">Review medicines and proceed to checkout.</p>

      {!cart.items.length ? (
        <section className="panel" style={{ padding: "24px" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Your cart is empty.
          </p>
          <Link className="btn-primary" to="/">
            Continue Shopping
          </Link>
        </section>
      ) : (
        <>
          <section className="panel">
            {cart.items.map((item) => (
              <div key={item.medicineId} className="cart-row">
                <div className="stack">
                  <strong>{item.medicineName}</strong>
                  <span className="muted">{item.category}</span>
                </div>
                <div className="hide-mobile">
                  Rs {Number(item.unitPrice).toFixed(2)}
                </div>
                <div>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={20}
                    value={item.quantity}
                    style={{ width: "78px" }}
                    onChange={(event) =>
                      onUpdateQuantity(item.medicineId, Number(event.target.value))
                    }
                  />
                </div>
                <div>
                  <strong>Rs {Number(item.lineTotal).toFixed(2)}</strong>
                </div>
                <button
                  className="btn-danger"
                  type="button"
                  onClick={() => onRemove(item.medicineId)}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <section className="panel" style={{ marginTop: "14px", padding: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div className="stack">
                <span className="muted">Total Items: {cart.totalItems}</span>
                <strong style={{ fontSize: "1.2rem" }}>
                  Subtotal: Rs {Number(cart.subtotal).toFixed(2)}
                </strong>
                <div style={{ marginTop: "6px" }}>
                  <label
                    htmlFor="address-select"
                    className="muted"
                    style={{ display: "block", marginBottom: "4px" }}
                  >
                    Select Address
                  </label>
                  <select
                    id="address-select"
                    className="select"
                    style={{ minWidth: "220px" }}
                    value={selectedAddress}
                    onChange={(event) => setSelectedAddress(event.target.value)}
                  >
                    {addressOptions.map((addressOption) => (
                      <option key={addressOption} value={addressOption}>
                        {addressOption}
                      </option>
                    ))}
                  </select>
                  {showManualHostelEntry ? (
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
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
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn-secondary" type="button" onClick={onClear}>
                  Clear Cart
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={loading || !selectedAddress || isHostelPlaceholderSelected}
                  onClick={() => navigate("/checkout", { state: { selectedAddress } })}
                >
                  Proceed to Checkout
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
};

export default Cart;
