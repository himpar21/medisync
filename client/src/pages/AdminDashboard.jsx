import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Boxes, LayoutDashboard, LogOut, PlusCircle, User, Users } from "lucide-react";
import {
  createMedicine,
  deleteMedicine,
  getExpiryAlerts,
  getInventoryCategories,
  getLowStockAlerts,
  getMedicines,
  updateMedicine,
} from "../services/inventoryService";
import {
  fetchAdminSummary,
  fetchDailySales,
  fetchTopMedicines,
  fetchUserActivity,
} from "../services/analyticsService";
import { fetchUsers } from "../services/authService";
import { fetchOrders } from "../services/orderService";
import { AuthContext } from "../context/AuthContext";
import CustomSelect from "../components/common/CustomSelect";

const EMPTY_FORM = {
  code: "",
  name: "",
  category: "",
  manufacturer: "",
  prescriptionRequired: "no",
  price: "",
  stock: "",
  lowStockThreshold: "10",
  expiryDate: "",
  batchNo: "",
  description: "",
  uses: "",
  dosage: "",
  sideEffects: "",
  warnings: "",
  storageInstructions: "",
  imageData: "",
};

const PAGE_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "user-activity-orders", label: "User Activity & Orders", icon: Users },
  { id: "add-medicine", label: "Add Medicines", icon: PlusCircle },
  { id: "inventory", label: "Inventory & Catalogue", icon: Boxes },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCurrentStockValue(medicine) {
  const availableStock = Number(medicine?.availableStock);
  if (Number.isFinite(availableStock) && availableStock >= 0) {
    return Math.max(0, Math.floor(availableStock));
  }

  const stock = Number(medicine?.stock);
  const reservedStock = Number(medicine?.reservedStock);
  if (Number.isFinite(stock) && Number.isFinite(reservedStock)) {
    return Math.max(0, Math.floor(stock - reservedStock));
  }

  if (Number.isFinite(stock) && stock >= 0) {
    return Math.max(0, Math.floor(stock));
  }

  return 0;
}

function formatMoney(value) {
  return `Rs ${toNumber(value, 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString();
}

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

function getBatchLabelList(medicine) {
  if (Array.isArray(medicine?.batches) && medicine.batches.length) {
    return medicine.batches
      .map((batch) => String(batch?.batchNo || "").trim())
      .filter(Boolean);
  }

  const singleBatch = String(medicine?.batchNo || "").trim();
  return singleBatch ? [singleBatch] : [];
}

function formatBatchSummary(medicine) {
  const batchLabels = getBatchLabelList(medicine);
  if (!batchLabels.length) {
    return "N/A";
  }

  if (batchLabels.length <= 2) {
    return batchLabels.join(", ");
  }

  return `${batchLabels.slice(0, 2).join(", ")} +${batchLabels.length - 2} more`;
}

function getId(item) {
  return String(item?.id || item?._id || "");
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeUserRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "patient" ? "student" : normalized;
}

function toTitleLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const AdminDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const profileLabel = String(user?.name || "").trim() || "Profile";
  const [activePage, setActivePage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState({
    totals: {
      orders: 0,
      medicines: 0,
      users: 0,
      pendingPayments: 0,
      revenue: 0,
    },
  });
  const [dailySales, setDailySales] = useState([]);
  const [topMedicines, setTopMedicines] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);

  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiryItems, setExpiryItems] = useState([]);
  const [busyById, setBusyById] = useState({});

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingMedicineId, setEditingMedicineId] = useState("");
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editImageUploading, setEditImageUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);

  const inventoryValue = useMemo(
    () =>
      medicines.reduce(
        (sum, medicine) =>
          sum + toNumber(medicine.price, 0) * Math.max(0, toNumber(medicine.stock, 0)),
        0
      ),
    [medicines]
  );

  const overviewCards = useMemo(
    () => [
      {
        label: "Total Orders",
        value: Math.max(toNumber(summary?.totals?.orders, 0), orders.length),
      },
      {
        label: "Total Medicines",
        value: medicines.length || toNumber(summary?.totals?.medicines, 0),
      },
      {
        label: "Users",
        value: users.filter((item) => normalizeUserRole(item?.role) === "student").length,
      },
      {
        label: "Sales Revenue",
        value: formatMoney(summary?.totals?.revenue),
      },
      {
        label: "Inventory Value",
        value: formatMoney(inventoryValue),
      },
    ],
    [summary, orders.length, medicines.length, users, inventoryValue]
  );

  const salesChartItems = useMemo(() => [...dailySales].reverse(), [dailySales]);

  const filteredMedicines = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();

    return medicines.filter((medicine) => {
      const inCategory =
        !catalogCategory || String(medicine.category || "") === String(catalogCategory);

      if (!normalizedQuery) {
        return inCategory;
      }

      const searchable = [
        medicine.name,
        medicine.code,
        medicine.category,
        medicine.manufacturer,
        medicine.batchNo,
        ...getBatchLabelList(medicine),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return inCategory && searchable.includes(normalizedQuery);
    });
  }, [medicines, catalogQuery, catalogCategory]);

  const recentOrders = useMemo(() => orders.slice(0, 30), [orders]);
  const medicineByCode = useMemo(() => {
    const codeMap = new Map();

    medicines.forEach((medicine) => {
      const code = String(medicine?.code || "").trim().toUpperCase();
      if (!code || codeMap.has(code)) {
        return;
      }
      codeMap.set(code, medicine);
    });

    return codeMap;
  }, [medicines]);
  const matchedExistingMedicine = useMemo(
    () => medicineByCode.get(String(form.code || "").trim().toUpperCase()) || null,
    [medicineByCode, form.code]
  );
  const isCodeAutofillMode = Boolean(matchedExistingMedicine);
  const codeSuggestions = useMemo(() => {
    const normalizedQuery = String(form.code || "").trim().toUpperCase();
    const suggestionSource = medicines
      .filter((medicine) => {
        const code = String(medicine?.code || "").trim().toUpperCase();
        const name = String(medicine?.name || "").trim().toUpperCase();

        if (!normalizedQuery) {
          return Boolean(code);
        }

        return code.includes(normalizedQuery) || name.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftCode = String(left?.code || "").trim().toUpperCase();
        const rightCode = String(right?.code || "").trim().toUpperCase();

        const leftStartsWith = normalizedQuery && leftCode.startsWith(normalizedQuery);
        const rightStartsWith = normalizedQuery && rightCode.startsWith(normalizedQuery);

        if (leftStartsWith !== rightStartsWith) {
          return leftStartsWith ? -1 : 1;
        }

        return leftCode.localeCompare(rightCode);
      });

    return suggestionSource.slice(0, 6);
  }, [medicines, form.code]);
  const orderTrendItems = useMemo(
    () =>
      salesChartItems.map((item) => ({
        date: item.date,
        count: toNumber(item.orders, 0),
      })),
    [salesChartItems]
  );
  const paymentStatusMix = useMemo(() => {
    const totals = {};

    orders.forEach((order) => {
      const statusKey = String(order?.paymentStatus || "pending").trim().toLowerCase();
      totals[statusKey] = (totals[statusKey] || 0) + 1;
    });

    return Object.entries(totals)
      .map(([label, count]) => ({
        label: toTitleLabel(label),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);
  const orderStatusMix = useMemo(() => {
    const totals = {};

    orders.forEach((order) => {
      const statusKey = String(order?.status || "unknown").trim().toLowerCase();
      totals[statusKey] = (totals[statusKey] || 0) + 1;
    });

    return Object.entries(totals)
      .map(([label, count]) => ({
        label: toTitleLabel(label),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);
  const categoryDemand = useMemo(() => {
    const totals = {};

    orders.forEach((order) => {
      (order?.items || []).forEach((item) => {
        const category = String(item?.category || "General").trim();
        totals[category] = (totals[category] || 0) + toNumber(item?.quantity, 0);
      });
    });

    return Object.entries(totals)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [orders]);
  const userNameById = useMemo(() => {
    const nameMap = {};
    users.forEach((user) => {
      const userId = String(user?.id || user?._id || "").trim();
      if (!userId) return;
      nameMap[userId] = String(user?.name || user?.email || "Unknown User");
    });
    return nameMap;
  }, [users]);

  const medicineNameById = useMemo(() => {
    const nameMap = {};
    medicines.forEach((medicine) => {
      const medicineId = String(getId(medicine) || "").trim();
      if (!medicineId) return;
      nameMap[medicineId] = String(medicine?.name || "Medicine");
    });
    return nameMap;
  }, [medicines]);

  const getUserDisplayName = useCallback(
    (userId) => userNameById[String(userId || "").trim()] || "Unknown User",
    [userNameById]
  );

  const getMedicineDisplayName = useCallback(
    (medicineId, fallbackName = "") =>
      medicineNameById[String(medicineId || "").trim()] ||
      String(fallbackName || "").trim() ||
      "Medicine",
    [medicineNameById]
  );

  const summarizeOrderItemsForDashboard = useCallback(
    (items = []) => {
      if (!items.length) return "N/A";
      const firstItem = items[0] || {};
      const firstName = getMedicineDisplayName(firstItem.medicineId, firstItem.medicineName);
      if (items.length === 1) return firstName;
      return `${firstName} +${items.length - 1} more`;
    },
    [getMedicineDisplayName]
  );

  const applyInventoryResults = useCallback(
    ({ medicinesResult, categoriesResult, lowStockResult, expiryResult }) => {
      const nextMedicines =
        medicinesResult.status === "fulfilled" && Array.isArray(medicinesResult.value)
          ? medicinesResult.value
          : [];
      const nextLowStock =
        lowStockResult.status === "fulfilled" && Array.isArray(lowStockResult.value)
          ? lowStockResult.value
          : [];
      const nextExpiry =
        expiryResult.status === "fulfilled" && Array.isArray(expiryResult.value)
          ? expiryResult.value
          : [];
      const backendCategories =
        categoriesResult.status === "fulfilled" && Array.isArray(categoriesResult.value)
          ? categoriesResult.value
          : [];

      const mergedCategories = Array.from(
        new Set([
          ...backendCategories,
          ...nextMedicines.map((medicine) => medicine.category).filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b));

      setMedicines(nextMedicines);
      setLowStockItems(nextLowStock);
      setExpiryItems(nextExpiry);
      setCategories(mergedCategories);
    },
    []
  );

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
      fetchAdminSummary(),
      fetchDailySales(),
      fetchTopMedicines(),
      fetchUserActivity(),
      fetchUsers(),
      fetchOrders(),
      getMedicines({ includeInactive: true }),
      getInventoryCategories(),
      getLowStockAlerts(),
      getExpiryAlerts({ days: 45 }),
    ]);

    const [
      summaryResult,
      dailySalesResult,
      topResult,
      activityResult,
      usersResult,
      ordersResult,
    ] = results;

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value || { totals: {} });
    }
    if (dailySalesResult.status === "fulfilled") {
      setDailySales(Array.isArray(dailySalesResult.value) ? dailySalesResult.value : []);
    }
    if (topResult.status === "fulfilled") {
      setTopMedicines(Array.isArray(topResult.value) ? topResult.value : []);
    }
    if (activityResult.status === "fulfilled") {
      setUserActivity(Array.isArray(activityResult.value) ? activityResult.value : []);
    }
    if (usersResult.status === "fulfilled") {
      setUsers(Array.isArray(usersResult.value) ? usersResult.value : []);
    }
    if (ordersResult.status === "fulfilled") {
      setOrders(Array.isArray(ordersResult.value) ? ordersResult.value : []);
    }

    applyInventoryResults({
      medicinesResult: results[6],
      categoriesResult: results[7],
      lowStockResult: results[8],
      expiryResult: results[9],
    });

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      setError(
        failed
          .map((result) => getErrorMessage(result.reason, "Unable to load some dashboard data"))
          .slice(0, 2)
          .join(" | ")
      );
    }

    setLoading(false);
  }, [applyInventoryResults]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const refreshInventoryData = useCallback(async () => {
    const results = await Promise.allSettled([
      getMedicines({ includeInactive: true }),
      getInventoryCategories(),
      getLowStockAlerts(),
      getExpiryAlerts({ days: 45 }),
    ]);

    applyInventoryResults({
      medicinesResult: results[0],
      categoriesResult: results[1],
      lowStockResult: results[2],
      expiryResult: results[3],
    });
  }, [applyInventoryResults]);

  const buildAutofilledMedicineForm = useCallback((current, medicine, nextCodeValue) => {
    const nextCode = String(nextCodeValue ?? medicine?.code ?? current.code ?? "")
      .trim()
      .toUpperCase();

    return {
      ...current,
      code: nextCode,
      name: String(medicine?.name || ""),
      category: String(medicine?.category || ""),
      manufacturer: String(medicine?.manufacturer || ""),
      prescriptionRequired: medicine?.prescriptionRequired ? "yes" : "no",
      price: String(toNumber(medicine?.price, 0)),
      lowStockThreshold: String(Math.max(0, Math.floor(toNumber(medicine?.lowStockThreshold, 10)))),
      description: String(medicine?.description || ""),
      uses: String(medicine?.uses || ""),
      dosage: String(medicine?.dosage || ""),
      sideEffects: String(medicine?.sideEffects || ""),
      warnings: String(medicine?.warnings || ""),
      storageInstructions: String(medicine?.storageInstructions || ""),
      imageData: String(medicine?.imageData || ""),
    };
  }, []);

  const buildEditableMedicineForm = useCallback((medicine) => {
    const batchLabels = getBatchLabelList(medicine);

    return {
      code: String(medicine?.code || "").trim().toUpperCase(),
      name: String(medicine?.name || ""),
      category: String(medicine?.category || ""),
      manufacturer: String(medicine?.manufacturer || ""),
      prescriptionRequired: medicine?.prescriptionRequired ? "yes" : "no",
      price: String(toNumber(medicine?.price, 0)),
      stock: String(getCurrentStockValue(medicine)),
      lowStockThreshold: String(Math.max(0, Math.floor(toNumber(medicine?.lowStockThreshold, 10)))),
      expiryDate: formatDateInput(medicine?.expiryDate),
      batchNo: batchLabels.length ? batchLabels.join(", ") : "",
      description: String(medicine?.description || ""),
      uses: String(medicine?.uses || ""),
      dosage: String(medicine?.dosage || ""),
      sideEffects: String(medicine?.sideEffects || ""),
      warnings: String(medicine?.warnings || ""),
      storageInstructions: String(medicine?.storageInstructions || ""),
      imageData: String(medicine?.imageData || ""),
    };
  }, []);

  const handleFormChange = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCodeChange = (event) => {
    const nextCode = String(event.target.value || "").toUpperCase();
    const matchedMedicine = medicineByCode.get(nextCode.trim());

    setForm((current) =>
      matchedMedicine
        ? buildAutofilledMedicineForm(current, matchedMedicine, nextCode)
        : {
            ...current,
            code: nextCode,
          }
    );
    setShowCodeSuggestions(true);
  };

  const handleCodeSuggestionSelect = (medicine) => {
    setForm((current) => buildAutofilledMedicineForm(current, medicine, medicine?.code));
    setShowCodeSuggestions(false);
  };

  const handleEditFormChange = (field) => (event) => {
    const value = event.target.value;
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const onImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please use an image under 5MB");
      return;
    }

    const reader = new FileReader();
    setImageUploading(true);

    reader.onload = () => {
      setForm((current) => ({
        ...current,
        imageData: String(reader.result || ""),
      }));
      setImageUploading(false);
    };

    reader.onerror = () => {
      setImageUploading(false);
      toast.error("Unable to read image file");
    };

    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setForm((current) => ({
      ...current,
      imageData: "",
    }));
  };

  const onEditImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please use an image under 5MB");
      return;
    }

    const reader = new FileReader();
    setEditImageUploading(true);

    reader.onload = () => {
      setEditForm((current) => ({
        ...current,
        imageData: String(reader.result || ""),
      }));
      setEditImageUploading(false);
    };

    reader.onerror = () => {
      setEditImageUploading(false);
      toast.error("Unable to read image file");
    };

    reader.readAsDataURL(file);
  };

  const clearEditImage = () => {
    setEditForm((current) => ({
      ...current,
      imageData: "",
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setShowCodeSuggestions(false);
  };

  const onEditMedicine = (medicine) => {
    const medicineId = getId(medicine);
    if (!medicineId) {
      return;
    }

    setEditingMedicineId(medicineId);
    setEditForm(buildEditableMedicineForm(medicine));
  };

  const cancelEditMedicine = () => {
    setEditingMedicineId("");
    setEditForm(EMPTY_FORM);
  };

  const onSubmitMedicine = async (event) => {
    event.preventDefault();

    const normalizedStock = Math.max(0, Math.floor(toNumber(form.stock, 0)));

    const payload = {
      code: String(form.code || "").trim().toUpperCase(),
      name: String(form.name || "").trim(),
      category: String(form.category || "").trim(),
      manufacturer: String(form.manufacturer || "Unknown").trim(),
      prescriptionRequired: String(form.prescriptionRequired || "no") === "yes",
      price: toNumber(form.price, -1),
      stock: normalizedStock,
      lowStockThreshold: Math.max(0, Math.floor(toNumber(form.lowStockThreshold, 10))),
      expiryDate: form.expiryDate,
      batchNo: String(form.batchNo || "").trim(),
      description: String(form.description || "").trim(),
      uses: String(form.uses || "").trim(),
      dosage: String(form.dosage || "").trim(),
      sideEffects: String(form.sideEffects || "").trim(),
      warnings: String(form.warnings || "").trim(),
      storageInstructions: String(form.storageInstructions || "").trim(),
      imageData: form.imageData || "",
    };

    if (!payload.code || !payload.name || !payload.category) {
      toast.error("Code, name, and category are required");
      return;
    }
    if (payload.price < 0) {
      toast.error("Price must be zero or greater");
      return;
    }
    if (!payload.expiryDate) {
      toast.error("Expiry date is required");
      return;
    }

    setSubmitting(true);
    try {
      await createMedicine(payload);
      toast.success("Medicine added");
      resetForm();
      await refreshInventoryData();
      setActivePage("inventory");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to add medicine"));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitEditMedicine = async (event) => {
    event.preventDefault();

    if (!editingMedicineId) {
      return;
    }

    const payload = {
      code: String(editForm.code || "").trim().toUpperCase(),
      name: String(editForm.name || "").trim(),
      category: String(editForm.category || "").trim(),
      manufacturer: String(editForm.manufacturer || "Unknown").trim(),
      prescriptionRequired: String(editForm.prescriptionRequired || "no") === "yes",
      price: toNumber(editForm.price, -1),
      lowStockThreshold: Math.max(0, Math.floor(toNumber(editForm.lowStockThreshold, 10))),
      description: String(editForm.description || "").trim(),
      uses: String(editForm.uses || "").trim(),
      dosage: String(editForm.dosage || "").trim(),
      sideEffects: String(editForm.sideEffects || "").trim(),
      warnings: String(editForm.warnings || "").trim(),
      storageInstructions: String(editForm.storageInstructions || "").trim(),
      imageData: editForm.imageData || "",
    };

    if (!payload.code || !payload.name || !payload.category) {
      toast.error("Code, name, and category are required");
      return;
    }
    if (payload.price < 0) {
      toast.error("Price must be zero or greater");
      return;
    }

    setEditSubmitting(true);
    try {
      await updateMedicine(editingMedicineId, payload);
      toast.success("Medicine updated");
      cancelEditMedicine();
      await refreshInventoryData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update medicine"));
    } finally {
      setEditSubmitting(false);
    }
  };

  async function onDeleteMedicine(medicine) {
    const medicineId = getId(medicine);
    if (!medicineId) return;

    const approved = window.confirm(`Delete medicine "${medicine.name}"?`);
    if (!approved) return;

    setBusyById((current) => ({ ...current, [medicineId]: true }));
    try {
      await deleteMedicine(medicineId);
      toast.success("Medicine deleted");
      await refreshInventoryData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to delete medicine"));
    } finally {
      setBusyById((current) => ({ ...current, [medicineId]: false }));
    }
  }

  const onGoProfile = () => {
    navigate("/profile");
  };

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const renderOverview = () => {
    const maxRevenue = Math.max(...salesChartItems.map((item) => toNumber(item.revenue, 0)), 1);
    const maxTopQty = Math.max(...topMedicines.map((item) => toNumber(item.totalQuantity, 0)), 1);
    const maxOrders = Math.max(...orderTrendItems.map((item) => toNumber(item.count, 0)), 1);
    const maxPaymentCount = Math.max(...paymentStatusMix.map((item) => toNumber(item.count, 0)), 1);
    const maxOrderStatusCount = Math.max(
      ...orderStatusMix.map((item) => toNumber(item.count, 0)),
      1
    );
    const maxCategoryCount = Math.max(...categoryDemand.map((item) => toNumber(item.count, 0)), 1);

    return (
      <section className="admin-page-section">
        <div className="admin-summary-grid">
          {overviewCards.map((card) => (
            <article key={card.label} className="panel admin-summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>

        <div className="admin-overview-grid">
          <section className="panel admin-chart-panel">
            <h2>Daily Sales</h2>
            {salesChartItems.length ? (
              <div className="admin-bar-chart">
                {salesChartItems.map((item) => {
                  const revenue = toNumber(item.revenue, 0);
                  const height = Math.max(12, (revenue / maxRevenue) * 100);
                  return (
                    <div key={item.date} className="admin-bar-group">
                      <span className="admin-bar-value">{formatMoney(revenue)}</span>
                      <div className="admin-bar-column">
                        <div className="admin-bar-fill" style={{ height: `${height}%` }} />
                      </div>
                      <span className="admin-bar-label">{formatDate(item.date)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No sales data available yet.</p>
            )}
          </section>

          <section className="panel admin-chart-panel">
            <h2>Top Ordered Medicines</h2>
            {topMedicines.length ? (
              <div className="admin-hbar-list">
                {topMedicines.map((item) => (
                  <div key={item.medicineId || item.medicineName} className="admin-hbar-row">
                    <div className="admin-hbar-info">
                      <strong>{getMedicineDisplayName(item.medicineId, item.medicineName)}</strong>
                      <span>{formatMoney(item.totalRevenue)}</span>
                    </div>
                    <div className="admin-hbar-track">
                      <div
                        className="admin-hbar-fill"
                        style={{
                          width: `${Math.max(
                            6,
                            (toNumber(item.totalQuantity, 0) / maxTopQty) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="admin-hbar-count">{toNumber(item.totalQuantity, 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No top-medicine trends yet.</p>
            )}
          </section>
        </div>

        <div className="admin-overview-grid admin-performance-grid">
          <section className="panel admin-chart-panel">
            <h2>Daily Orders Trend</h2>
            {orderTrendItems.length ? (
              <div className="admin-bar-chart admin-bar-chart-compact">
                {orderTrendItems.map((item) => {
                  const count = toNumber(item.count, 0);
                  const height = Math.max(12, (count / maxOrders) * 100);
                  return (
                    <div key={`orders-${item.date}`} className="admin-bar-group">
                      <span className="admin-bar-value">{count}</span>
                      <div className="admin-bar-column">
                        <div
                          className="admin-bar-fill admin-bar-fill-orders"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="admin-bar-label">{formatDate(item.date)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No order trend available yet.</p>
            )}
          </section>

          <section className="panel admin-chart-panel">
            <h2>Payment Status Mix</h2>
            {paymentStatusMix.length ? (
              <div className="admin-hbar-list">
                {paymentStatusMix.map((item) => (
                  <div key={`payment-${item.label}`} className="admin-hbar-row">
                    <div className="admin-hbar-info">
                      <strong>{item.label}</strong>
                    </div>
                    <div className="admin-hbar-track">
                      <div
                        className="admin-hbar-fill admin-hbar-fill-payment"
                        style={{
                          width: `${Math.max(
                            6,
                            (toNumber(item.count, 0) / maxPaymentCount) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="admin-hbar-count">{toNumber(item.count, 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No payment status data yet.</p>
            )}
          </section>

          <section className="panel admin-chart-panel">
            <h2>Order Status Mix</h2>
            {orderStatusMix.length ? (
              <div className="admin-hbar-list">
                {orderStatusMix.map((item) => (
                  <div key={`order-status-${item.label}`} className="admin-hbar-row">
                    <div className="admin-hbar-info">
                      <strong>{item.label}</strong>
                    </div>
                    <div className="admin-hbar-track">
                      <div
                        className="admin-hbar-fill admin-hbar-fill-status"
                        style={{
                          width: `${Math.max(
                            6,
                            (toNumber(item.count, 0) / maxOrderStatusCount) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="admin-hbar-count">{toNumber(item.count, 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No order status data yet.</p>
            )}
          </section>

          <section className="panel admin-chart-panel">
            <h2>Category Demand</h2>
            {categoryDemand.length ? (
              <div className="admin-hbar-list">
                {categoryDemand.map((item) => (
                  <div key={`category-${item.label}`} className="admin-hbar-row">
                    <div className="admin-hbar-info">
                      <strong>{item.label}</strong>
                    </div>
                    <div className="admin-hbar-track">
                      <div
                        className="admin-hbar-fill admin-hbar-fill-category"
                        style={{
                          width: `${Math.max(
                            6,
                            (toNumber(item.count, 0) / maxCategoryCount) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="admin-hbar-count">{toNumber(item.count, 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No category demand data yet.</p>
            )}
          </section>
        </div>
      </section>
    );
  };

  const renderUserActivityAndOrders = () => (
    <section className="admin-page-section">
      <section className="panel admin-table-panel">
        <h2>User Activity</h2>
        <div className="admin-table-wrap">
          <table className="admin-table admin-overview-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Total Orders</th>
                <th>Total Spend</th>
                <th>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {!userActivity.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No user activity yet.
                  </td>
                </tr>
              ) : (
                userActivity.map((item) => (
                  <tr key={item.userId}>
                    <td>{getUserDisplayName(item.userId)}</td>
                    <td>{toNumber(item.totalOrders, 0)}</td>
                    <td>{formatMoney(item.totalSpend)}</td>
                    <td>{formatDateTime(item.lastOrderAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel admin-table-panel">
        <h2>User Order History</h2>
        <div className="admin-table-wrap">
          <table className="admin-table admin-overview-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>User</th>
                <th>Medicines</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Placed At</th>
              </tr>
            </thead>
            <tbody>
              {!recentOrders.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No orders available.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNumber || order.id}</td>
                    <td>{getUserDisplayName(order.userId)}</td>
                    <td>{summarizeOrderItemsForDashboard(order.items || [])}</td>
                    <td>{formatMoney(order.totalAmount)}</td>
                    <td>
                      <span
                        className={`status-pill status-${String(order.status || "").replace(
                          /\s+/g,
                          "_"
                        )}`}
                      >
                        {order.status || "N/A"}
                      </span>
                    </td>
                    <td>{order.paymentStatus || "pending"}</td>
                    <td>{formatDateTime(order.placedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );

  const renderAddMedicine = () => (
    <section className="panel admin-form-panel">
      <h2>Add Medicine</h2>
      <form onSubmit={onSubmitMedicine} className="admin-form-grid">
        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-code">
            Code
          </label>
          <div className="admin-code-autocomplete">
            <input
              id="medicine-code"
              className="input"
              placeholder="Code"
              value={form.code}
              onChange={handleCodeChange}
              onFocus={() => setShowCodeSuggestions(true)}
              onBlur={() => {
                window.setTimeout(() => setShowCodeSuggestions(false), 120);
              }}
              autoComplete="off"
              required
            />
            {showCodeSuggestions && codeSuggestions.length ? (
              <div className="admin-code-suggestion-menu">
                {codeSuggestions.map((medicine) => (
                  <button
                    key={`${medicine.code}-${getId(medicine)}`}
                    type="button"
                    className="admin-code-suggestion"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleCodeSuggestionSelect(medicine);
                    }}
                  >
                    <strong>{medicine.code}</strong>
                    <span>{medicine.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-name">
            Name
          </label>
          <input
            id="medicine-name"
            className="input"
            placeholder="Name"
            value={form.name}
            onChange={handleFormChange("name")}
            readOnly={isCodeAutofillMode}
            required
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-category">
            Category
          </label>
          <input
            id="medicine-category"
            className="input"
            list="medicine-category-options"
            placeholder="Category"
            value={form.category}
            onChange={handleFormChange("category")}
            readOnly={isCodeAutofillMode}
            required
          />
          <datalist id="medicine-category-options">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-manufacturer">
            Manufacturer
          </label>
          <input
            id="medicine-manufacturer"
            className="input"
            placeholder="Manufacturer"
            value={form.manufacturer}
            onChange={handleFormChange("manufacturer")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-prescription-required">
            Prescription Required (Yes/No)
          </label>
          <CustomSelect
            id="medicine-prescription-required"
            value={form.prescriptionRequired}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
            disabled={isCodeAutofillMode}
            onChange={(nextValue) =>
              setForm((current) => ({
                ...current,
                prescriptionRequired: String(nextValue || "no"),
              }))
            }
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-price">
            Price
          </label>
          <input
            id="medicine-price"
            type="number"
            className="input"
            placeholder="Price"
            min="0"
            step="0.01"
            value={form.price}
            onChange={handleFormChange("price")}
            readOnly={isCodeAutofillMode}
            required
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-stock">
            Available Stock
          </label>
          <input
            id="medicine-stock"
            type="number"
            className="input"
            placeholder="Available Stock"
            min="0"
            step="1"
            value={form.stock}
            onChange={handleFormChange("stock")}
            required
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-low-stock">
            Low Stock Threshold
          </label>
          <input
            id="medicine-low-stock"
            type="number"
            className="input"
            placeholder="Low Stock Threshold"
            min="0"
            step="1"
            value={form.lowStockThreshold}
            onChange={handleFormChange("lowStockThreshold")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-expiry-date">
            Expiry Date
          </label>
          <input
            id="medicine-expiry-date"
            type="date"
            className="input"
            value={form.expiryDate}
            onChange={handleFormChange("expiryDate")}
            required
          />
        </div>

        <div className="admin-field">
          <label className="admin-field-label" htmlFor="medicine-batch-number">
            Batch Number
          </label>
          <input
            id="medicine-batch-number"
            className="input"
            placeholder="Batch Number"
            value={form.batchNo}
            onChange={handleFormChange("batchNo")}
          />
        </div>

        <div className="admin-field admin-image-upload">
          <label className="admin-field-label" htmlFor="medicine-image">
            Medicine Image
          </label>
          <input
            id="medicine-image"
            type="file"
            className="input"
            accept="image/*"
            disabled={isCodeAutofillMode}
            onChange={onImageSelect}
          />
          {imageUploading ? <span className="muted">Reading image...</span> : null}
          {form.imageData ? (
            <div className="admin-image-preview-wrap">
              <img src={form.imageData} alt="Medicine preview" className="admin-image-preview" />
              {!isCodeAutofillMode ? (
                <button type="button" className="btn-secondary" onClick={clearImage}>
                  Remove Image
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="admin-field admin-textarea">
          <label className="admin-field-label" htmlFor="medicine-description">
            Description
          </label>
          <textarea
            id="medicine-description"
            className="input admin-textarea"
            placeholder="Description"
            rows={4}
            value={form.description}
            onChange={handleFormChange("description")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-medical-heading">Medical Information</div>

        <div className="admin-field admin-textarea">
          <label className="admin-field-label" htmlFor="medicine-uses">
            Uses
          </label>
          <textarea
            id="medicine-uses"
            className="input admin-textarea"
            placeholder="Uses"
            rows={3}
            value={form.uses}
            onChange={handleFormChange("uses")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-field admin-textarea">
          <label className="admin-field-label" htmlFor="medicine-dosage">
            Dosage
          </label>
          <textarea
            id="medicine-dosage"
            className="input admin-textarea"
            placeholder="Dosage"
            rows={3}
            value={form.dosage}
            onChange={handleFormChange("dosage")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-field admin-textarea">
          <label className="admin-field-label" htmlFor="medicine-side-effects">
            Side Effects
          </label>
          <textarea
            id="medicine-side-effects"
            className="input admin-textarea"
            placeholder="Side Effects"
            rows={3}
            value={form.sideEffects}
            onChange={handleFormChange("sideEffects")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-field admin-textarea">
          <label className="admin-field-label" htmlFor="medicine-warnings">
            Warnings
          </label>
          <textarea
            id="medicine-warnings"
            className="input admin-textarea"
            placeholder="Warnings"
            rows={3}
            value={form.warnings}
            onChange={handleFormChange("warnings")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-field admin-textarea">
          <label className="admin-field-label" htmlFor="medicine-storage-instructions">
            Storage Instructions
          </label>
          <textarea
            id="medicine-storage-instructions"
            className="input admin-textarea"
            placeholder="Storage Instructions"
            rows={3}
            value={form.storageInstructions}
            onChange={handleFormChange("storageInstructions")}
            readOnly={isCodeAutofillMode}
          />
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="btn-primary" disabled={submitting || imageUploading}>
            {submitting ? "Adding..." : "Add Medicine"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={resetForm}
            disabled={submitting || imageUploading}
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  );

  const renderInventory = () => (
    <section className="admin-page-section">
      <div className="admin-layout">
        <section className="panel admin-alert-panel">
          <h2>Low Stock Alerts</h2>
          <div className="admin-alert-block">
            <strong>Total Items: {lowStockItems.length}</strong>
            <p className="muted">Medicines that are near or below threshold.</p>
            {!lowStockItems.length ? (
              <p className="success-text">No low stock medicines right now.</p>
            ) : (
              lowStockItems.slice(0, 8).map((item) => (
                <p key={getId(item)}>
                  <strong>{item.name}</strong> - Available {toNumber(item.availableStock, 0)} /{" "}
                  Threshold {toNumber(item.lowStockThreshold, 0)}
                </p>
              ))
            )}
          </div>
        </section>

        <section className="panel admin-alert-panel">
          <h2>Expiry Alerts</h2>
          <div className="admin-alert-block">
            <strong>Total Items: {expiryItems.length}</strong>
            <p className="muted">Medicines expiring within 45 days.</p>
            {!expiryItems.length ? (
              <p className="success-text">No near-expiry medicines right now.</p>
            ) : (
              expiryItems.slice(0, 8).map((item) => (
                <p key={`${getId(item)}-${item.batchNo || "batch"}-${item.expiryDate || "expiry"}`}>
                  <strong>{item.name}</strong> - Batch {item.batchNo || "N/A"} expires on{" "}
                  {formatDate(item.expiryDate)}
                </p>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="panel admin-table-panel">
        <h2>Medicine Catalogue</h2>
        <div className="toolbar">
          <input
            className="input"
            placeholder="Search medicines by name/code/category/manufacturer"
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            style={{ minWidth: "240px", flex: "1 1 240px" }}
          />
          <CustomSelect
            value={catalogCategory}
            options={[
              { value: "", label: "All Categories" },
              ...categories.map((category) => ({ value: category, label: category })),
            ]}
            onChange={setCatalogCategory}
            style={{ minWidth: "200px", maxWidth: "260px" }}
          />
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Manufacturer</th>
                <th>Price</th>
                <th>Available Stock</th>
                <th>Low Stock</th>
                <th>Expiry Date</th>
                <th>Batch Number</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filteredMedicines.length ? (
                <tr>
                  <td colSpan={11} className="muted">
                    No medicines found.
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((medicine) => {
                  const medicineId = getId(medicine);
                  const busy = Boolean(busyById[medicineId]);
                  return (
                    <tr key={medicineId}>
                      <td>
                        {medicine.imageData ? (
                          <img
                            src={medicine.imageData}
                            alt={medicine.name}
                            className="admin-catalogue-thumb"
                          />
                        ) : (
                          <span className="muted">No image</span>
                        )}
                      </td>
                      <td>{medicine.code || "N/A"}</td>
                      <td>{medicine.name}</td>
                      <td>{medicine.category}</td>
                      <td>{medicine.manufacturer || "Unknown"}</td>
                      <td>{formatMoney(medicine.price)}</td>
                      <td>{getCurrentStockValue(medicine)}</td>
                      <td>{toNumber(medicine.lowStockThreshold, 0)}</td>
                      <td>{formatDate(medicine.expiryDate)}</td>
                      <td>{formatBatchSummary(medicine)}</td>
                      <td className="admin-actions-cell">
                        <div className="admin-actions-inline">
                          <button
                            type="button"
                            className="btn-secondary admin-action-btn"
                            onClick={() => onEditMedicine(medicine)}
                            disabled={busy}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-danger admin-action-btn admin-delete-btn"
                            onClick={() => onDeleteMedicine(medicine)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );

  const renderEditMedicineModal = () => {
    if (!editingMedicineId) {
      return null;
    }

    return (
      <div className="admin-edit-modal-backdrop" onClick={cancelEditMedicine}>
        <section className="panel admin-edit-modal" onClick={(event) => event.stopPropagation()}>
          <div className="admin-edit-modal-header">
            <h2>Edit Medicine</h2>
            <p className="muted">
              Update medicine details. Stock, expiry date, and batch number are locked in this popup.
            </p>
          </div>

          <form onSubmit={onSubmitEditMedicine} className="admin-form-grid admin-edit-form-grid">
            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-code">
                Code
              </label>
              <input
                id="edit-medicine-code"
                className="input"
                value={editForm.code}
                onChange={handleEditFormChange("code")}
                required
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-name">
                Name
              </label>
              <input
                id="edit-medicine-name"
                className="input"
                value={editForm.name}
                onChange={handleEditFormChange("name")}
                required
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-category">
                Category
              </label>
              <input
                id="edit-medicine-category"
                className="input"
                list="edit-medicine-category-options"
                value={editForm.category}
                onChange={handleEditFormChange("category")}
                required
              />
              <datalist id="edit-medicine-category-options">
                {categories.map((category) => (
                  <option key={`edit-${category}`} value={category} />
                ))}
              </datalist>
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-manufacturer">
                Manufacturer
              </label>
              <input
                id="edit-medicine-manufacturer"
                className="input"
                value={editForm.manufacturer}
                onChange={handleEditFormChange("manufacturer")}
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-prescription-required">
                Prescription Required (Yes/No)
              </label>
              <CustomSelect
                id="edit-medicine-prescription-required"
                value={editForm.prescriptionRequired}
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
                onChange={(nextValue) =>
                  setEditForm((current) => ({
                    ...current,
                    prescriptionRequired: String(nextValue || "no"),
                  }))
                }
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-price">
                Price
              </label>
              <input
                id="edit-medicine-price"
                type="number"
                className="input"
                min="0"
                step="0.01"
                value={editForm.price}
                onChange={handleEditFormChange("price")}
                required
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-stock">
                Available Stock
              </label>
              <input
                id="edit-medicine-stock"
                className="input"
                value={editForm.stock}
                disabled
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-low-stock">
                Low Stock Threshold
              </label>
              <input
                id="edit-medicine-low-stock"
                type="number"
                className="input"
                min="0"
                step="1"
                value={editForm.lowStockThreshold}
                onChange={handleEditFormChange("lowStockThreshold")}
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-expiry-date">
                Expiry Date
              </label>
              <input id="edit-medicine-expiry-date" type="date" className="input" value={editForm.expiryDate} disabled />
            </div>

            <div className="admin-field">
              <label className="admin-field-label" htmlFor="edit-medicine-batch-number">
                Batch Number
              </label>
              <input
                id="edit-medicine-batch-number"
                className="input"
                value={editForm.batchNo}
                disabled
              />
            </div>

            <div className="admin-field admin-image-upload">
              <label className="admin-field-label" htmlFor="edit-medicine-image">
                Medicine Image
              </label>
              <input
                id="edit-medicine-image"
                type="file"
                className="input"
                accept="image/*"
                onChange={onEditImageSelect}
              />
              {editImageUploading ? <span className="muted">Reading image...</span> : null}
              {editForm.imageData ? (
                <div className="admin-image-preview-wrap">
                  <img src={editForm.imageData} alt="Medicine preview" className="admin-image-preview" />
                  <button type="button" className="btn-secondary" onClick={clearEditImage}>
                    Remove Image
                  </button>
                </div>
              ) : null}
            </div>

            <div className="admin-field admin-textarea">
              <label className="admin-field-label" htmlFor="edit-medicine-description">
                Description
              </label>
              <textarea
                id="edit-medicine-description"
                className="input admin-textarea"
                rows={4}
                value={editForm.description}
                onChange={handleEditFormChange("description")}
              />
            </div>

            <div className="admin-medical-heading">Medical Information</div>

            <div className="admin-field admin-textarea">
              <label className="admin-field-label" htmlFor="edit-medicine-uses">
                Uses
              </label>
              <textarea
                id="edit-medicine-uses"
                className="input admin-textarea"
                rows={3}
                value={editForm.uses}
                onChange={handleEditFormChange("uses")}
              />
            </div>

            <div className="admin-field admin-textarea">
              <label className="admin-field-label" htmlFor="edit-medicine-dosage">
                Dosage
              </label>
              <textarea
                id="edit-medicine-dosage"
                className="input admin-textarea"
                rows={3}
                value={editForm.dosage}
                onChange={handleEditFormChange("dosage")}
              />
            </div>

            <div className="admin-field admin-textarea">
              <label className="admin-field-label" htmlFor="edit-medicine-side-effects">
                Side Effects
              </label>
              <textarea
                id="edit-medicine-side-effects"
                className="input admin-textarea"
                rows={3}
                value={editForm.sideEffects}
                onChange={handleEditFormChange("sideEffects")}
              />
            </div>

            <div className="admin-field admin-textarea">
              <label className="admin-field-label" htmlFor="edit-medicine-warnings">
                Warnings
              </label>
              <textarea
                id="edit-medicine-warnings"
                className="input admin-textarea"
                rows={3}
                value={editForm.warnings}
                onChange={handleEditFormChange("warnings")}
              />
            </div>

            <div className="admin-field admin-textarea">
              <label className="admin-field-label" htmlFor="edit-medicine-storage-instructions">
                Storage Instructions
              </label>
              <textarea
                id="edit-medicine-storage-instructions"
                className="input admin-textarea"
                rows={3}
                value={editForm.storageInstructions}
                onChange={handleEditFormChange("storageInstructions")}
              />
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="btn-primary" disabled={editSubmitting || editImageUploading}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={cancelEditMedicine}
                disabled={editSubmitting || editImageUploading}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  };

  return (
    <main className="page-wrap admin-page">
      <section className="admin-dashboard-shell">
        <aside className="panel admin-side-nav">
          <div className="admin-side-brand">
            <span className="brand-medi">Medi</span>
            <span className="brand-sync">Sync</span>
          </div>

          <nav className="admin-side-menu">
            {PAGE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`admin-side-menu-btn${activePage === tab.id ? " is-active" : ""}`}
                  onClick={() => setActivePage(tab.id)}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

            <div className="admin-side-footer">
              <button type="button" className="admin-side-menu-btn" onClick={onGoProfile}>
                <User size={18} />
                <span className="sidebar-link-label" title={profileLabel}>{profileLabel}</span>
              </button>
              <button type="button" className="admin-side-menu-btn admin-side-logout" onClick={onLogout}>
                <LogOut size={18} />
                <span className="sidebar-link-label">Logout</span>
              </button>
          </div>
        </aside>

        <section className="admin-side-content">
          <h1 className="page-title">Pharmacist Dashboard</h1>
          <p className="page-subtitle">
            Monitor business metrics, add medicines, and manage inventory alerts.
          </p>

          {loading ? <p className="muted">Loading dashboard...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          {!loading && activePage === "overview" ? renderOverview() : null}
          {!loading && activePage === "user-activity-orders" ? renderUserActivityAndOrders() : null}
          {!loading && activePage === "add-medicine" ? renderAddMedicine() : null}
          {!loading && activePage === "inventory" ? renderInventory() : null}
        </section>
      </section>
      {renderEditMedicineModal()}
    </main>
  );
};

export default AdminDashboard;
