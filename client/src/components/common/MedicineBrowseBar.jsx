import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import CustomSelect from "./CustomSelect";
import { getInventoryCategories, getMedicines } from "../../services/inventoryService";

const SUGGESTION_LIMIT = 6;

function buildSearchParams(query, category) {
  const params = new URLSearchParams();
  const nextQuery = String(query || "").trim();
  const nextCategory = String(category || "").trim();

  if (nextQuery) {
    params.set("q", nextQuery);
  }

  if (nextCategory) {
    params.set("category", nextCategory);
  }

  return params;
}

const MedicineBrowseBar = ({ mode = "redirect", onFilterClick = null }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState(() =>
    mode === "shop" ? String(searchParams.get("q") || "").trim() : ""
  );
  const [category, setCategory] = useState(() =>
    mode === "shop" ? String(searchParams.get("category") || "").trim() : ""
  );
  const [categories, setCategories] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    getInventoryCategories()
      .then((items) => {
        if (mounted) {
          setCategories(Array.isArray(items) ? items : []);
        }
      })
      .catch(() => {
        if (mounted) {
          setCategories([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "shop") {
      return;
    }

    setQuery(String(searchParams.get("q") || "").trim());
    setCategory(String(searchParams.get("category") || "").trim());
  }, [mode, searchParams]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsSuggestionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
      setSuggestions([]);
      setIsSuggestionsOpen(false);
      return undefined;
    }

    let isActive = true;
    const timer = setTimeout(async () => {
      try {
        const items = await getMedicines({
          q: trimmedQuery,
          category: String(category || "").trim() || undefined,
        });

        if (!isActive) {
          return;
        }

        const nextSuggestions = (items || []).slice(0, SUGGESTION_LIMIT);
        setSuggestions(nextSuggestions);
        setIsSuggestionsOpen(nextSuggestions.length > 0);
      } catch (_error) {
        if (!isActive) {
          return;
        }

        setSuggestions([]);
        setIsSuggestionsOpen(false);
      }
    }, 180);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [query, category]);

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "All Categories" },
      ...categories.map((item) => ({ value: item, label: item })),
    ],
    [categories]
  );

  const syncShopFilters = (nextQuery, nextCategory) => {
    const params = buildSearchParams(nextQuery, nextCategory);
    setSearchParams(params, { replace: true });
  };

  const goToShop = (nextQuery = query, nextCategory = category) => {
    const params = buildSearchParams(nextQuery, nextCategory);
    navigate(`/shop${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleQueryChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);

    if (mode === "shop") {
      syncShopFilters(nextQuery, category);
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length) {
      setIsSuggestionsOpen(true);
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    setIsSuggestionsOpen(false);

    if (mode === "shop") {
      syncShopFilters(query, category);
      return;
    }

    goToShop();
  };

  const handleCategoryChange = (nextCategory) => {
    setCategory(nextCategory);

    if (mode === "shop") {
      syncShopFilters(query, nextCategory);
      return;
    }

    goToShop(query, nextCategory);
  };

  const handleSuggestionSelect = (medicineId) => {
    setIsSuggestionsOpen(false);
    setSuggestions([]);
    navigate(`/medicines/${medicineId}`);
  };

  const handleFilterClick = () => {
    if (typeof onFilterClick === "function") {
      onFilterClick();
      return;
    }

    if (mode !== "shop") {
      goToShop(query, category);
      return;
    }

    const filterPanel = document.querySelector(".shop-filters-panel");
    if (filterPanel) {
      filterPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section ref={rootRef} className="toolbar shop-toolbar page-medicine-browse-bar">
      <div className="page-browse-search-wrap">
        <input
          ref={inputRef}
          className="input shop-search-input"
          placeholder="Search by name or medicine code"
          value={query}
          onChange={handleQueryChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
        />

        {isSuggestionsOpen ? (
          <div className="page-browse-suggestion-menu">
            {suggestions.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                className="page-browse-suggestion"
                onClick={() => handleSuggestionSelect(medicine.id)}
              >
                <div className="page-browse-suggestion-copy">
                  <strong>{medicine.name}</strong>
                  <span>
                    {medicine.category || "General"}
                    {medicine.manufacturer ? ` | ${medicine.manufacturer}` : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="shop-browse-actions">
        <CustomSelect
          className="shop-category-select"
          value={category}
          options={categoryOptions}
          onChange={handleCategoryChange}
        />
        <button type="button" className="btn-secondary shop-filter-btn" onClick={handleFilterClick}>
          <SlidersHorizontal size={16} />
          <span>Filters</span>
        </button>
      </div>
    </section>
  );
};

export default MedicineBrowseBar;
