import { create } from "zustand";

export const useCommerceStore = create((set) => ({
  company: "Wokbook",
  period: "Today",
  setPeriod: (period) => set({ period }),

  session: null,
  setSession: (session) => set({ session }),
  checkingSession: true,
  setCheckingSession: (checkingSession) => set({ checkingSession }),

  dashboardData: null,
  setDashboardData: (dashboardData) => set({ dashboardData }),

  connectedChannels: [],
  setConnectedChannels: (val) =>
    set((state) => ({
      connectedChannels: typeof val === "function"
        ? (Array.isArray(val(state.connectedChannels)) ? val(state.connectedChannels) : [])
        : (Array.isArray(val) ? val : []),
    })),
  channelsError: "",
  setChannelsError: (channelsError) => set({ channelsError }),
  isLoadingChannels: true,
  setIsLoadingChannels: (isLoadingChannels) => set({ isLoadingChannels }),
}));
