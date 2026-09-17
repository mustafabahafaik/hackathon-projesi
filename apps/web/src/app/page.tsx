import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { StatBand } from "@/components/landing/stat-band";
import { SiteFooter } from "@/components/site-footer";

export default function LandingPage() {
  return (
    <div>
      <Hero />
      <StatBand />
      <HowItWorks />
      <SiteFooter />
    </div>
  );
}
