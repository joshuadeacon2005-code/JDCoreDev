import { useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { apiRequest } from "@/lib/queryClient";
import { Mail as MailIcon, MapPin, Clock, Loader2, CheckCircle, Home, Settings, Briefcase, Sparkles, Bot, Zap } from "lucide-react";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151.png";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Services', url: '/services', icon: Settings },
  { name: 'Work', url: '/work', icon: Briefcase },
  { name: 'Contact', url: '/contact', icon: MailIcon }
];

const appTypes = [
  "AI / Automation System",
  "Custom AI Integration",
  "Chatbot or AI Tool",
  "Booking or Scheduling System",
  "CRM or Client Management",
  "Internal Dashboard / Admin Tool",
  "Web Application",
  "E-commerce Store",
  "API / Backend Service",
  "Landing Page / Marketing Site",
  "SaaS Platform",
  "Not sure yet — I just have a problem to solve",
];

const budgetRanges = [
  "Under HK$5,000",
  "HK$5,000 - HK$10,000",
  "HK$10,000 - HK$20,000",
  "HK$20,000 - HK$40,000",
  "Not sure yet",
];

const timelines = [
  "1 month",
  "2 months",
  "3 months",
  "4 months",
  "5 months",
  "6 months",
  "Flexible / Not sure",
];

const deliveryPreferences = [
  "Managed Hosting (we host and maintain it for you)",
  "Buy Outright (full ownership, you host it yourself)",
  "Not sure yet",
];

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  company: z.string().optional(),
  appType: z.string().optional(),
  budget: z.string().optional(),
  timeline: z.string().optional(),
  deliveryPreference: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const ref = params.get("ref") || "";

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      company: ref,
      appType: "",
      budget: "",
      timeline: "",
      deliveryPreference: "",
      message: ref ? `Hi — I came from the homepage and entered "${ref}". Would love to understand what AI could do for my business.` : "",
    },
  });

  useEffect(() => {
    if (ref) {
      form.setValue("company", ref);
      form.setValue("message", `Hi — I came from the homepage and entered "${ref}". Would love to understand what AI could do for my business.`);
    }
  }, [ref]);

  const submitMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const res = await apiRequest("POST", "/api/contact", data);
      return res.json();
    },
  });

  const onSubmit = (data: ContactFormData) => {
    submitMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <NavBar items={navItems} />
      <nav className="py-6 px-8 flex justify-between items-center sticky top-0 bg-background/80 backdrop-blur-sm z-40">
        <Link href="/" className="flex items-center gap-2">
          <img 
            src={logoImage} 
            alt="JD CoreDev" 
            className="h-16 md:h-20 w-auto mix-blend-multiply dark:mix-blend-screen"
          />
        </Link>
        <div className="flex items-center gap-6">
          <ThemeToggle />
          <Link href="/auth">
            <Button 
              variant="outline" 
              className="font-black uppercase italic text-xs tracking-wider"
              data-testid="button-login"
            >
              Sign In
            </Button>
          </Link>
        </div>
      </nav>

      <main>
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary text-[10px] uppercase font-bold mb-6">
                <Sparkles className="h-3 w-3" />
                Free AI assessment
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic mb-4">
                Let's figure out <span className="text-primary">your AI setup</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Tell us about your business and what's a pain right now. We'll come back with specific ideas on what a custom AI system could look like for you — no pitch, no pressure.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
              <div>
                {submitMutation.isSuccess ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-8 border border-border rounded-lg bg-muted/20" data-testid="contact-success">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                      <CheckCircle className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tight mb-3">Nice one.</h2>
                    <p className="text-muted-foreground leading-relaxed mb-2">
                      We're putting together some ideas on how a custom AI setup could work for your business.
                    </p>
                    <p className="text-muted-foreground leading-relaxed mb-8">
                      You'll hear from us within 24 hours — expect something specific to your situation, not a generic brochure.
                    </p>
                    <Link href="/">
                      <Button variant="outline" className="font-bold uppercase tracking-widest text-xs">
                        Back to home
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        {...form.register("name")}
                        data-testid="input-name"
                      />
                      {form.formState.errors.name && (
                        <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        {...form.register("email")}
                        data-testid="input-email"
                      />
                      {form.formState.errors.email && (
                        <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company">Business name or URL (optional)</Label>
                      <Input
                        id="company"
                        placeholder="Your business or website"
                        {...form.register("company")}
                        data-testid="input-company"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="appType">What do you need?</Label>
                      <Select
                        value={form.watch("appType")}
                        onValueChange={(value) => form.setValue("appType", value)}
                      >
                        <SelectTrigger data-testid="select-app-type">
                          <SelectValue placeholder="Pick the closest option" />
                        </SelectTrigger>
                        <SelectContent>
                          {appTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="budget">Budget</Label>
                        <Select
                          value={form.watch("budget")}
                          onValueChange={(value) => form.setValue("budget", value)}
                        >
                          <SelectTrigger data-testid="select-budget">
                            <SelectValue placeholder="Select budget" />
                          </SelectTrigger>
                          <SelectContent>
                            {budgetRanges.map((range) => (
                              <SelectItem key={range} value={range}>{range}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="timeline">Timeline</Label>
                        <Select
                          value={form.watch("timeline")}
                          onValueChange={(value) => form.setValue("timeline", value)}
                        >
                          <SelectTrigger data-testid="select-timeline">
                            <SelectValue placeholder="Select timeline" />
                          </SelectTrigger>
                          <SelectContent>
                            {timelines.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="deliveryPreference">Delivery Preference</Label>
                      <Select
                        value={form.watch("deliveryPreference")}
                        onValueChange={(value) => form.setValue("deliveryPreference", value)}
                      >
                        <SelectTrigger data-testid="select-delivery-preference">
                          <SelectValue placeholder="How would you like it delivered?" />
                        </SelectTrigger>
                        <SelectContent>
                          {deliveryPreferences.map((pref) => (
                            <SelectItem key={pref} value={pref}>{pref}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Managed hosting means we handle everything after launch. Buy outright means full ownership.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">What's the problem you're trying to solve?</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us what's a pain in your business right now — we'll figure out the rest."
                        className="min-h-[150px]"
                        {...form.register("message")}
                        data-testid="input-message"
                      />
                      {form.formState.errors.message && (
                        <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full font-bold uppercase tracking-widest text-xs gap-2" 
                      disabled={submitMutation.isPending}
                      data-testid="button-submit"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Working out where AI fits in…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Get my free AI assessment
                        </>
                      )}
                    </Button>

                    {submitMutation.isError && (
                      <p className="text-sm text-destructive text-center">Something went wrong — please try again or email us directly.</p>
                    )}
                  </form>
                )}
              </div>

              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MailIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Email</h3>
                        <p className="text-sm text-muted-foreground">joshuadeacon888@gmail.com</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Location</h3>
                        <p className="text-sm text-muted-foreground">Hong Kong · Remote worldwide</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Response time</h3>
                        <p className="text-sm text-muted-foreground">Within 24 hours</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="p-6 bg-muted/50 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="font-bold uppercase tracking-wide text-sm">What happens next</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <Bot className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>We review your message and look at your business</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>We put together specific ideas — which bits of your business AI could actually improve and how</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <MailIcon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>You get a real response — not a template — within 24 hours</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>If it makes sense to chat, we book a quick call. No sales pressure, no commitment</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground">
          {new Date().getFullYear()} JD CoreDev. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
