import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getMedicines } from "../services/inventoryService";
import { CartContext } from "../context/CartContext";
import { AuthContext } from "../context/AuthContext";

const Shop = () => {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const { cart, addItem, updateItem, removeItem, loading: cartLoading } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

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

  const categories = useMemo(() => {
    const set = new Set(medicines.map((medicine) => medicine.category || "General"));
    return Array.from(set).sort();
  }, [medicines]);

  const cartQtyByMedicineId = useMemo(() => {
    const quantityMap = new Map();
    (cart?.items || []).forEach((item) => {
      quantityMap.set(item.medicineId, item.quantity);
    });
    return quantityMap;
  }, [cart]);

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
    const stockLimit = Math.min(20, Number(medicine.stock) || 0);
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

  return (
    <main className="page-wrap">
      <h1 className="page-title">Order Medicines Online</h1>
      <p className="page-subtitle">
        Browse verified medicines, add to cart, and book a pickup slot near you.
      </p>

      <section className="toolbar">
        <input
          className="input"
          style={{ minWidth: "260px", flex: "1 1 260px" }}
          placeholder="Search by name or medicine code"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </section>

      {loading ? <p className="muted">Loading medicines...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="grid medicine-grid">
        {medicines.map((medicine) => {
          const inCartQty = cartQtyByMedicineId.get(medicine.id) || 0;
          const stockLimit = Math.min(20, Number(medicine.stock) || 0);
          const canIncrease = inCartQty < stockLimit;

          return (
            <article key={medicine.id} className="medicine-card">
              <span className="chip">{medicine.category}</span>
              <h3 className="medicine-name">{medicine.name}</h3>
              <p className="medicine-meta">Code: {medicine.id}</p>
              <p className="medicine-meta">Stock: {medicine.stock}</p>
              <p className="medicine-meta">By {medicine.manufacturer}</p>

              <div className="medicine-footer">
                <span className="price">Rs {Number(medicine.price).toFixed(2)}</span>

                {inCartQty > 0 ? (
                  <div className="qty-stepper">
                    <button
                      className="qty-btn"
                      type="button"
                      onClick={() => handleDecreaseQty(medicine)}
                      disabled={cartLoading}
                    >
                      -
                    </button>
                    <span className="qty-value">{inCartQty}</span>
                    <button
                      className="qty-btn"
                      type="button"
                      onClick={() => handleIncreaseQty(medicine)}
                      disabled={!canIncrease || cartLoading}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => handleAddToCart(medicine.id)}
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
    </main>
  );
};

export default Shop;
