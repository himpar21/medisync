import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { fetchOrderById } from "../services/orderService";
import {
  createPaymentIntent,
  fetchPaymentsByOrder,
  fetchStripeConfig,
  syncStripePayment,
} from "../services/paymentService";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";

const formatMoney = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const STRIPE_MIN_AMOUNT_INR = 50;

const STRIPE_APPEARANCE = {
  theme: "stripe",
  variables: {
    colorPrimary: "#24aeb1",
    colorText: "#12263a",
    colorDanger: "#c62828",
    borderRadius: "14px",
  },
};

const STRIPE_PAYMENT_ELEMENT_OPTIONS = {
  layout: "accordion",
  paymentMethodOrder: ["card"],
  wallets: {
    applePay: "never",
    googlePay: "never",
    link: "never",
  },
};

const StripePaymentForm = ({ amountLabel, orderId, onPaymentResolved, disabled }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const submitPayment = async () => {
    const submitResult = await elements.submit();
    if (submitResult.error) {
      const message = submitResult.error.message || "Unable to prepare payment details";
      toast.error(message);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/payments/${orderId}`,
      },
    });

    if (error) {
      toast.error(error.message || "Unable to confirm payment");
      if (paymentIntent?.id) {
        await onPaymentResolved(paymentIntent.id);
      }
      return;
    }

    if (paymentIntent?.id) {
      await onPaymentResolved(paymentIntent.id);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || disabled) {
      return;
    }

    setSubmitting(true);
    await submitPayment();
    setSubmitting(false);
  };

  return (
    <form className="stripe-payment-shell" onSubmit={handleSubmit}>
      <div className="stripe-payment-header">
        <h2>Secure Payment</h2>
        <p>Pay securely by card using Stripe.</p>
      </div>

      <div className="stripe-payment-element-wrap">
        <PaymentElement options={STRIPE_PAYMENT_ELEMENT_OPTIONS} />
      </div>

      <div className="payment-footer-actions">
        <Link to="/orders" className="btn-secondary">
          Back to Orders
        </Link>
        <button
          type="submit"
          className="btn-primary stripe-payment-submit"
          disabled={!stripe || !elements || submitting || disabled}
        >
          {submitting ? "Confirming..." : `Pay ${amountLabel}`}
        </button>
      </div>
    </form>
  );
};

const PaymentPage = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState(location.state?.order || null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stripeKey, setStripeKey] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [initializingIntent, setInitializingIntent] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState(false);
  const handledRedirectRef = useRef(false);
  const initializingIntentRef = useRef(false);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const redirectedPaymentIntentId = searchParams.get("payment_intent") || "";

  const latestPayment = useMemo(() => payments[0] || null, [payments]);
  const isPaid = latestPayment?.status === "succeeded" || order?.paymentStatus === "paid";
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [orderData, paymentItems, stripeConfig] = await Promise.all([
          fetchOrderById(orderId),
          fetchPaymentsByOrder(orderId),
          fetchStripeConfig(),
        ]);
        if (!mounted) {
          return;
        }
        setOrder(orderData);
        setPayments(paymentItems);
        setStripeKey(String(stripeConfig.publishableKey || "").trim());
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError(err.response?.data?.message || "Unable to load payment details");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [orderId]);

  const tax = Number(order?.tax || 0);
  const subtotal = Number(order?.subtotal || 0);
  const total = Number(order?.totalAmount || 0);
  const deliveryFee = Number(order?.deliveryFee || 0);
  const isBelowStripeMinimum = total > 0 && total < STRIPE_MIN_AMOUNT_INR;

  const mergePaymentIntoList = (payment) => {
    if (!payment) {
      return;
    }
    setPayments((current) => [payment, ...current.filter((item) => item.id !== payment.id)]);
  };

  const handlePaymentResolved = useCallback(async (resolvedPaymentIntentId) => {
    if (!order || !resolvedPaymentIntentId) {
      return;
    }

    setSyncingPayment(true);
    try {
      const response = await syncStripePayment({
        orderId: order.id,
        paymentIntentId: resolvedPaymentIntentId,
      });
      const payment = response.payment;
      mergePaymentIntoList(payment);

      if (payment?.status === "succeeded") {
        const updatedOrder = {
          ...order,
          paymentStatus: "paid",
          status: "confirmed",
        };
        setOrder(updatedOrder);
        toast.success("Payment successful");
        navigate("/order-placed", {
          replace: true,
          state: {
            order: updatedOrder,
            payment,
          },
        });
        return;
      }

      if (payment?.status === "failed") {
        setOrder((current) =>
          current
            ? {
                ...current,
                paymentStatus: "failed",
                status: "failed",
              }
            : current,
        );
        toast.error(payment.message || "Payment failed. Please try again.");
        setClientSecret("");
        setPaymentIntentId("");
        return;
      }

      toast("Payment is still pending. Please wait or try again.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to sync Stripe payment");
    } finally {
      setSyncingPayment(false);
    }
  }, [navigate, order]);

  useEffect(() => {
    if (!redirectedPaymentIntentId || handledRedirectRef.current) {
      return;
    }
    if (!order) {
      return;
    }

    handledRedirectRef.current = true;
    handlePaymentResolved(redirectedPaymentIntentId);
  }, [handlePaymentResolved, order, redirectedPaymentIntentId]);

  useEffect(() => {
    if (loading || !order || isPaid || redirectedPaymentIntentId) {
      return;
    }
    if (isBelowStripeMinimum) {
      setError(
        `Stripe payments require at least Rs ${STRIPE_MIN_AMOUNT_INR.toFixed(
          2,
        )}. This order total is Rs ${total.toFixed(2)}.`,
      );
      return;
    }
    if (!stripeKey || clientSecret || initializingIntentRef.current) {
      return;
    }

    let active = true;
    const initializeStripePayment = async () => {
      initializingIntentRef.current = true;
      setInitializingIntent(true);
      try {
        const response = await createPaymentIntent({
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: order.totalAmount,
          currency: order.currency || "INR",
        });
        if (!active) {
          return;
        }

        if (response.payment) {
          mergePaymentIntoList(response.payment);
        }

        if (response.payment?.status === "succeeded") {
          const updatedOrder = {
            ...order,
            paymentStatus: "paid",
            status: "confirmed",
          };
          setOrder(updatedOrder);
          navigate("/order-placed", {
            replace: true,
            state: {
              order: updatedOrder,
              payment: response.payment,
            },
          });
          return;
        }

        setClientSecret(String(response.clientSecret || "").trim());
        setPaymentIntentId(String(response.paymentIntentId || "").trim());
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err.response?.data?.message || "Unable to initialize Stripe payment");
      } finally {
        initializingIntentRef.current = false;
        if (active) {
          setInitializingIntent(false);
        }
      }
    };

    initializeStripePayment();
    return () => {
      active = false;
    };
  }, [
    clientSecret,
    isBelowStripeMinimum,
    isPaid,
    loading,
    navigate,
    order,
    redirectedPaymentIntentId,
    stripeKey,
    total,
  ]);

  return (
    <main className="page-wrap checkout-page payment-page">
      <MedicineBrowseBar />
      <h1 className="page-title">Payment</h1>
      <p className="page-subtitle">Complete your payment securely with Stripe.</p>

      <section className="payment-layout">
        <article className="panel payment-main-panel">
          {loading ? <p className="muted">Loading order...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          {!loading && order ? (
            <>
              {isPaid ? (
                <section className="payment-success-panel">
                  <h2>Payment already completed</h2>
                  <p>
                    This order has already been paid successfully. You can open the confirmation page
                    or review it in order history.
                  </p>
                  <div className="payment-footer-actions">
                    <Link to="/orders" className="btn-secondary">
                      Go to Orders
                    </Link>
                    <Link to="/order-placed" className="btn-primary" state={{ order }}>
                      View Order Confirmation
                    </Link>
                  </div>
                </section>
              ) : (
                <>
                  {isBelowStripeMinimum ? (
                    <section className="payment-step-panel">
                      <h2 className="payment-step-title">Amount Too Low for Stripe</h2>
                      <p className="payment-step-copy" style={{ marginTop: "8px" }}>
                        Stripe payments for this setup require at least Rs{" "}
                        {STRIPE_MIN_AMOUNT_INR.toFixed(2)}. Your current order total is{" "}
                        {formatMoney(total)}.
                      </p>
                      <div className="payment-footer-actions">
                        <Link to="/shop" className="btn-secondary">
                          Continue Shopping
                        </Link>
                        <Link to="/cart" className="btn-primary">
                          Update Cart
                        </Link>
                      </div>
                    </section>
                  ) : null}

                  {initializingIntent || syncingPayment ? (
                    <section className="payment-step-panel">
                      <h2 className="payment-step-title">
                        {syncingPayment ? "Verifying payment..." : "Preparing Stripe checkout..."}
                      </h2>
                      <p className="payment-step-copy" style={{ marginTop: "8px" }}>
                        Please wait while we connect your order to Stripe securely.
                      </p>
                    </section>
                  ) : null}

                  {!isBelowStripeMinimum &&
                  !initializingIntent &&
                  !syncingPayment &&
                  stripePromise &&
                  clientSecret ? (
                    <section className="payment-step-panel">
                      <Elements
                        stripe={stripePromise}
                        options={{
                          clientSecret,
                          appearance: STRIPE_APPEARANCE,
                        }}
                      >
                        <StripePaymentForm
                          amountLabel={formatMoney(total)}
                          orderId={order.id}
                          disabled={syncingPayment || !paymentIntentId}
                          onPaymentResolved={handlePaymentResolved}
                        />
                      </Elements>
                    </section>
                  ) : null}

                  {payments.length ? (
                    <section className="panel payment-history-panel">
                      <h3 className="payment-history-title">Transaction History</h3>
                      <div className="payment-history-list">
                        {payments.map((payment) => (
                          <article key={payment.id} className="payment-history-item">
                            <div>
                              <strong>{payment.paymentNumber}</strong>
                              <p className="muted">
                                {String(payment.method || "stripe").toUpperCase()} |{" "}
                                {payment.transactionRef || "N/A"}
                              </p>
                            </div>
                            <strong className={`payment-status payment-status-${payment.status}`}>
                              {payment.status}
                            </strong>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </article>

        <aside className="panel payment-summary-panel">
          <h3 className="checkout-block-title">Order Summary</h3>
          <div className="checkout-summary-stack">
            <span className="muted">Order: {order?.orderNumber || "Loading..."}</span>
            <span className="muted">Items: {order?.totalItems || 0}</span>
            <div className="checkout-summary-list">
              <div className="checkout-summary-row">
                <span>Subtotal</span>
                <strong>{formatMoney(subtotal)}</strong>
              </div>
              <div className="checkout-summary-row">
                <span>Tax</span>
                <strong>{formatMoney(tax)}</strong>
              </div>
              <div className="checkout-summary-row">
                <span>Delivery Fee</span>
                <strong>{formatMoney(deliveryFee)}</strong>
              </div>
              <div className="checkout-summary-row checkout-summary-total">
                <span>Total</span>
                <strong>{formatMoney(total)}</strong>
              </div>
            </div>

            <div className="payment-summary-details">
              <div className="payment-summary-line">
                <span>Pickup</span>
                <strong>
                  {order?.pickupSlot?.date
                    ? new Date(order.pickupSlot.date).toLocaleDateString()
                    : "N/A"}{" "}
                  {order?.pickupSlot?.label ? `| ${order.pickupSlot.label}` : ""}
                </strong>
              </div>
              <div className="payment-summary-line">
                <span>Address</span>
                <strong>{order?.address || "N/A"}</strong>
              </div>
              <div className="payment-summary-line">
                <span>Status</span>
                <strong>{order?.paymentStatus || "pending"}</strong>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
};

export default PaymentPage;
