import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";
import { checkoutCart, fetchPickupSlots } from "../services/orderService";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";
import CustomSelect from "../components/common/CustomSelect";
import { buildAddressConfig } from "../utils/addressOptions";

const STRIPE_MIN_AMOUNT_INR = 50;

const Checkout = () => {
  const { cart, refreshCart } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const navigate = useNavigate();
  const [selectedAddress, setSelectedAddress] = useState(() =>
    location.state?.selectedAddress || localStorage.getItem("selectedAddress") || ""
  );
  const addressOptions = useMemo(() => buildAddressConfig(user).options, [user]);

  useEffect(() => {
    if (!selectedAddress) {
      toast.error("Please select an address in cart before checkout");
      navigate("/cart");
    }
  }, [selectedAddress, navigate]);

  useEffect(() => {
    if (!addressOptions.length) {
      setSelectedAddress("");
      localStorage.removeItem("selectedAddress");
      return;
    }

    if (!addressOptions.includes(selectedAddress)) {
      const nextAddress = location.state?.selectedAddress || localStorage.getItem("selectedAddress") || addressOptions[0];
      setSelectedAddress(nextAddress);
      localStorage.setItem("selectedAddress", nextAddress);
      return;
    }

    localStorage.setItem("selectedAddress", selectedAddress);
  }, [addressOptions, selectedAddress, location.state]);

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
  const slotOptions = useMemo(
    () =>
      slots.map((slot) => ({
        value: slot.id,
        label: `${new Date(slot.date).toLocaleDateString()} | ${slot.label}`,
      })),
    [slots]
  );

  const tax = Number((cart.subtotal * 0.05).toFixed(2));
  const total = Number((cart.subtotal + tax).toFixed(2));
  const isBelowStripeMinimum = total < STRIPE_MIN_AMOUNT_INR;

  const handlePlaceOrder = async () => {
    if (!selectedSlot) {
      toast.error("Please select a pickup slot");
      return;
    }

    if (isBelowStripeMinimum) {
      toast.error(
        `Stripe payments require at least Rs ${STRIPE_MIN_AMOUNT_INR.toFixed(2)}. Add more items before checkout.`,
      );
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
      navigate(`/payments/${order.id}`, {
        state: {
          order,
          fromCheckout: true,
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to continue to payment");
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!cart.items.length) {
    return (
      <main className="page-wrap checkout-page">
        <MedicineBrowseBar />
        <h1 className="page-title">Checkout</h1>
        <section className="panel" style={{ padding: "24px" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Your cart is empty. Add medicines before checkout.
          </p>
          <Link to="/shop" className="btn-primary">
            Go to Shop
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrap checkout-page">
      <MedicineBrowseBar />
      <h1 className="page-title">Checkout</h1>
      <p className="page-subtitle">Choose a pickup slot and continue to payment.</p>

      <section className="checkout-layout">
        <article className="panel checkout-main-panel">
          <section className="checkout-block">
            <h3 className="checkout-block-title">Address</h3>
            <div className="checkout-address-card">
              <div className="checkout-address-row">
                <strong className="checkout-address-value">{selectedAddress || "Address not selected"}</strong>
                <Link to="/cart" className="btn-secondary checkout-address-link">
                  Change Address
                </Link>
              </div>
              <div className="checkout-mobile-address-select-wrap">
                <CustomSelect
                  id="checkout-address-select"
                  value={selectedAddress}
                  options={addressOptions}
                  onChange={setSelectedAddress}
                  className="checkout-mobile-address-select checkout-field-select"
                />
              </div>
            </div>
          </section>

          <section className="checkout-block">
            <h3 className="checkout-block-title">Pickup Slot</h3>
            <CustomSelect
              value={slotId}
              options={slotOptions}
              onChange={setSlotId}
              className="checkout-slot-select checkout-field-select"
            />
          </section>

          <section className="checkout-block">
            <h3 className="checkout-block-title">Order Note</h3>
            <textarea
              className="textarea checkout-note"
              rows={5}
              placeholder="Optional instructions for pharmacy staff"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </section>
        </article>

        <aside className="panel checkout-summary-panel">
          <h3 className="checkout-block-title">Order Summary</h3>
          <div className="checkout-summary-stack">
            <span className="muted">Items: {cart.totalItems}</span>
            <div className="checkout-summary-list">
              <div className="checkout-summary-row">
                <span>Subtotal</span>
                <strong>Rs {Number(cart.subtotal).toFixed(2)}</strong>
              </div>
              <div className="checkout-summary-row">
                <span>Tax (5%)</span>
                <strong>Rs {tax.toFixed(2)}</strong>
              </div>
              <div className="checkout-summary-row checkout-summary-total">
                <span>Total</span>
                <strong>Rs {total.toFixed(2)}</strong>
              </div>
            </div>

            {isBelowStripeMinimum ? (
              <p className="error-text" style={{ margin: 0 }}>
                Stripe payments require a minimum total of Rs {STRIPE_MIN_AMOUNT_INR.toFixed(2)}.
              </p>
            ) : null}

            <button
              type="button"
              className="btn-primary checkout-place-order-btn checkout-place-order-btn-desktop"
              disabled={placingOrder || !selectedAddress || isBelowStripeMinimum}
              onClick={handlePlaceOrder}
            >
              {placingOrder ? "Preparing Payment..." : "Continue to Payment"}
            </button>
          </div>
        </aside>
      </section>

      <div className="checkout-mobile-paybar">
        <div className="checkout-mobile-paybar-inner">
          <div className="checkout-mobile-paymeta">
            <span>To Pay</span>
            <strong>Rs {total.toFixed(2)}</strong>
          </div>
          <button
            type="button"
            className="btn-primary checkout-place-order-btn checkout-place-order-btn-mobile"
            disabled={placingOrder || !selectedAddress || isBelowStripeMinimum}
            onClick={handlePlaceOrder}
          >
            {placingOrder ? "Preparing Payment..." : "Continue to Payment"}
          </button>
        </div>
      </div>
    </main>
  );
};

export default Checkout;
