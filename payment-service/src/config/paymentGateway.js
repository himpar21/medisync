const SUCCESS_PROBABILITY = 0.88;

function randomReference(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

async function processPayment(payload) {
  const amount = Number(payload.amount || 0);
  const forceStatus = String(payload.forceStatus || "").trim().toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      success: false,
      gatewayStatus: "invalid_amount",
      transactionRef: randomReference("PAY"),
      message: "Invalid payment amount",
    };
  }

  if (forceStatus === "failed") {
    return {
      success: false,
      gatewayStatus: "declined",
      transactionRef: randomReference("PAY"),
      message: "Payment declined by issuer",
    };
  }

  if (forceStatus === "succeeded" || forceStatus === "success") {
    return {
      success: true,
      gatewayStatus: "captured",
      transactionRef: randomReference("PAY"),
      message: "Payment captured successfully",
    };
  }

  const succeeded = Math.random() < SUCCESS_PROBABILITY;
  return {
    success: succeeded,
    gatewayStatus: succeeded ? "captured" : "declined",
    transactionRef: randomReference("PAY"),
    message: succeeded ? "Payment captured successfully" : "Payment declined by issuer",
  };
}

module.exports = {
  processPayment,
};
