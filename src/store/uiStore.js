import { create } from 'zustand';















export const useUIStore = create((set) => ({
  drawerOpen: false,
  activeTab: 0,
  showLoginModal: false,
  theme: 'light',
  language: 'zh',

  /**
   * Toggle drawer (sidebar/menu)
   */
  setDrawer: (open) => {
    set({ drawerOpen: open });
  },

  /**
   * Set active tab
   */
  setActiveTab: (index) => {
    set({ activeTab: index });
  },

  /**
   * Show/hide login modal
   */
  setShowLogin: (show) => {
    set({ showLoginModal: show });
  },

  /**
   * Set theme
   */
  setTheme: (theme) => {
    set({ theme });
  },

  /**
   * Set language
   */
  setLanguage: (language) => {
    set({ language });
  }
}));

export default useUIStore;