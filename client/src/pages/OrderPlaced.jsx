import React from "react";
import { Link, useLocation } from "react-router-dom";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";

const OrderPlaced = () => {
  const location = useLocation();
  const order = location.state?.order;
  const payment = location.state?.payment;

  return (
    <main className="page-wrap">
      <MedicineBrowseBar />
      <section className="panel" style={{ padding: "28px", maxWidth: "760px", margin: "0 auto" }}>
        <h1 className="page-title" style={{ color: "var(--success)" }}>
          Order Placed Successfully
        </h1>
        <p className="page-subtitle" style={{ marginBottom: "14px" }}>
          Your payment is complete and your medicines order has been confirmed.
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
            {payment?.paymentNumber ? (
              <p style={{ margin: "0 0 8px" }}>
                <strong>Payment Ref:</strong> {payment.paymentNumber}
              </p>
            ) : null}
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
            Payment has been completed. Open Order History to view the full order details.
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <Link to="/orders" className="btn-primary">
            Go to Order History
          </Link>
          <Link to="/shop" className="btn-secondary">
            Continue Shopping
          </Link>
        </div>
      </section>
    </main>
  );
};

export default OrderPlaced;
