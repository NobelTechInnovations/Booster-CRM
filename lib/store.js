import { create } from "zustand";

export const useCommerceStore = create((set) => ({
  company: "Sukirti Naturals",
  period: "Today",
  setPeriod: (period) => set({ period }),
}));
