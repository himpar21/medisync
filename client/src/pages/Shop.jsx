import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { getMedicines } from "../services/inventoryService";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";
import MedicineBrowseBar from "../components/common/MedicineBrowseBar";

const PRICE_RANGE_OPTIONS = [
  { id: "all", label: "All Prices", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under-200", label: "Under Rs 200", min: 0, max: 199 },
  { id: "200-499", label: "Rs 200 - Rs 499", min: 200, max: 499 },
  { id: "500-999", label: "Rs 500 - Rs 999", min: 500, max: 999 },
  { id: "1000-1999", label: "Rs 1,000 - Rs 1,999", min: 1000, max: 1999 },
  { id: "2000-plus", label: "Rs 2,000 & Above", min: 2000, max: Number.POSITIVE_INFINITY },
];

const getPriceRangeById = (rangeId) =>
  PRICE_RANGE_OPTIONS.find((range) => range.id === rangeId) || PRICE_RANGE_OPTIONS[0];

const Shop = () => {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [draftSelectedCategories, setDraftSelectedCategories] = useState([]);
  const [draftSelectedBrands, setDraftSelectedBrands] = useState([]);
  const [draftSelectedPriceRange, setDraftSelectedPriceRange] = useState("all");
  const [activeMobileFilterSection, setActiveMobileFilterSection] = useState("category");
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

  useEffect(() => {
    setSelectedCategories((current) => current.filter((item) => categoryOptions.includes(item)));
  }, [categoryOptions]);

  useEffect(() => {
    setDraftSelectedCategories((current) => current.filter((item) => categoryOptions.includes(item)));
  }, [categoryOptions]);

  useEffect(() => {
    setSelectedBrands((current) => current.filter((item) => brandOptions.includes(item)));
  }, [brandOptions]);

  useEffect(() => {
    setDraftSelectedBrands((current) => current.filter((item) => brandOptions.includes(item)));
  }, [brandOptions]);

  const selectedPriceRangeOption = useMemo(
    () => getPriceRangeById(selectedPriceRange),
    [selectedPriceRange],
  );

  useEffect(() => {
    if (!isMobileFiltersOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileFiltersOpen]);

  const filteredMedicines = useMemo(() => {
    return medicines.filter((medicine) => {
      const matchesCategory =
        selectedCategories.length === 0 || selectedCategories.includes(String(medicine.category || "").trim());
      const matchesBrand =
        selectedBrands.length === 0 || selectedBrands.includes(String(medicine.manufacturer || "").trim());
      const medicinePrice = Number(medicine.price) || 0;
      const matchesPrice =
        medicinePrice >= selectedPriceRangeOption.min && medicinePrice <= selectedPriceRangeOption.max;

      return matchesCategory && matchesBrand && matchesPrice;
    });
  }, [medicines, selectedBrands, selectedCategories, selectedPriceRangeOption]);

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

  const openMobileFilters = () => {
    setDraftSelectedCategories([...selectedCategories]);
    setDraftSelectedBrands([...selectedBrands]);
    setDraftSelectedPriceRange(selectedPriceRange);
    setActiveMobileFilterSection("category");
    setIsMobileFiltersOpen(true);
  };

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false);
  };

  const applyMobileFilters = () => {
    setSelectedCategories([...draftSelectedCategories]);
    setSelectedBrands([...draftSelectedBrands]);
    setSelectedPriceRange(draftSelectedPriceRange);
    setIsMobileFiltersOpen(false);
  };

  const renderCategoryOptions = (selectedCategoriesState, setSelectedCategoriesState) => (
    <div className="shop-filter-options">
      {categoryOptions.length > 0 ? (
        categoryOptions.map((option) => (
          <label key={option} className="shop-filter-check">
            <input
              type="checkbox"
              checked={selectedCategoriesState.includes(option)}
              onChange={() => toggleFilterOption(option, setSelectedCategoriesState)}
            />
            <span>{option}</span>
          </label>
        ))
      ) : (
        <p className="shop-filter-empty">No categories available</p>
      )}
    </div>
  );

  const renderBrandOptions = (selectedBrandsState, setSelectedBrandsState) => (
    <div className="shop-filter-options">
      {brandOptions.length > 0 ? (
        brandOptions.map((option) => (
          <label key={option} className="shop-filter-check">
            <input
              type="checkbox"
              checked={selectedBrandsState.includes(option)}
              onChange={() => toggleFilterOption(option, setSelectedBrandsState)}
            />
            <span>{option}</span>
          </label>
        ))
      ) : (
        <p className="shop-filter-empty">No brands available</p>
      )}
    </div>
  );

  const renderPriceOptions = (selectedPriceRangeState, setSelectedPriceRangeState, inputGroupName) => (
    <div className="shop-filter-options shop-price-range-options">
      {PRICE_RANGE_OPTIONS.map((option) => (
        <label key={option.id} className="shop-filter-check shop-filter-radio">
          <input
            type="radio"
            name={inputGroupName}
            checked={selectedPriceRangeState === option.id}
            onChange={() => setSelectedPriceRangeState(option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );

  const renderFilterSections = ({
    selectedCategoriesState,
    setSelectedCategoriesState,
    selectedBrandsState,
    setSelectedBrandsState,
    selectedPriceRangeState,
    setSelectedPriceRangeState,
    priceRangeInputGroupName,
  }) => (
    <>
      <section className="shop-filter-section">
        <button
          type="button"
          className="shop-filter-toggle"
          onClick={() => toggleSection("category")}
        >
          <span>Category</span>
          <span className={`shop-filter-caret ${openSections.category ? "is-open" : ""}`} />
        </button>
        {openSections.category ? renderCategoryOptions(selectedCategoriesState, setSelectedCategoriesState) : null}
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
        {openSections.brands ? renderBrandOptions(selectedBrandsState, setSelectedBrandsState) : null}
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
        {openSections.price
          ? renderPriceOptions(
              selectedPriceRangeState,
              setSelectedPriceRangeState,
              priceRangeInputGroupName,
            )
          : null}
      </section>
    </>
  );

  const welcomeName = String(user?.name || "").trim();

  return (
    <main className="page-wrap shop-page">
      <MedicineBrowseBar mode="shop" onFilterClick={openMobileFilters} />
      <h1 className="page-title shop-welcome-title">{welcomeName ? `Welcome, ${welcomeName}` : "Welcome"}</h1>

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
          {renderFilterSections({
            selectedCategoriesState: selectedCategories,
            setSelectedCategoriesState: setSelectedCategories,
            selectedBrandsState: selectedBrands,
            setSelectedBrandsState: setSelectedBrands,
            selectedPriceRangeState: selectedPriceRange,
            setSelectedPriceRangeState: setSelectedPriceRange,
            priceRangeInputGroupName: "desktop-price-range",
          })}
        </aside>
      </div>

      {isMobileFiltersOpen ? (
        <div className="shop-filter-modal-backdrop" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="panel shop-filter-modal">
            <div className="shop-filter-modal-head">
              <h2>Filters</h2>
              <button type="button" className="shop-filter-close-btn" onClick={closeMobileFilters}>
                Close
              </button>
            </div>

            <div className="shop-filter-modal-body">
              <div className="shop-filter-modal-layout">
                <nav className="shop-filter-mobile-nav" aria-label="Filter sections">
                  <button
                    type="button"
                    className={`shop-filter-mobile-nav-btn ${
                      activeMobileFilterSection === "category" ? "is-active" : ""
                    }`}
                    onClick={() => setActiveMobileFilterSection("category")}
                  >
                    Category
                  </button>
                  <button
                    type="button"
                    className={`shop-filter-mobile-nav-btn ${
                      activeMobileFilterSection === "brands" ? "is-active" : ""
                    }`}
                    onClick={() => setActiveMobileFilterSection("brands")}
                  >
                    Brands
                  </button>
                  <button
                    type="button"
                    className={`shop-filter-mobile-nav-btn ${
                      activeMobileFilterSection === "price" ? "is-active" : ""
                    }`}
                    onClick={() => setActiveMobileFilterSection("price")}
                  >
                    Price
                  </button>
                </nav>

                <div className="shop-filter-mobile-content">
                  <h3 className="shop-filter-mobile-section-title">
                    {activeMobileFilterSection === "category"
                      ? "Category"
                      : activeMobileFilterSection === "brands"
                        ? "Brands"
                        : "Price"}
                  </h3>

                  {activeMobileFilterSection === "category"
                    ? renderCategoryOptions(draftSelectedCategories, setDraftSelectedCategories)
                    : null}
                  {activeMobileFilterSection === "brands"
                    ? renderBrandOptions(draftSelectedBrands, setDraftSelectedBrands)
                    : null}
                  {activeMobileFilterSection === "price"
                    ? renderPriceOptions(
                        draftSelectedPriceRange,
                        setDraftSelectedPriceRange,
                        "mobile-price-range",
                      )
                    : null}
                </div>
              </div>
            </div>

            <div className="shop-filter-modal-actions">
              <button type="button" className="btn-secondary" onClick={closeMobileFilters}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={applyMobileFilters}>
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default Shop;
