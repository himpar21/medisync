import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { getMedicines } from "../services/inventoryService";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";

const Shop = () => {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [priceLimit, setPriceLimit] = useState(0);
  const [openSections, setOpenSections] = useState({
    category: true,
    brands: true,
    price: true,
  });
  const [searchParams] = useSearchParams();
  const { cart, addItem, updateItem, removeItem, loading: cartLoading } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    setQuery(String(searchParams.get("q") || "").trim());
    setCategory(String(searchParams.get("category") || "").trim());
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    getMedicines({ q: query, category })
      .then((items) => {
        if (mounted) {
          setMedicines(items);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.response?.data?.message || "Unable to load medicines");
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
  }, [query, category]);

  const cartQtyByMedicineId = useMemo(() => {
    const quantityMap = new Map();
    (cart?.items || []).forEach((item) => {
      quantityMap.set(item.medicineId, item.quantity);
    });
    return quantityMap;
  }, [cart]);

  const categoryOptions = useMemo(
    () =>
      [...new Set(medicines.map((medicine) => String(medicine.category || "").trim()).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right),
      ),
    [medicines],
  );

  const brandOptions = useMemo(
    () =>
      [
        ...new Set(
          medicines.map((medicine) => String(medicine.manufacturer || "").trim()).filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [medicines],
  );

  const maxPrice = useMemo(
    () => medicines.reduce((highest, medicine) => Math.max(highest, Number(medicine.price) || 0), 0),
    [medicines],
  );

  useEffect(() => {
    setPriceLimit(maxPrice);
  }, [maxPrice]);

  useEffect(() => {
    setSelectedCategories((current) => current.filter((item) => categoryOptions.includes(item)));
  }, [categoryOptions]);

  useEffect(() => {
    setSelectedBrands((current) => current.filter((item) => brandOptions.includes(item)));
  }, [brandOptions]);

  const filteredMedicines = useMemo(() => {
    return medicines.filter((medicine) => {
      const matchesCategory =
        selectedCategories.length === 0 || selectedCategories.includes(String(medicine.category || "").trim());
      const matchesBrand =
        selectedBrands.length === 0 || selectedBrands.includes(String(medicine.manufacturer || "").trim());
      const matchesPrice = (Number(medicine.price) || 0) <= priceLimit;

      return matchesCategory && matchesBrand && matchesPrice;
    });
  }, [medicines, priceLimit, selectedBrands, selectedCategories]);

  const requireLogin = () => {
    if (!user) {
      toast.error("Please login to add medicines to cart");
      navigate("/login");
      return false;
    }
    return true;
  };

  const handleAddToCart = async (medicineId) => {
    if (!requireLogin()) return;
    try {
      await addItem(medicineId, 1);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to add item");
    }
  };

  const handleIncreaseQty = async (medicine) => {
    if (!requireLogin()) return;

    const currentQty = cartQtyByMedicineId.get(medicine.id) || 0;
    const stockLimit = getStockLimit(medicine);
    if (stockLimit <= 0 || currentQty >= stockLimit) {
      return;
    }

    try {
      if (currentQty === 0) {
        await addItem(medicine.id, 1);
      } else {
        await updateItem(medicine.id, currentQty + 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to update cart");
    }
  };

  const handleDecreaseQty = async (medicine) => {
    if (!requireLogin()) return;

    const currentQty = cartQtyByMedicineId.get(medicine.id) || 0;
    if (currentQty <= 0) {
      return;
    }

    try {
      if (currentQty === 1) {
        await removeItem(medicine.id);
      } else {
        await updateItem(medicine.id, currentQty - 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to update cart");
    }
  };

  const openMedicineDetails = (medicineId) => {
    navigate(`/medicines/${medicineId}`);
  };

  const toggleFilterOption = (value, setSelectedValues) => {
    setSelectedValues((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const toggleSection = (sectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  const getStockLimit = (medicine) =>
    Math.min(20, Math.max(0, Number(medicine.availableStock ?? medicine.stock) || 0));

  return (
    <main className="page-wrap shop-page">
      <MedicineBrowseBar mode="shop" />
      <h1 className="page-title">Order Medicines Online</h1>
      <p className="page-subtitle">
        Browse verified medicines, add to cart, and book a pickup slot near you.
      </p>

      <div className="shop-content-layout">
        <section className="shop-results-column">
          {loading ? <p className="muted">Loading medicines...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          {!loading && !error && filteredMedicines.length === 0 ? (
            <div className="panel shop-empty-state">
              <h2>No medicines match these filters</h2>
              <p>Try removing some filters or search with a different medicine name or code.</p>
            </div>
          ) : null}

          <section className="grid medicine-grid shop-grid">
            {filteredMedicines.map((medicine) => {
              const inCartQty = cartQtyByMedicineId.get(medicine.id) || 0;
              const stockLimit = getStockLimit(medicine);
              const canIncrease = inCartQty < stockLimit;

              return (
                <article
                  key={medicine.id}
                  className="medicine-card shop-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openMedicineDetails(medicine.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMedicineDetails(medicine.id);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {medicine.imageData ? (
                    <img
                      src={medicine.imageData}
                      alt={medicine.name}
                      className="medicine-card-image shop-card-image"
                      loading="lazy"
                    />
                  ) : (
                    <div className="medicine-card-image medicine-card-image-placeholder shop-card-image">
                      No Image
                    </div>
                  )}
                  <span className="chip">{medicine.category}</span>
                  <h3 className="medicine-name">{medicine.name}</h3>
                  <p className="medicine-meta">By {medicine.manufacturer}</p>
                  <p className="medicine-meta">
                    Prescription Required (Yes/No): {medicine.prescriptionRequired ? "Yes" : "No"}
                  </p>

                  <div className="medicine-footer shop-card-footer">
                    <span className="price">Rs {Number(medicine.price).toFixed(2)}</span>

                    {inCartQty > 0 ? (
                      <div className="qty-stepper">
                        <button
                          className="qty-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDecreaseQty(medicine);
                          }}
                          disabled={cartLoading}
                        >
                          -
                        </button>
                        <span className="qty-value">{inCartQty}</span>
                        <button
                          className="qty-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleIncreaseQty(medicine);
                          }}
                          disabled={!canIncrease || cartLoading}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAddToCart(medicine.id);
                        }}
                        disabled={stockLimit <= 0 || cartLoading}
                      >
                        {stockLimit > 0 ? "Add to Cart" : "Out of Stock"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </section>

        <aside className="panel shop-filters-panel">
          <div className="shop-filters-head">
            <h2>Filters</h2>
          </div>

          <section className="shop-filter-section">
            <button
              type="button"
              className="shop-filter-toggle"
              onClick={() => toggleSection("category")}
            >
              <span>Category</span>
              <span className={`shop-filter-caret ${openSections.category ? "is-open" : ""}`} />
            </button>
            {openSections.category ? (
              <div className="shop-filter-options">
                {categoryOptions.length > 0 ? (
                  categoryOptions.map((option) => (
                    <label key={option} className="shop-filter-check">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(option)}
                        onChange={() => toggleFilterOption(option, setSelectedCategories)}
                      />
                      <span>{option}</span>
                    </label>
                  ))
                ) : (
                  <p className="shop-filter-empty">No categories available</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="shop-filter-section">
            <button
              type="button"
              className="shop-filter-toggle"
              onClick={() => toggleSection("brands")}
            >
              <span>Brands</span>
              <span className={`shop-filter-caret ${openSections.brands ? "is-open" : ""}`} />
            </button>
            {openSections.brands ? (
              <div className="shop-filter-options">
                {brandOptions.length > 0 ? (
                  brandOptions.map((option) => (
                    <label key={option} className="shop-filter-check">
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(option)}
                        onChange={() => toggleFilterOption(option, setSelectedBrands)}
                      />
                      <span>{option}</span>
                    </label>
                  ))
                ) : (
                  <p className="shop-filter-empty">No brands available</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="shop-filter-section">
            <button
              type="button"
              className="shop-filter-toggle"
              onClick={() => toggleSection("price")}
            >
              <span>Price</span>
              <span className={`shop-filter-caret ${openSections.price ? "is-open" : ""}`} />
            </button>
            {openSections.price ? (
              <div className="shop-filter-options shop-price-filter">
                <p className="shop-price-range">
                  Rs 0 - Rs {Math.round(priceLimit || maxPrice).toLocaleString("en-IN")}
                </p>
                <input
                  className="shop-price-slider"
                  type="range"
                  min="0"
                  max={Math.max(1, Math.ceil(maxPrice))}
                  step="1"
                  value={Math.min(priceLimit, Math.max(1, Math.ceil(maxPrice)))}
                  onChange={(event) => setPriceLimit(Number(event.target.value))}
                />
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
};

export default Shop;
