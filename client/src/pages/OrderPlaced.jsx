import React from "react";
import { Link, useLocation } from "react-router-dom";

const OrderPlaced = () => {
  const location = useLocation();
  const order = location.state?.order;

  return (
    <main className="page-wrap">
      <section className="panel" style={{ padding: "28px", maxWidth: "760px", margin: "0 auto" }}>
        <h1 className="page-title" style={{ color: "var(--success)" }}>
          Order Placed Successfully
        </h1>
        <p className="page-subtitle" style={{ marginBottom: "14px" }}>
          Your medicines order has been received and is being processed.
        </p>

        {order ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "14px",
              background: "#f8fdfd",
            }}
          >
            <p style={{ margin: "0 0 8px" }}>
              <strong>Order Number:</strong> {order.orderNumber}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Total:</strong> Rs {Number(order.totalAmount).toFixed(2)}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Pickup:</strong>{" "}
              {new Date(order.pickupSlot?.date).toLocaleDateString()} | {order.pickupSlot?.label}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Address:</strong> {order.address}
            </p>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Order details are unavailable in this view. Open Order History to view full details.
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <Link to="/orders" className="btn-primary">
            Go to Order History
          </Link>
          <Link to="/" className="btn-secondary">
            Continue Shopping
          </Link>
        </div>
      </section>
    </main>
  );
};

export default OrderPlaced;
