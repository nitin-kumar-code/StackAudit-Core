import { Header } from "@/components/marketing/Header";
import { HeroSection } from "@/components/marketing/HeroSection";
import { FeatureCards } from "@/components/marketing/FeatureCards";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { CtaSection } from "@/components/marketing/CtaSection";
import { Footer } from "@/components/marketing/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeatureCards />
        <TestimonialsSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
