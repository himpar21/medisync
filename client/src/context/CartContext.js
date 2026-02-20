import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  addCartItem,
  clearCartItems,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from "../services/orderService";
import { AuthContext } from "./AuthContext";

const emptyCart = {
  items: [],
  totalItems: 0,
  subtotal: 0,
  currency: "INR",
};

export const CartContext = createContext({
  cart: emptyCart,
  loading: false,
  refreshCart: async () => {},
  addItem: async () => {},
  updateItem: async () => {},
  removeItem: async () => {},
  clearCart: async () => {},
});

export const CartProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [cart, setCart] = useState(emptyCart);
  const [loading, setLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    if (!user?.token) {
      setCart(emptyCart);
      return emptyCart;
    }

    setLoading(true);
    try {
      const nextCart = await fetchCart();
      setCart(nextCart || emptyCart);
      return nextCart || emptyCart;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addItem = useCallback(
    async (medicineId, quantity = 1) => {
      if (!user?.token) {
        throw new Error("Please login to manage cart");
      }

      setLoading(true);
      try {
        const nextCart = await addCartItem({ medicineId, quantity });
        setCart(nextCart || emptyCart);
        return nextCart || emptyCart;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const updateItem = useCallback(
    async (medicineId, quantity) => {
      if (!user?.token) {
        throw new Error("Please login to manage cart");
      }

      setLoading(true);
      try {
        const nextCart = await updateCartItem(medicineId, { quantity });
        setCart(nextCart || emptyCart);
        return nextCart || emptyCart;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const removeItem = useCallback(
    async (medicineId) => {
      if (!user?.token) {
        throw new Error("Please login to manage cart");
      }

      setLoading(true);
      try {
        const nextCart = await removeCartItem(medicineId);
        setCart(nextCart || emptyCart);
        return nextCart || emptyCart;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const clearCart = useCallback(async () => {
    if (!user?.token) {
      throw new Error("Please login to manage cart");
    }

    setLoading(true);
    try {
      const nextCart = await clearCartItems();
      setCart(nextCart || emptyCart);
      return nextCart || emptyCart;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.token) {
      refreshCart().catch(() => setCart(emptyCart));
    } else {
      setCart(emptyCart);
    }
  }, [user, refreshCart]);

  const value = useMemo(
    () => ({
      cart,
      loading,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      clearCart,
    }),
    [cart, loading, refreshCart, addItem, updateItem, removeItem, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
