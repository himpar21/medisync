import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { getMedicineById } from "../services/inventoryService";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";
import CustomSelect from "../components/common/CustomSelect";
import { buildAddressConfig } from "../utils/addressOptions";

const MedicineDetails = () => {
  const { medicineId } = useParams();
  const [medicine, setMedicine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAddress, setSelectedAddress] = useState(() => localStorage.getItem("selectedAddress") || "");
  const [manualHostelBlock, setManualHostelBlock] = useState(() =>
    String(localStorage.getItem("manualHostelBlock") || "").trim().toUpperCase()
  );
  const [manualHostelRoomNo, setManualHostelRoomNo] = useState(() =>
    String(localStorage.getItem("manualHostelRoomNo") || "").trim()
  );
  const { cart, addItem, updateItem, removeItem, loading: cartLoading } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
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

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setError("");

    getMedicineById(medicineId)
      .then((item) => {
        if (!mounted) return;
        setMedicine(item || null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.response?.data?.message || "Unable to load medicine details");
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [medicineId]);

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

  const inCartQty = useMemo(() => {
    const existingItem = (cart?.items || []).find((item) => item.medicineId === medicineId);
    return existingItem?.quantity || 0;
  }, [cart, medicineId]);

  const dbAvailableStock = Number(medicine?.availableStock);
  const fallbackAvailableStock =
    Number(medicine?.stock || 0) - Number(medicine?.reservedStock || 0);
  const stockLimit = Math.max(
    0,
    Number.isFinite(dbAvailableStock) ? dbAvailableStock : fallbackAvailableStock
  );
  const lowStockThreshold = Math.max(0, Number(medicine?.lowStockThreshold || 0));
  const isLowStock = stockLimit > 0 && lowStockThreshold > 0 && stockLimit <= lowStockThreshold;
  const canIncrease = inCartQty < stockLimit;

  const requireLogin = () => {
    if (!user) {
      toast.error("Please login to add medicines to cart");
      navigate("/login");
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    if (!requireLogin()) return;
    try {
      await addItem(medicineId, 1);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to add item");
    }
  };

  const handleIncreaseQty = async () => {
    if (!requireLogin()) return;
    if (!canIncrease) return;

    try {
      if (inCartQty === 0) {
        await addItem(medicineId, 1);
      } else {
        await updateItem(medicineId, inCartQty + 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to update cart");
    }
  };

  const handleDecreaseQty = async () => {
    if (!requireLogin()) return;
    if (inCartQty <= 0) return;

    try {
      if (inCartQty === 1) {
        await removeItem(medicineId);
      } else {
        await updateItem(medicineId, inCartQty - 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to update cart");
    }
  };

  const handleGoToCart = () => {
    if (!requireLogin()) return;
    navigate("/cart");
  };

  const handleBuyNow = async () => {
    if (!requireLogin()) return;
    if (!selectedAddress) {
      toast.error("Please select an address");
      return;
    }
    if (isPatientUser && !hasHostelAddress && selectedAddress === hostelAddressLabel) {
      toast.error("Please enter hostel block and room number");
      return;
    }

    try {
      if (inCartQty === 0) {
        await addItem(medicineId, 1);
      }
      navigate("/checkout", { state: { selectedAddress } });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to continue to checkout");
    }
  };

  if (loading) {
    return (
      <main className="page-wrap medicine-details-page">
        <MedicineBrowseBar />
        <p className="muted">Loading medicine details...</p>
      </main>
    );
  }

  if (error || !medicine) {
    return (
      <main className="page-wrap medicine-details-page">
        <MedicineBrowseBar />
        <section className="panel" style={{ padding: "18px" }}>
          <p className="error-text">{error || "Medicine not found"}</p>
          <Link to="/shop" className="btn-primary">
            Back to Shop
          </Link>
        </section>
      </main>
    );
  }

  const availabilityLabel =
    stockLimit <= 0 ? "Out of Stock" : isLowStock ? `Only ${stockLimit} items remaining` : "In Stock";
  const availabilityStatusClass =
    stockLimit <= 0 ? "status-cancelled" : isLowStock ? "status-low-stock" : "status-confirmed";
  const prescriptionLabel = medicine.prescriptionRequired ? "Yes" : "No";
  const price = Number(medicine.price || 0);
  const mrp = Number(medicine.mrp || medicine.price || 0);
  const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const expiryText = medicine.expiryDate
    ? new Date(medicine.expiryDate).toLocaleDateString("en-GB")
    : "Not available";
  const medicalInfoRows = [
    { label: "Uses", value: String(medicine.uses || "").trim() },
    { label: "Dosage", value: String(medicine.dosage || "").trim() },
    { label: "Side Effects", value: String(medicine.sideEffects || "").trim() },
    { label: "Warnings", value: String(medicine.warnings || "").trim() },
    {
      label: "Storage Instructions",
      value: String(medicine.storageInstructions || "").trim(),
    },
  ];

  return (
    <main className="page-wrap medicine-details-page">
      <MedicineBrowseBar />
      <section className="medicine-details-layout">
        <section className="panel medicine-details-main">
          <div className="medicine-hero-grid">
            <div className="medicine-details-head">
              <span className="chip">{medicine.category || "General"}</span>
              <h1 className="page-title medicine-details-title">{medicine.name}</h1>
              <p className="medicine-meta">By {medicine.manufacturer || "Unknown"}</p>
              <p className="medicine-meta">Availability: {availabilityLabel}</p>
              <p className="medicine-meta">Prescription Required (Yes/No): {prescriptionLabel}</p>
            </div>

            <div className="medicine-hero-image-wrap">
              {medicine.imageData ? (
                <img
                  src={medicine.imageData}
                  alt={medicine.name}
                  className="medicine-details-image"
                />
              ) : (
                <div className="medicine-details-image medicine-details-image-placeholder">
                  No Image Available
                </div>
              )}
            </div>
          </div>

          <div className="medicine-details-section-grid">
            <div className="medicine-details-description">
              <h3>Description</h3>
              <p>{medicine.description || "No description available for this medicine."}</p>
            </div>

            <div className="medicine-details-description">
              <h3>Medical Information</h3>
              <div className="medicine-medical-grid">
                {medicalInfoRows.map((row) => (
                  <article key={row.label} className="medicine-medical-item">
                    <h4>{row.label}</h4>
                    <p>{row.value || "Not available for this medicine."}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="medicine-details-meta-grid medicine-details-meta-grid-single">
            <div className="profile-item">
              <span className="profile-key">Expiry Date</span>
              <strong className="profile-value">{expiryText}</strong>
            </div>
          </div>

          <div className="medicine-details-back-link">
            <Link to="/shop" className="btn-secondary">
              Back to Shop
            </Link>
          </div>
        </section>

        <aside className="medicine-right-stack">
          <section className="panel medicine-delivery-card">
            <h3>Pickup Information</h3>
            <div className="medicine-delivery-field">
              <label htmlFor="pickup-address-select">Pickup Address</label>
              <CustomSelect
                id="pickup-address-select"
                className="medicine-pickup-select"
                value={selectedAddress}
                options={addressOptions}
                onChange={setSelectedAddress}
              />
              {showManualHostelEntry ? (
                <div className="medicine-address-inline">
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
            <p className="medicine-meta">Stock and expiry are validated before confirmation.</p>
          </section>

          <section className="panel medicine-buy-card">
            <div className="medicine-buy-price-block">
              <div className="medicine-buy-mrp-row">
                <span className="medicine-meta">
                  {discountPercent > 0 ? (
                    <>
                      MRP <s>Rs {mrp.toFixed(2)}</s>
                    </>
                  ) : (
                    <>MRP Rs {mrp.toFixed(2)}</>
                  )}
                </span>
                {discountPercent > 0 && Number.isFinite(discountPercent) ? (
                  <span className="medicine-buy-discount">{discountPercent}% OFF</span>
                ) : null}
              </div>
              <strong className="medicine-buy-amount">Rs {price.toFixed(2)}</strong>
              <span className="medicine-meta">Inclusive of all taxes</span>
            </div>

            <div className="medicine-buy-status">
              <span className={`status-pill ${availabilityStatusClass}`}>
                {availabilityLabel}
              </span>
            </div>

            <div className="medicine-buy-actions">
              {inCartQty > 0 ? (
                <div className="medicine-buy-active-actions">
                  <div className="qty-stepper">
                    <button
                      className="qty-btn"
                      type="button"
                      onClick={handleDecreaseQty}
                      disabled={cartLoading}
                    >
                      -
                    </button>
                    <span className="qty-value">{inCartQty}</span>
                    <button
                      className="qty-btn"
                      type="button"
                      onClick={handleIncreaseQty}
                      disabled={!canIncrease || cartLoading}
                    >
                      +
                    </button>
                  </div>

                  <div className="medicine-buy-quick-actions">
                    <button
                      type="button"
                      className="btn-secondary medicine-buy-quick-btn"
                      onClick={handleGoToCart}
                    >
                      Go to Cart
                    </button>
                    <button
                      type="button"
                      className="btn-primary medicine-buy-quick-btn"
                      onClick={handleBuyNow}
                    >
                      Buy Now
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-primary medicine-buy-add-btn"
                  type="button"
                  onClick={handleAddToCart}
                  disabled={stockLimit <= 0 || cartLoading}
                >
                  {stockLimit > 0 ? "Add to Cart" : "Out of Stock"}
                </button>
              )}
            </div>

            <p className="medicine-buy-note">
              Final pickup slot and quantity confirmation are available during checkout.
            </p>
          </section>
        </aside>
      </section>

      <section className="panel medicine-mobile-buy-bar" aria-label="Quick purchase bar">
        <div className="medicine-mobile-buy-meta">
          <strong className="medicine-mobile-buy-price">Rs {price.toFixed(2)}</strong>
          <span className={`status-pill ${availabilityStatusClass}`}>{availabilityLabel}</span>
        </div>

        <div className="medicine-mobile-buy-controls">
          {inCartQty > 0 ? (
            <>
              <div className="qty-stepper medicine-mobile-qty-stepper">
                <button
                  className="qty-btn"
                  type="button"
                  onClick={handleDecreaseQty}
                  disabled={cartLoading}
                >
                  -
                </button>
                <span className="qty-value">{inCartQty}</span>
                <button
                  className="qty-btn"
                  type="button"
                  onClick={handleIncreaseQty}
                  disabled={!canIncrease || cartLoading}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary medicine-mobile-cart-btn"
                onClick={handleGoToCart}
              >
                Cart
              </button>
            </>
          ) : (
            <button
              className="btn-primary medicine-mobile-add-btn"
              type="button"
              onClick={handleAddToCart}
              disabled={stockLimit <= 0 || cartLoading}
            >
              {stockLimit > 0 ? "Add to Cart" : "Out of Stock"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
};

export default MedicineDetails;
