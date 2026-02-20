import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CartContext } from "../context/CartContext";
import { checkoutCart, fetchPickupSlots } from "../services/orderService";

const Checkout = () => {
  const { cart, refreshCart } = useContext(CartContext);
  const location = useLocation();
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const navigate = useNavigate();
  const selectedAddress =
    location.state?.selectedAddress || localStorage.getItem("selectedAddress") || "";

  useEffect(() => {
    if (!selectedAddress) {
      toast.error("Please select an address in cart before checkout");
      navigate("/cart");
    }
  }, [selectedAddress, navigate]);

  useEffect(() => {
    let mounted = true;
    fetchPickupSlots()
      .then((items) => {
        if (mounted) {
          setSlots(items);
          if (items.length) {
            setSlotId(items[0].id);
          }
        }
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || "Unable to load pickup slots");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedSlot = useMemo(
    () => slots.find((item) => item.id === slotId),
    [slots, slotId]
  );

  const tax = Number((cart.subtotal * 0.05).toFixed(2));
  const total = Number((cart.subtotal + tax).toFixed(2));

  const handlePlaceOrder = async () => {
    if (!selectedSlot) {
      toast.error("Please select a pickup slot");
      return;
    }

    setPlacingOrder(true);
    try {
      const order = await checkoutCart({
        pickupSlot: {
          date: selectedSlot.date,
          label: selectedSlot.label,
        },
        address: selectedAddress,
        note,
      });
      await refreshCart();
      navigate("/order-placed", { state: { order } });
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to place order");
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!cart.items.length) {
    return (
      <main className="page-wrap">
        <h1 className="page-title">Checkout</h1>
        <section className="panel" style={{ padding: "24px" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Your cart is empty. Add medicines before checkout.
          </p>
          <Link to="/" className="btn-primary">
            Go to Shop
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap">
      <h1 className="page-title">Checkout</h1>
      <p className="page-subtitle">Choose a pickup slot and place your order.</p>

      <section className="checkout-layout">
        <article className="panel" style={{ padding: "16px" }}>
          <h3 style={{ marginTop: 0 }}>Address</h3>
          <div className="panel" style={{ padding: "10px 12px", marginBottom: "14px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <strong>{selectedAddress || "Address not selected"}</strong>
              <Link
                to="/cart"
                className="btn-secondary"
                style={{ textDecoration: "none", padding: "8px 12px" }}
              >
                Change Address
              </Link>
            </div>
          </div>

          <h3 style={{ marginTop: 0 }}>Pickup Slot</h3>
          <select
            className="select"
            value={slotId}
            onChange={(event) => setSlotId(event.target.value)}
            style={{ width: "100%" }}
          >
            {slots.map((slot) => {
              const dateLabel = new Date(slot.date).toLocaleDateString();
              return (
                <option key={slot.id} value={slot.id}>
                  {dateLabel} | {slot.label}
                </option>
              );
            })}
          </select>

          <h3 style={{ marginBottom: "8px" }}>Order Note</h3>
          <textarea
            className="textarea"
            rows={4}
            style={{ width: "100%" }}
            placeholder="Optional instructions for pharmacy staff"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </article>

        <aside className="panel" style={{ padding: "16px" }}>
          <h3 style={{ marginTop: 0 }}>Order Summary</h3>
          <div className="stack">
            <span className="muted">Items: {cart.totalItems}</span>
            <span>Subtotal: Rs {Number(cart.subtotal).toFixed(2)}</span>
            <span>Tax (5%): Rs {tax.toFixed(2)}</span>
            <strong style={{ fontSize: "1.15rem" }}>Total: Rs {total.toFixed(2)}</strong>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", marginTop: "16px" }}
            disabled={placingOrder || !selectedAddress}
            onClick={handlePlaceOrder}
          >
            {placingOrder ? "Placing Order..." : "Place Order"}
          </button>
        </aside>
      </section>
    </main>
  );
};

export default Checkout;
