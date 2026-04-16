import { useState, useId, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Users, Calendar, FileText, BarChart3, ArrowLeft } from "lucide-react";
import logoImage from "@assets/JDCOREDEV_LOGO40x86_(86_x_40_cm)_1768475782151-BEa_X509_1776312718936.png";

const loginSchema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

const features = [
  { icon: Users, text: "Manage all your clients in one place" },
  { icon: Calendar, text: "Handle office day requests effortlessly" },
  { icon: FileText, text: "Store and organize documents securely" },
  { icon: BarChart3, text: "Track payments and milestones" },
];

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  ...props
}: React.ComponentProps<'svg'> & { width: number; height: number; x: string; y: string; squares?: number[][] }) {
  const patternId = useId();

  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern id={patternId} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      {squares && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([squareX, squareY], index) => (
            <rect strokeWidth="0" key={index} width={width + 1} height={height + 1} x={squareX * width} y={squareY * height} />
          ))}
        </svg>
      )}
    </svg>
  );
}

function genRandomPattern(length?: number): number[][] {
  length = length ?? 8;
  return Array.from({ length }, () => [
    Math.floor(Math.random() * 6) + 5,
    Math.floor(Math.random() * 8) + 1,
  ]);
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const pattern = genRandomPattern();
  
  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-white/5 dark:bg-white/5 backdrop-blur-xl rounded-2xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 via-transparent to-emerald-500/5" />
      <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,white_50%,transparent)]">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]">
          <GridPattern
            width={24}
            height={24}
            x="0"
            y="0"
            squares={pattern}
            className="fill-teal-500/10 stroke-teal-400/20 absolute inset-0 h-full w-full"
          />
        </div>
      </div>
      <div className="absolute inset-0 border border-white/10 dark:border-white/10 rounded-2xl" />
      <div className="absolute inset-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_-1px_1px_rgba(0,0,0,0.1),0_0_30px_rgba(20,184,166,0.15)]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function FeatureGlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const pattern = genRandomPattern(5);
  
  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-white/5 dark:bg-white/5 backdrop-blur-md rounded-xl" />
      <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,white_60%,transparent)]">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 [mask-image:radial-gradient(ellipse_at_top,white,transparent_80%)]">
          <GridPattern
            width={20}
            height={20}
            x="0"
            y="0"
            squares={pattern}
            className="fill-teal-500/8 stroke-teal-400/15 absolute inset-0 h-full w-full"
          />
        </div>
      </div>
      <div className="absolute inset-0 border border-white/10 dark:border-white/10 rounded-xl" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const backgroundPattern = genRandomPattern(12);

  const { data: setupStatus, isLoading: checkingSetup } = useQuery<{ setupComplete: boolean }>({
    queryKey: ["/api/setup-status"],
  });

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  // Redirect to setup if not complete
  useEffect(() => {
    if (!checkingSetup && setupStatus && !setupStatus.setupComplete) {
      setLocation("/setup");
    }
  }, [checkingSetup, setupStatus, setLocation]);
  
  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation(user.role === "admin" ? "/admin" : "/portal");
    }
  }, [user, setLocation]);
  
  if (!checkingSetup && setupStatus && !setupStatus.setupComplete) {
    return null;
  }

  if (user) {
    return null;
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const onLogin = (data: LoginFormData) => {
    loginMutation.mutate(data, {
      onSuccess: (user) => {
        setLocation(user.role === "admin" ? "/admin" : "/portal");
      },
    });
  };

  const onRegister = (data: RegisterFormData) => {
    registerMutation.mutate(
      { email: data.email, password: data.password, role: "client" },
      {
        onSuccess: (user) => {
          setLocation(user.role === "admin" ? "/admin" : "/portal");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(20,184,166,0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.1),transparent_50%)]" />
      
      <div className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,white_30%,transparent_70%)]">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-emerald-500/5">
          <GridPattern
            width={32}
            height={32}
            x="0"
            y="0"
            squares={backgroundPattern}
            className="fill-teal-500/5 stroke-teal-400/10 absolute inset-0 h-full w-full"
          />
        </div>
      </div>

      <div className="absolute top-4 left-4 z-20">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 min-h-screen flex">
        <div className="flex-1 flex items-center justify-center p-6">
          <GlassCard className="w-full max-w-md">
            <div className="p-8">
              <div className="text-center mb-8">
                <Link href="/" className="inline-block mb-6">
                  <img 
                    src={logoImage} 
                    alt="JD CoreDev" 
                    className="h-16 w-auto object-contain mx-auto mix-blend-multiply dark:mix-blend-screen"
                  />
                </Link>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                  Welcome Back
                </h1>
                <p className="text-sm text-muted-foreground mt-2">Sign in to access your dashboard</p>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")}>
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/5 dark:bg-white/5 border border-white/10">
                  <TabsTrigger 
                    value="login" 
                    data-testid="tab-login"
                    className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-400"
                  >
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger 
                    value="register" 
                    data-testid="tab-register"
                    className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-400"
                  >
                    Register
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-foreground/80">Username or Email</Label>
                      <Input
                        id="login-email"
                        type="text"
                        placeholder="you@example.com"
                        {...loginForm.register("email")}
                        data-testid="input-login-email"
                        className="bg-white/5 dark:bg-white/5 border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20"
                      />
                      {loginForm.formState.errors.email && (
                        <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-foreground/80">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Enter your password"
                        {...loginForm.register("password")}
                        data-testid="input-login-password"
                        className="bg-white/5 dark:bg-white/5 border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20"
                      />
                      {loginForm.formState.errors.password && (
                        <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white border-0"
                      disabled={loginMutation.isPending}
                      data-testid="button-login-submit"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </form>

                  <div className="mt-6 p-4 bg-white/5 dark:bg-white/5 rounded-xl border border-white/10">
                    <p className="text-xs text-muted-foreground text-center mb-2">Demo Credentials</p>
                    <div className="space-y-1 text-xs font-mono text-center">
                      <p><span className="text-muted-foreground">Client:</span> demo@client.com / demo123</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-email" className="text-foreground/80">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        {...registerForm.register("email")}
                        data-testid="input-register-email"
                        className="bg-white/5 dark:bg-white/5 border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20"
                      />
                      {registerForm.formState.errors.email && (
                        <p className="text-sm text-destructive">{registerForm.formState.errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password" className="text-foreground/80">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Create a password"
                        {...registerForm.register("password")}
                        data-testid="input-register-password"
                        className="bg-white/5 dark:bg-white/5 border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20"
                      />
                      {registerForm.formState.errors.password && (
                        <p className="text-sm text-destructive">{registerForm.formState.errors.password.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-confirm" className="text-foreground/80">Confirm Password</Label>
                      <Input
                        id="register-confirm"
                        type="password"
                        placeholder="Confirm your password"
                        {...registerForm.register("confirmPassword")}
                        data-testid="input-register-confirm"
                        className="bg-white/5 dark:bg-white/5 border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20"
                      />
                      {registerForm.formState.errors.confirmPassword && (
                        <p className="text-sm text-destructive">{registerForm.formState.errors.confirmPassword.message}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white border-0"
                      disabled={registerMutation.isPending}
                      data-testid="button-register-submit"
                    >
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </GlassCard>
        </div>

        <div className="hidden lg:flex flex-1 items-center justify-center p-12">
          <div className="max-w-md">
            <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
              Your Client Portal
            </h2>
            <p className="text-muted-foreground mb-8">
              Access your projects, request office days, view milestones, 
              and download documents all in one place.
            </p>
            <div className="space-y-4">
              {features.map((feature, i) => (
                <FeatureGlassCard key={i} className="p-4 hover-elevate">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-teal-500/20">
                      <feature.icon className="h-5 w-5 text-teal-400" />
                    </div>
                    <span className="text-sm text-foreground/80">{feature.text}</span>
                  </div>
                </FeatureGlassCard>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
