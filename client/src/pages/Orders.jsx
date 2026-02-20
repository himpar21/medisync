import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { addCartItem, fetchOrders } from "../services/orderService";

const STAR_VALUES = [1, 2, 3, 4, 5];

const formatMoney = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "N/A");
const formatDateOnly = (value) => (value ? new Date(value).toLocaleDateString() : "N/A");

const normalizeSavedOrderRating = (savedRating) => {
  if (typeof savedRating === "number") {
    return {
      experience: savedRating,
      products: {},
    };
  }

  if (!savedRating || typeof savedRating !== "object") {
    return {
      experience: 0,
      products: {},
    };
  }

  return {
    experience: Number(savedRating.experience || 0),
    products: savedRating.products && typeof savedRating.products === "object"
      ? savedRating.products
      : {},
  };
};

const getRatingItemKey = (item, index) =>
  `${item.medicineId || item.medicineName || "item"}-${index}`;

const StarPicker = ({ value, onChange, name }) => (
  <div className="star-picker" role="radiogroup" aria-label={name}>
    {STAR_VALUES.map((starValue) => {
      const isActive = starValue <= value;
      return (
        <button
          key={`${name}-${starValue}`}
          type="button"
          role="radio"
          aria-checked={starValue === value}
          aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
          className={`star-btn${isActive ? " is-active" : ""}`}
          onClick={() => onChange(starValue)}
        >
          {isActive ? "\u2605" : "\u2606"}
        </button>
      );
    })}
  </div>
);

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [reorderingOrderId, setReorderingOrderId] = useState(null);
  const [ratingModalOrder, setRatingModalOrder] = useState(null);
  const [ratingDraft, setRatingDraft] = useState({
    experience: 0,
    products: {},
  });
  const [orderRatings, setOrderRatings] = useState(() => {
    try {
      const stored = localStorage.getItem("orderRatings");
      return stored ? JSON.parse(stored) : {};
    } catch (_error) {
      return {};
    }
  });
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    fetchOrders()
      .then((items) => {
        if (mounted) {
          setOrders(items);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.response?.data?.message || "Unable to load orders");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("orderRatings", JSON.stringify(orderRatings));
    } catch (_error) {
      // Ignore localStorage write failures in private mode / restricted storage.
    }
  }, [orderRatings]);

  const onRateOrder = (event, order) => {
    event.stopPropagation();
    const savedRating = normalizeSavedOrderRating(orderRatings[order.id]);
    const productRatings = {};

    order.items.forEach((item, index) => {
      const ratingKey = getRatingItemKey(item, index);
      productRatings[ratingKey] = Number(savedRating.products[ratingKey] || 0);
    });

    setRatingDraft({
      experience: Number(savedRating.experience || 0),
      products: productRatings,
    });
    setRatingModalOrder(order);
  };

  const onOrderAgain = async (event, order) => {
    event.stopPropagation();

    if (!order.items?.length) {
      toast.error("No medicines found in this order");
      return;
    }

    setReorderingOrderId(order.id);
    try {
      for (const item of order.items) {
        await addCartItem({
          medicineId: item.medicineId,
          quantity: item.quantity,
        });
      }
      toast.success("Items added to cart");
      navigate("/cart");
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to order again");
    } finally {
      setReorderingOrderId(null);
    }
  };

  const onCloseRatingModal = () => {
    setRatingModalOrder(null);
    setRatingDraft({
      experience: 0,
      products: {},
    });
  };

  const onProductRatingChange = (ratingKey, ratingValue) => {
    setRatingDraft((current) => ({
      ...current,
      products: {
        ...current.products,
        [ratingKey]: ratingValue,
      },
    }));
  };

  const onExperienceRatingChange = (ratingValue) => {
    setRatingDraft((current) => ({
      ...current,
      experience: ratingValue,
    }));
  };

  const onSaveRating = () => {
    if (!ratingModalOrder) {
      return;
    }

    const hasMissingProductRating = ratingModalOrder.items.some((item, index) => {
      const ratingKey = getRatingItemKey(item, index);
      return Number(ratingDraft.products[ratingKey] || 0) < 1;
    });

    if (hasMissingProductRating) {
      toast.error("Please rate each product");
      return;
    }

    if (Number(ratingDraft.experience || 0) < 1) {
      toast.error("Please rate your overall experience");
      return;
    }

    setOrderRatings((current) => ({
      ...current,
      [ratingModalOrder.id]: {
        experience: Number(ratingDraft.experience),
        products: ratingDraft.products,
        updatedAt: new Date().toISOString(),
      },
    }));
    toast.success("Rating saved");
    onCloseRatingModal();
  };

  return (
    <main className="page-wrap">
      <h1 className="page-title">Order History</h1>
      <p className="page-subtitle">Track status and pickup details for each order.</p>

      {loading ? <p className="muted">Loading orders...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading && !orders.length ? (
        <section className="panel" style={{ padding: "20px" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            No orders found.
          </p>
          <Link to="/" className="btn-primary">
            Start Shopping
          </Link>
        </section>
      ) : null}

      <section className="grid" style={{ marginTop: "14px" }}>
        {orders.map((order) => {
          const isExpanded = expandedOrderId === order.id;
          const medicineCount = order.items.length;
          const firstMedicineName = order.items[0]?.medicineName || "Medicine";
          const savedRating = normalizeSavedOrderRating(orderRatings[order.id]);
          const orderIdLabel = order.orderNumber || order.id;
          const medicineSummary =
            medicineCount > 1
              ? `${firstMedicineName} +${medicineCount - 1} more`
              : firstMedicineName;
          const subtotal = Number(
            order.subtotal ??
              order.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
          );
          const deliveryFee = Number(order.deliveryFee || 0);
          const tax = Number(
            order.tax ?? Math.max(0, Number(order.totalAmount || 0) - subtotal - deliveryFee)
          );

          return (
            <article
              key={order.id}
              className="panel"
              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
              style={{ padding: "16px", cursor: "pointer" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "6px",
                }}
              >
                <div className="stack" style={{ gap: "4px", maxWidth: "72%" }}>
                  <strong style={{ lineHeight: "1.35" }}>{medicineSummary}</strong>
                  <span className="muted">
                    Placed: {formatDateTime(order.placedAt)}
                  </span>
                </div>
                <strong>{formatMoney(order.totalAmount)}</strong>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={(event) => onRateOrder(event, order)}
                  style={{ padding: "8px 12px" }}
                >
                  {savedRating.experience
                    ? `Rate Order (${savedRating.experience}/5)`
                    : "Rate Order"}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={reorderingOrderId === order.id}
                  onClick={(event) => onOrderAgain(event, order)}
                  style={{ padding: "8px 12px" }}
                >
                  {reorderingOrderId === order.id ? "Adding..." : "Order Again"}
                </button>
              </div>

              {isExpanded ? (
                <div className="order-expanded">
                  <div className="order-expanded-grid">
                    <section className="order-info-card">
                      <h3 className="order-section-title">Order Details</h3>
                      <p className="order-info-line">
                        <strong>Order ID:</strong> {orderIdLabel}
                      </p>
                      <p className="order-info-line">
                        <strong>Placed:</strong> {formatDateTime(order.placedAt)}
                      </p>
                      <p className="order-info-line">
                        <strong>Pickup:</strong> {formatDateOnly(order.pickupSlot?.date)} |{" "}
                        {order.pickupSlot?.label || "N/A"}
                      </p>
                      <p className="order-info-line">
                        <strong>Address:</strong> {order.address || "N/A"}
                      </p>
                      <p className="order-info-line">
                        <strong>Payment:</strong> {order.paymentStatus || "pending"}
                      </p>
                      <div className="order-info-line">
                        <strong>Status:</strong>
                        <span className={`status-pill status-${order.status}`}>{order.status}</span>
                      </div>
                    </section>

                    <section className="order-info-card order-bill-card">
                      <h3 className="order-section-title">Bill Summary</h3>
                      <div className="order-bill-row">
                        <span>Subtotal</span>
                        <strong>{formatMoney(subtotal)}</strong>
                      </div>
                      <div className="order-bill-row">
                        <span>Tax</span>
                        <strong>{formatMoney(tax)}</strong>
                      </div>
                      <div className="order-bill-row">
                        <span>Delivery Fee</span>
                        <strong>{formatMoney(deliveryFee)}</strong>
                      </div>
                      <div className="order-bill-total">
                        <span>Total</span>
                        <strong>{formatMoney(order.totalAmount)}</strong>
                      </div>
                    </section>
                  </div>

                  <section className="order-info-card order-items-card">
                    <h3 className="order-section-title">Medicine Details</h3>
                    {order.items.map((item) => (
                      <div
                        key={`${order.id}-detail-${item.medicineId}`}
                        className="order-item-row"
                      >
                        <div className="stack" style={{ gap: "2px" }}>
                          <strong>{item.medicineName}</strong>
                          <span className="muted">
                            Qty: {item.quantity} x {formatMoney(item.unitPrice)}
                          </span>
                        </div>
                        <strong>{formatMoney(item.lineTotal)}</strong>
                      </div>
                    ))}
                  </section>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {ratingModalOrder ? (
        <div className="rating-modal-backdrop" onClick={onCloseRatingModal}>
          <section
            className="rating-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label="Rate order"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rating-modal-header">
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Rate Order</h2>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                Share your rating for each product and your overall experience.
              </p>
            </div>

            <div className="rating-modal-body">
              {ratingModalOrder.items.map((item, index) => {
                const ratingKey = getRatingItemKey(item, index);
                return (
                  <div className="rating-row" key={`${ratingModalOrder.id}-${ratingKey}`}>
                    <span className="rating-label">{item.medicineName}</span>
                    <StarPicker
                      name={`${ratingModalOrder.id}-${ratingKey}`}
                      value={Number(ratingDraft.products[ratingKey] || 0)}
                      onChange={(ratingValue) => onProductRatingChange(ratingKey, ratingValue)}
                    />
                  </div>
                );
              })}

              <div className="rating-row rating-row-experience">
                <span className="rating-label">Rate Experience</span>
                <StarPicker
                  name={`${ratingModalOrder.id}-experience`}
                  value={Number(ratingDraft.experience || 0)}
                  onChange={onExperienceRatingChange}
                />
              </div>
            </div>

            <div className="rating-modal-actions">
              <button type="button" className="btn-secondary" onClick={onCloseRatingModal}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={onSaveRating}>
                Save Rating
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default Orders;
