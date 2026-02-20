import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOrderById } from "../services/orderService";

const PaymentPage = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchOrderById(orderId)
      .then((item) => {
        if (mounted) {
          setOrder(item);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.response?.data?.message || "Unable to load order");
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
  }, [orderId]);

  return (
    <main className="page-wrap">
      <h1 className="page-title">Payment</h1>
      <p className="page-subtitle">Payment service integration is ready for Module 4 handoff.</p>

      <section className="panel" style={{ padding: "18px" }}>
        {loading ? <p className="muted">Loading order...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && order ? (
          <div className="stack">
            <strong>Order: {order.orderNumber}</strong>
            <span>Total: Rs {Number(order.totalAmount).toFixed(2)}</span>
            <span>Current Payment Status: {order.paymentStatus}</span>
            <span className="muted">
              Use Module 4 APIs to complete payment capture and confirmation flow.
            </span>
          </div>
        ) : null}
        <div style={{ marginTop: "16px" }}>
          <Link to="/orders" className="btn-primary">
            Back to Orders
          </Link>
        </div>
      </section>
    </main>
  );
};

export default PaymentPage;
