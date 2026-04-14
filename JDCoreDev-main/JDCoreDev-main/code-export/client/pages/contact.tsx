import { Link } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail as MailIcon, MapPin, Clock, Loader2, CheckCircle, Home, Settings, Briefcase } from "lucide-react";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151.png";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Services', url: '/services', icon: Settings },
  { name: 'Work', url: '/work', icon: Briefcase },
  { name: 'Contact', url: '/contact', icon: MailIcon }
];

const appTypes = [
  "Web Application",
  "Mobile App",
  "E-commerce Store",
  "Dashboard / Admin Panel",
  "API / Backend Service",
  "Landing Page / Marketing Site",
  "SaaS Platform",
  "Other",
];

const budgetRanges = [
  "Under $1,500",
  "$1,500 - $3,000",
  "$3,000 - $5,000",
  "$5,000 - $10,000",
  "$10,000 - $15,000",
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
  const { toast } = useToast();
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      appType: "",
      budget: "",
      timeline: "",
      deliveryPreference: "",
      message: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const res = await apiRequest("POST", "/api/contact", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Message sent!",
        description: "We'll get back to you as soon as possible.",
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
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
              <h1 className="text-4xl font-bold mb-4">Get in Touch</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Have a project in mind? We'd love to hear from you.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12">
              <div>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
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
                    <Label htmlFor="company">Company (optional)</Label>
                    <Input
                      id="company"
                      placeholder="Your company"
                      {...form.register("company")}
                      data-testid="input-company"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="appType">What are you building?</Label>
                    <Select
                      value={form.watch("appType")}
                      onValueChange={(value) => form.setValue("appType", value)}
                    >
                      <SelectTrigger data-testid="select-app-type">
                        <SelectValue placeholder="Select app type" />
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
                        <SelectValue placeholder="How would you like your software delivered?" />
                      </SelectTrigger>
                      <SelectContent>
                        {deliveryPreferences.map((pref) => (
                          <SelectItem key={pref} value={pref}>{pref}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose managed hosting for hassle-free maintenance, or buy outright for full ownership
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us about your project..."
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
                    className="w-full" 
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : submitMutation.isSuccess ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Message Sent
                      </>
                    ) : (
                      "Send Message"
                    )}
                  </Button>
                </form>
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
                        <p className="text-sm text-muted-foreground">Remote / Worldwide</p>
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
                        <h3 className="font-medium mb-1">Response Time</h3>
                        <p className="text-sm text-muted-foreground">Within 24 hours</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="p-6 bg-muted/50 rounded-lg">
                  <h3 className="font-medium mb-2">What to Expect</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      We'll review your message
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Schedule an initial call if needed
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Provide a project assessment
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Discuss timeline and approach
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
