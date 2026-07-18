/** Shared Clerk appearance — matches the light RouteLag design system. */
export const clerkAppearance = {
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: "#ff3b12",
    colorPrimaryForeground: "#ffffff",
    colorDanger: "#d94343",
    colorSuccess: "#2dba55",
    colorWarning: "#d98b16",
    colorNeutral: "#161616",
    colorForeground: "#161616",
    colorMutedForeground: "#666764",
    colorBackground: "#ffffff",
    colorInput: "#f7f7f5",
    colorInputForeground: "#161616",
    colorBorder: "rgba(20, 20, 20, 0.08)",
    colorMuted: "#f0f0ee",
    colorModalBackdrop: "rgba(25, 25, 25, 0.45)",
    borderRadius: "14px",
    fontFamily: '"Inter", system-ui, sans-serif',
  },
  elements: {
    footerItem: {
      display: "none",
    },
    cardBox: {
      background: "#ffffff",
      borderColor: "rgba(20, 20, 20, 0.08)",
      boxShadow: "0 22px 60px rgba(25, 25, 25, 0.11)",
      borderRadius: "24px",
      overflow: "hidden",
    },
    card: {
      background: "#ffffff",
      borderColor: "rgba(20, 20, 20, 0.08)",
    },
    modalContent: {
      background: "#ffffff",
      borderColor: "rgba(20, 20, 20, 0.08)",
      borderRadius: "24px",
      overflow: "hidden",
    },
    modalCloseButton: {
      zIndex: "20",
    },
    headerTitle: {
      color: "#161616",
      fontWeight: "600",
    },
    headerSubtitle: {
      color: "#666764",
    },
    drawerContent: {
      background: "#ffffff",
      borderColor: "rgba(20, 20, 20, 0.08)",
      borderRadius: "24px",
      width: "420px",
      maxWidth: "420px",
      height: "auto",
      maxHeight: "none",
      boxShadow: "0 22px 60px rgba(25, 25, 25, 0.14)",
    },
    drawerHeader: {
      background: "#f7f7f5",
      borderColor: "rgba(20, 20, 20, 0.08)",
    },
    drawerTitle: {
      color: "#161616",
      fontWeight: "650",
    },
    drawerBody: {
      background: "#ffffff",
      flex: "1 1 auto",
      minHeight: "0",
    },
    drawerRoot: {
      background: "rgba(25, 25, 25, 0.4)",
    },
    alert: {
      width: "100%",
      alignItems: "flex-start",
      gap: "12px",
      padding: "14px",
      borderRadius: "14px",
      border: "1px solid rgba(217, 67, 67, 0.22)",
      background: "#fff5f4",
      boxShadow: "0 1px 2px rgba(217, 67, 67, 0.06)",
    },
    alertIcon: {
      width: "32px",
      height: "32px",
      flexShrink: "0",
      borderRadius: "10px",
      background: "rgba(217, 67, 67, 0.12)",
      color: "#c53a3a",
    },
    alertTextContainer: {
      gap: "2px",
      paddingTop: "2px",
      flex: "1 1 auto",
    },
    alertText: {
      color: "#8f2a2a",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "1.45",
      letterSpacing: "-0.01em",
    },
    formButtonPrimary: {
      background: "#ff3b12",
      color: "#ffffff",
      borderRadius: "999px",
      boxShadow: "none",
      backgroundImage: "none",
      fontWeight: "650",
      "&:hover": {
        background: "#e9330e",
        backgroundImage: "none",
        color: "#ffffff",
      },
      '&[data-color="danger"]': {
        background: "#3a3b3d",
        borderColor: "#3a3b3d",
        color: "#ffffff",
        backgroundImage: "none",
        "&:hover": {
          background: "#ff3b12",
          borderColor: "#ff3b12",
          backgroundImage: "none",
          color: "#ffffff",
        },
      },
    },
    checkoutFormLineItemsRoot: {
      color: "#161616",
    },
    checkoutFormElementsRoot: {
      color: "#161616",
    },
    paymentMethodRow: {
      color: "#161616",
    },
    paymentMethodRowText: {
      color: "#161616",
    },
    pricingTable: {
      background: "transparent",
      gap: "10px",
      width: "100%",
      maxWidth: "100%",
    },
    pricingTableCard: {
      background: "#ffffff",
      border: "1px solid rgba(20, 20, 20, 0.08)",
      borderRadius: "16px",
      boxShadow: "none",
      minHeight: "0",
      maxHeight: "none",
      height: "auto",
      display: "flex",
      flexDirection: "column",
    },
    pricingTableCardHeader: {
      color: "#161616",
      paddingBottom: "6px",
    },
    pricingTableCardTitle: {
      color: "#161616",
      fontSize: "15px",
      fontWeight: "600",
    },
    pricingTableCardDescription: {
      color: "#666764",
      fontSize: "12px",
      fontWeight: "400",
    },
    pricingTableCardFee: {
      color: "#161616",
      fontSize: "26px",
      fontWeight: "600",
      letterSpacing: "-0.03em",
    },
    pricingTableCardFeePeriod: {
      color: "#8a8b87",
      fontSize: "12px",
    },
    pricingTableCardFeatures: {
      color: "#666764",
      flex: "1",
    },
    pricingTableCardFeaturesListItem: {
      color: "#666764",
      fontSize: "12px",
      fontWeight: "400",
    },
    pricingTableCardFooter: {
      background: "transparent",
      borderTop: "1px solid rgba(20, 20, 20, 0.08)",
      paddingTop: "10px",
    },
    pricingTableCardButton: {
      background: "#ff3b12",
      color: "#ffffff",
      borderRadius: "999px",
      boxShadow: "none",
      backgroundImage: "none",
      fontWeight: "650",
      height: "36px",
      minHeight: "36px",
      "&:hover": {
        background: "#e9330e",
        backgroundImage: "none",
        color: "#ffffff",
      },
    },
    badge: {
      borderRadius: "999px",
    },
  },
} as const;

/** Tighter UserProfile popup — only pass this to openUserProfile / billing drawers. */
export const clerkUserProfileAppearance = {
  ...clerkAppearance,
  elements: {
    ...clerkAppearance.elements,
    rootBox: {
      width: "100%",
    },
    cardBox: {
      ...clerkAppearance.elements.cardBox,
      width: "min(800px, calc(100vw - 32px))",
      maxWidth: "min(800px, calc(100vw - 32px))",
      height: "min(720px, calc(100vh - 32px))",
      maxHeight: "min(720px, calc(100vh - 32px))",
      overflow: "hidden",
      position: "relative",
    },
    modalContent: {
      ...clerkAppearance.elements.modalContent,
      width: "min(800px, calc(100vw - 32px))",
      maxWidth: "min(800px, calc(100vw - 32px))",
      height: "min(720px, calc(100vh - 32px))",
      maxHeight: "min(720px, calc(100vh - 32px))",
      overflow: "hidden",
    },
    navbar: {
      background: "#f7f7f5",
      borderColor: "rgba(20, 20, 20, 0.08)",
      padding: "14px 10px",
      width: "168px",
      borderTopLeftRadius: "24px",
      borderBottomLeftRadius: "24px",
      marginInlineEnd: "0",
    },
    navbarButton: {
      height: "34px",
      borderRadius: "10px",
      fontSize: "13px",
    },
    scrollBox: {
      background: "#ffffff",
      overflow: "visible",
      borderRadius: "0 24px 24px 0",
      borderTopLeftRadius: "0",
      borderBottomLeftRadius: "0",
      borderTopRightRadius: "24px",
      borderBottomRightRadius: "24px",
      marginBlock: "0",
      marginInlineEnd: "0",
      borderWidth: "0",
    },
    pageScrollBox: {
      padding: "14px 16px",
      overflowY: "auto",
      overflowX: "visible",
    },
    profileSection: {
      paddingTop: "10px",
      paddingBottom: "10px",
      gap: "8px",
      overflow: "visible",
    },
    profileSectionItemList: {
      overflow: "visible",
    },
    profileSectionItem: {
      overflow: "visible",
    },
    menuList: {
      zIndex: "100000",
    },
    footerItem: {
      display: "none",
    },
    // One Google / email identity per subscription — no add/connect actions.
    profileSectionPrimaryButton__emailAddresses: {
      display: "none !important",
    },
    profileSectionPrimaryButton__connectedAccounts: {
      display: "none !important",
    },
  },
} as const;

const clerkAppearanceDark = {
  ...clerkAppearance,
  variables: {
    ...clerkAppearance.variables,
    colorNeutral: "#f2f2f0",
    colorForeground: "#f2f2f0",
    colorMutedForeground: "#a3a4a0",
    colorBackground: "#1c1d1f",
    colorInput: "#161718",
    colorInputForeground: "#f2f2f0",
    colorBorder: "rgba(255, 255, 255, 0.09)",
    colorMuted: "#232426",
    colorModalBackdrop: "rgba(0, 0, 0, 0.6)",
  },
  elements: {
    ...clerkAppearance.elements,
    cardBox: {
      ...clerkAppearance.elements.cardBox,
      background: "#1c1d1f",
      borderColor: "rgba(255, 255, 255, 0.09)",
      boxShadow: "0 22px 60px rgba(0, 0, 0, 0.5)",
    },
    card: {
      background: "#1c1d1f",
      borderColor: "rgba(255, 255, 255, 0.09)",
    },
    modalContent: {
      ...clerkAppearance.elements.modalContent,
      background: "#1c1d1f",
      borderColor: "rgba(255, 255, 255, 0.09)",
    },
    headerTitle: {
      ...clerkAppearance.elements.headerTitle,
      color: "#f2f2f0",
    },
    headerSubtitle: {
      color: "#a3a4a0",
    },
    drawerContent: {
      ...clerkAppearance.elements.drawerContent,
      background: "#1c1d1f",
      borderColor: "rgba(255, 255, 255, 0.09)",
      boxShadow: "0 22px 60px rgba(0, 0, 0, 0.5)",
    },
    drawerHeader: {
      background: "#232426",
      borderColor: "rgba(255, 255, 255, 0.09)",
    },
    drawerTitle: {
      ...clerkAppearance.elements.drawerTitle,
      color: "#f2f2f0",
    },
    drawerBody: {
      ...clerkAppearance.elements.drawerBody,
      background: "#1c1d1f",
    },
    alert: {
      ...clerkAppearance.elements.alert,
      background: "rgba(217, 67, 67, 0.14)",
      border: "1px solid rgba(232, 90, 90, 0.28)",
    },
    alertText: {
      ...clerkAppearance.elements.alertText,
      color: "#f0a0a0",
    },
    pricingTableCard: {
      ...clerkAppearance.elements.pricingTableCard,
      background: "#232426",
      border: "1px solid rgba(255, 255, 255, 0.09)",
      color: "#f2f2f0",
    },
    pricingTableCardHeader: {
      ...clerkAppearance.elements.pricingTableCardHeader,
      color: "#f2f2f0",
      background: "transparent",
    },
    pricingTableCardTitle: {
      ...clerkAppearance.elements.pricingTableCardTitle,
      color: "#f2f2f0",
    },
    pricingTableCardDescription: {
      ...clerkAppearance.elements.pricingTableCardDescription,
      color: "#a3a4a0",
    },
    pricingTableCardFee: {
      ...clerkAppearance.elements.pricingTableCardFee,
      color: "#f2f2f0",
    },
    pricingTableCardFeePeriod: {
      ...clerkAppearance.elements.pricingTableCardFeePeriod,
      color: "#7a7b77",
    },
    pricingTableCardBody: {
      background: "transparent",
      color: "#f2f2f0",
    },
    pricingTableCardFeatures: {
      ...clerkAppearance.elements.pricingTableCardFeatures,
      background: "#1c1d1f",
      color: "#a3a4a0",
      borderTop: "1px solid rgba(255, 255, 255, 0.09)",
    },
    pricingTableCardFeaturesListItem: {
      ...clerkAppearance.elements.pricingTableCardFeaturesListItem,
      color: "#c8c9c4",
    },
    pricingTableCardFooter: {
      ...clerkAppearance.elements.pricingTableCardFooter,
      background: "#232426",
      borderTop: "1px solid rgba(255, 255, 255, 0.09)",
    },
    pricingTableCardFooterNotice: {
      color: "#a3a4a0",
    },
    pricingTableCardFooterButton: {
      background: "#3a3b3d",
      color: "#f2f2f0",
      borderRadius: "999px",
      boxShadow: "none",
      backgroundImage: "none",
      "&:hover": {
        background: "#ff3b12",
        color: "#ffffff",
        backgroundImage: "none",
      },
    },
    pricingTableCardPeriodToggle: {
      color: "#a3a4a0",
    },    checkoutFormLineItemsRoot: {
      color: "#f2f2f0",
    },
    checkoutFormElementsRoot: {
      color: "#f2f2f0",
    },
    paymentMethodRow: {
      color: "#f2f2f0",
    },
    paymentMethodRowText: {
      color: "#f2f2f0",
    },
    otpCodeFieldInput: {
      background: "#161718",
      borderColor: "rgba(255, 255, 255, 0.12)",
      color: "#f2f2f0",
    },
    formFieldInput: {
      background: "#161718",
      borderColor: "rgba(255, 255, 255, 0.12)",
      color: "#f2f2f0",
    },
    formFieldLabel: {
      color: "#a3a4a0",
    },
    identityPreviewText: {
      color: "#a3a4a0",
    },
    footerActionText: {
      color: "#a3a4a0",
    },
  },
} as const;

const clerkUserProfileAppearanceDark = {
  ...clerkAppearanceDark,
  elements: {
    ...clerkAppearanceDark.elements,
    ...clerkUserProfileAppearance.elements,
    cardBox: {
      ...clerkAppearanceDark.elements.cardBox,
      width: "min(800px, calc(100vw - 32px))",
      maxWidth: "min(800px, calc(100vw - 32px))",
      height: "min(720px, calc(100vh - 32px))",
      maxHeight: "min(720px, calc(100vh - 32px))",
      overflow: "hidden",
      position: "relative",
    },
    modalContent: {
      ...clerkAppearanceDark.elements.modalContent,
      width: "min(800px, calc(100vw - 32px))",
      maxWidth: "min(800px, calc(100vw - 32px))",
      height: "min(720px, calc(100vh - 32px))",
      maxHeight: "min(720px, calc(100vh - 32px))",
      overflow: "hidden",
    },
    navbar: {
      background: "#232426",
      borderColor: "rgba(255, 255, 255, 0.09)",
      padding: "14px 10px",
      width: "168px",
      borderTopLeftRadius: "24px",
      borderBottomLeftRadius: "24px",
      marginInlineEnd: "0",
    },
    scrollBox: {
      background: "#1c1d1f",
      overflow: "visible",
      borderRadius: "0 24px 24px 0",
      borderTopLeftRadius: "0",
      borderBottomLeftRadius: "0",
      borderTopRightRadius: "24px",
      borderBottomRightRadius: "24px",
      marginBlock: "0",
      marginInlineEnd: "0",
      borderWidth: "0",
    },
    pageScrollBox: {
      padding: "14px 16px",
      overflowY: "auto",
      overflowX: "visible",
    },
    headerTitle: {
      color: "#f2f2f0",
      fontWeight: "600",
    },
    menuList: {
      zIndex: "100000",
      background: "#232426",
      borderColor: "rgba(255, 255, 255, 0.09)",
      color: "#f2f2f0",
    },
    menuItem: {
      color: "#f2f2f0",
    },
    footerItem: {
      display: "none",
    },
    // Re-apply after light user-profile element spread (that otherwise forces white plan cards).
    pricingTable: {
      ...clerkAppearanceDark.elements.pricingTable,
      background: "transparent",
    },
    pricingTableCard: {
      ...clerkAppearanceDark.elements.pricingTableCard,
      background: "#232426",
      border: "1px solid rgba(255, 255, 255, 0.09)",
      color: "#f2f2f0",
    },
    pricingTableCardHeader: {
      ...clerkAppearanceDark.elements.pricingTableCardHeader,
      color: "#f2f2f0",
      background: "transparent",
    },
    pricingTableCardTitle: {
      ...clerkAppearanceDark.elements.pricingTableCardTitle,
      color: "#f2f2f0",
    },
    pricingTableCardDescription: {
      ...clerkAppearanceDark.elements.pricingTableCardDescription,
      color: "#a3a4a0",
    },
    pricingTableCardFee: {
      ...clerkAppearanceDark.elements.pricingTableCardFee,
      color: "#f2f2f0",
    },
    pricingTableCardFeePeriod: {
      ...clerkAppearanceDark.elements.pricingTableCardFeePeriod,
      color: "#7a7b77",
    },
    pricingTableCardBody: {
      background: "transparent",
      color: "#f2f2f0",
    },
    pricingTableCardFeatures: {
      ...clerkAppearanceDark.elements.pricingTableCardFeatures,
      background: "#1c1d1f",
      color: "#a3a4a0",
      borderTop: "1px solid rgba(255, 255, 255, 0.09)",
    },
    pricingTableCardFeaturesListItem: {
      ...clerkAppearanceDark.elements.pricingTableCardFeaturesListItem,
      color: "#c8c9c4",
    },
    pricingTableCardFeaturesListItemTitle: {
      color: "#f2f2f0",
    },
    pricingTableCardPeriodToggle: {
      color: "#a3a4a0",
    },
    pricingTableCardFooter: {
      ...clerkAppearanceDark.elements.pricingTableCardFooter,
      background: "#232426",
      borderTop: "1px solid rgba(255, 255, 255, 0.09)",
    },
    pricingTableCardFooterNotice: {
      color: "#a3a4a0",
    },
    pricingTableCardFooterButton: {
      background: "#3a3b3d",
      color: "#f2f2f0",
      borderRadius: "999px",
      boxShadow: "none",
      backgroundImage: "none",
      "&:hover": {
        background: "#ff3b12",
        color: "#ffffff",
        backgroundImage: "none",
      },
    },
    pricingTableCardButton: {
      ...clerkAppearance.elements.pricingTableCardButton,
    },
    formButtonPrimary: {
      ...clerkAppearance.elements.formButtonPrimary,
      '&[data-color="danger"]': {
        background: "#3a3b3d",
        borderColor: "#3a3b3d",
        color: "#ffffff",
        backgroundImage: "none",
        "&:hover": {
          background: "#ff3b12",
          borderColor: "#ff3b12",
          backgroundImage: "none",
          color: "#ffffff",
        },
      },
    },
    profileSectionPrimaryButton__emailAddresses: {
      display: "none !important",
    },
    profileSectionPrimaryButton__connectedAccounts: {
      display: "none !important",
    },
  },
} as const;

export function getClerkAppearance(theme: "light" | "dark" = "dark") {
  return theme === "dark" ? clerkAppearanceDark : clerkAppearance;
}

export function getClerkUserProfileAppearance(theme: "light" | "dark" = "dark") {
  return theme === "dark" ? clerkUserProfileAppearanceDark : clerkUserProfileAppearance;
}
