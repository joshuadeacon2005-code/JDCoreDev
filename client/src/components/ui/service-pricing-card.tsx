import { Link } from "wouter";
import { Check, ArrowRight } from "lucide-react";
import { RippleButton } from "./ripple-button";
import { LucideIcon } from "lucide-react";

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="3"
    strokeLinecap="round" strokeLinejoin="round"
    className={className}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export interface ServicePricingCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  priceLabel: string;
  features: string[];
  buttonText: string;
  isPopular?: boolean;
  href?: string;
}

export const ServicePricingCard = ({
  icon: Icon,
  title, 
  description, 
  priceLabel, 
  features, 
  buttonText, 
  isPopular = false,
  href = "/contact"
}: ServicePricingCardProps) => {
  const cardClasses = `
    backdrop-blur-[14px] bg-gradient-to-br rounded-md shadow-xl flex-1 max-w-sm px-7 py-8 flex flex-col transition-all duration-300 min-h-[480px]
    from-black/5 to-black/0 border border-black/10
    dark:from-white/10 dark:to-white/5 dark:border-white/10 dark:backdrop-brightness-[0.91]
    ${isPopular ? 'scale-105 relative ring-2 ring-primary/30 dark:from-white/20 dark:to-white/10 dark:border-primary/40 shadow-2xl z-10' : ''}
  `;

  return (
    <div className={cardClasses.trim()}>
      {isPopular && (
        <div className="absolute -top-4 right-4 px-3 py-1 text-[12px] font-black uppercase italic tracking-wider rounded-md bg-primary text-primary-foreground">
          Most Popular
        </div>
      )}
      <div className="mb-4">
        <div className={`w-12 h-12 rounded-md flex items-center justify-center mb-4 ${isPopular ? 'bg-primary' : 'bg-primary/10'}`}>
          <Icon className={`h-6 w-6 ${isPopular ? 'text-primary-foreground' : 'text-primary'}`} />
        </div>
        <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
      </div>
      <div className="my-6 flex items-baseline gap-2">
        <span className="text-3xl md:text-4xl font-black text-foreground uppercase italic">{priceLabel}</span>
      </div>
      <div className="w-full mb-5 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <ul className="flex flex-col gap-3 text-sm text-foreground/90 mb-6 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-3">
            <CheckIcon className="text-primary w-4 h-4 flex-shrink-0" /> 
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link href={href}>
        <RippleButton 
          className={`
            mt-auto w-full py-3 rounded-md font-black uppercase italic text-sm tracking-wide flex items-center justify-center gap-2
            ${isPopular 
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
              : 'bg-foreground/10 hover:bg-foreground/20 text-foreground border border-foreground/20'
            }
          `}
        >
          {buttonText}
          <ArrowRight className="w-4 h-4" />
        </RippleButton>
      </Link>
    </div>
  );
};
