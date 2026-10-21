import type { SiteLink } from "@/types";

export const siteConfig = {
  name: "CloudVault AI",
  description: "AI Powered Secure Cloud Storage",
  url: "https://cloudvault.ai",
};

export const siteNavigation = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
] satisfies SiteLink[];

export const socialLinks = [
  { label: "GitHub", href: "#social-github" },
  { label: "LinkedIn", href: "#social-linkedin" },
  { label: "X", href: "#social-x" },
] satisfies SiteLink[];