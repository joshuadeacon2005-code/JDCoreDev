import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, Building2, CreditCard, Wallet, Bitcoin, FileText, Save, Loader2, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { PaymentSettings } from "@shared/schema";
import { SUPPORTED_INVOICE_CURRENCIES, DEFAULT_USD_FX_RATES } from "@shared/currency";

interface PaymentSettingsForm {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode: string;
  iban: string;
  ukBankName: string;
  ukAccountHolderName: string;
  ukAccountNumber: string;
  ukSortCode: string;
  paypalEmail: string;
  venmoUsername: string;
  cashappTag: string;
  zelleEmail: string;
  stripePaymentLink: string;
  bitcoinAddress: string;
  ethereumAddress: string;
  checkPayableTo: string;
  mailingAddress: string;
  paymentNotes: string;
  defaultCurrency: string;
  usdToHkdRate: string;
  // Per-currency USD-to-X rates. Keys are ISO 4217 codes; values are
  // rendered as strings in the form, parsed back to numbers on submit.
  fxRates: Record<string, string>;
}

export default function AdminPaymentSettings() {
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useQuery<PaymentSettings>({
    queryKey: ["/api/admin/payment-settings"],
  });

  const form = useForm<PaymentSettingsForm>({
    defaultValues: {
      bankName: "",
      accountHolderName: "",
      accountNumber: "",
      routingNumber: "",
      swiftCode: "",
      iban: "",
      ukBankName: "",
      ukAccountHolderName: "",
      ukAccountNumber: "",
      ukSortCode: "",
      paypalEmail: "",
      venmoUsername: "",
      cashappTag: "",
      zelleEmail: "",
      stripePaymentLink: "",
      bitcoinAddress: "",
      ethereumAddress: "",
      checkPayableTo: "",
      mailingAddress: "",
      paymentNotes: "",
      defaultCurrency: "USD",
      usdToHkdRate: "7.8000",
      fxRates: {},
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        bankName: settings.bankName || "",
        accountHolderName: settings.accountHolderName || "",
        accountNumber: settings.accountNumber || "",
        routingNumber: settings.routingNumber || "",
        swiftCode: settings.swiftCode || "",
        iban: settings.iban || "",
        ukBankName: settings.ukBankName || "",
        ukAccountHolderName: settings.ukAccountHolderName || "",
        ukAccountNumber: settings.ukAccountNumber || "",
        ukSortCode: settings.ukSortCode || "",
        paypalEmail: settings.paypalEmail || "",
        venmoUsername: settings.venmoUsername || "",
        cashappTag: settings.cashappTag || "",
        zelleEmail: settings.zelleEmail || "",
        stripePaymentLink: settings.stripePaymentLink || "",
        bitcoinAddress: settings.bitcoinAddress || "",
        ethereumAddress: settings.ethereumAddress || "",
        checkPayableTo: settings.checkPayableTo || "",
        mailingAddress: settings.mailingAddress || "",
        paymentNotes: settings.paymentNotes || "",
        defaultCurrency: settings.defaultCurrency || "USD",
        usdToHkdRate: settings.usdToHkdRate || "7.8000",
        fxRates: Object.fromEntries(
          SUPPORTED_INVOICE_CURRENCIES
            .filter((c) => c.code !== "USD")
            .map((c) => {
              const stored = (settings.fxRates as Record<string, number> | null | undefined)?.[c.code];
              return [c.code, stored != null ? String(stored) : ""];
            }),
        ),
      });
    }
  }, [settings, form]);

  const refreshFxMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/payment-settings/refresh-fx", {});
      return res.json();
    },
    onSuccess: (data: { ok: boolean; count?: number; date?: string; error?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-settings"] });
      if (data.ok) {
        toast({ title: "FX rates refreshed", description: `${data.count ?? 0} currencies updated (Frankfurter ${data.date ?? "today"})` });
      } else {
        toast({ title: "Refresh failed", description: data.error ?? "unknown error", variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: PaymentSettingsForm) => {
      // Strip empty strings from fxRates and parse to numbers; null on
      // missing entries so PDFs fall back to the static defaults.
      const fxParsed: Record<string, number> = {};
      for (const [code, raw] of Object.entries(data.fxRates ?? {})) {
        const v = parseFloat(raw);
        if (Number.isFinite(v) && v > 0) fxParsed[code] = v;
      }
      const payload = { ...data, fxRates: fxParsed };
      const res = await apiRequest("PATCH", "/api/admin/payment-settings", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-settings"] });
      toast({ title: "Saved", description: "Payment settings updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: PaymentSettingsForm) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">Payment Settings</h1>
            </div>
            <p className="text-muted-foreground">
              Configure payment methods displayed on invoices
            </p>
          </div>
          <Button 
            type="submit" 
            disabled={updateMutation.isPending}
            data-testid="button-save-payment-settings"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Bank Transfer
            </CardTitle>
            <CardDescription>Wire transfer and bank deposit details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input 
                  id="bankName" 
                  {...form.register("bankName")} 
                  placeholder="e.g., Chase Bank"
                  data-testid="input-bank-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountHolderName">Account Holder Name</Label>
                <Input 
                  id="accountHolderName" 
                  {...form.register("accountHolderName")} 
                  placeholder="Full legal name"
                  data-testid="input-account-holder"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input 
                  id="accountNumber" 
                  type="password"
                  {...form.register("accountNumber")} 
                  placeholder="Bank account number"
                  data-testid="input-account-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="routingNumber">Routing Number</Label>
                <Input 
                  id="routingNumber" 
                  {...form.register("routingNumber")} 
                  placeholder="9-digit routing number"
                  data-testid="input-routing-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="swiftCode">SWIFT Code</Label>
                <Input 
                  id="swiftCode" 
                  {...form.register("swiftCode")} 
                  placeholder="International wire transfers"
                  data-testid="input-swift-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  {...form.register("iban")}
                  placeholder="International Bank Account Number"
                  data-testid="input-iban"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              UK Bank Transfer
            </CardTitle>
            <CardDescription>Sort code + 8-digit account number (HSBC, Revolut, etc.). Rendered as a separate block on invoices when populated.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ukBankName">Bank Name</Label>
                <Input
                  id="ukBankName"
                  {...form.register("ukBankName")}
                  placeholder="e.g. HSBC UK / Revolut"
                  data-testid="input-uk-bank-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ukAccountHolderName">Account Holder Name</Label>
                <Input
                  id="ukAccountHolderName"
                  {...form.register("ukAccountHolderName")}
                  placeholder="Full legal name (or trading name)"
                  data-testid="input-uk-account-holder"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ukAccountNumber">Account Number</Label>
                <Input
                  id="ukAccountNumber"
                  {...form.register("ukAccountNumber")}
                  placeholder="8-digit UK account number"
                  data-testid="input-uk-account-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ukSortCode">Sort Code</Label>
                <Input
                  id="ukSortCode"
                  {...form.register("ukSortCode")}
                  placeholder="e.g. 04-00-04"
                  data-testid="input-uk-sort-code"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Digital Payments
            </CardTitle>
            <CardDescription>Online payment methods and digital wallets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paypalEmail">PayPal Email</Label>
                <Input 
                  id="paypalEmail" 
                  type="email"
                  {...form.register("paypalEmail")} 
                  placeholder="paypal@example.com"
                  data-testid="input-paypal-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venmoUsername">Venmo Username</Label>
                <Input 
                  id="venmoUsername" 
                  {...form.register("venmoUsername")} 
                  placeholder="@username"
                  data-testid="input-venmo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cashappTag">CashApp Tag</Label>
                <Input 
                  id="cashappTag" 
                  {...form.register("cashappTag")} 
                  placeholder="$cashtag"
                  data-testid="input-cashapp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zelleEmail">Zelle Email</Label>
                <Input 
                  id="zelleEmail" 
                  type="email"
                  {...form.register("zelleEmail")} 
                  placeholder="zelle@example.com"
                  data-testid="input-zelle"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe
            </CardTitle>
            <CardDescription>Accept credit/debit card payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="stripePaymentLink">Stripe Payment Link</Label>
              <Input 
                id="stripePaymentLink" 
                {...form.register("stripePaymentLink")} 
                placeholder="https://buy.stripe.com/..."
                data-testid="input-stripe-link"
              />
              <p className="text-xs text-muted-foreground">
                Create a payment link in your Stripe dashboard to accept card payments
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bitcoin className="h-5 w-5" />
              Cryptocurrency
            </CardTitle>
            <CardDescription>Accept crypto payments (optional)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bitcoinAddress">Bitcoin Address</Label>
                <Input 
                  id="bitcoinAddress" 
                  {...form.register("bitcoinAddress")} 
                  placeholder="bc1q..."
                  data-testid="input-bitcoin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ethereumAddress">Ethereum Address</Label>
                <Input 
                  id="ethereumAddress" 
                  {...form.register("ethereumAddress")} 
                  placeholder="0x..."
                  data-testid="input-ethereum"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Check Payments
            </CardTitle>
            <CardDescription>Mail-in check payment details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkPayableTo">Payable To</Label>
                <Input 
                  id="checkPayableTo" 
                  {...form.register("checkPayableTo")} 
                  placeholder="Company or individual name"
                  data-testid="input-check-payable"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mailingAddress">Mailing Address</Label>
                <Textarea 
                  id="mailingAddress" 
                  {...form.register("mailingAddress")} 
                  placeholder="Full mailing address for checks"
                  rows={3}
                  data-testid="input-mailing-address"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Currency & Exchange Rates
            </CardTitle>
            <CardDescription>Configure currency display on invoices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultCurrency">Default Currency</Label>
                <Select 
                  value={form.watch("defaultCurrency")} 
                  onValueChange={(value) => form.setValue("defaultCurrency", value)}
                >
                  <SelectTrigger data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    <SelectItem value="HKD">HKD - Hong Kong Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="usdToHkdRate">USD to HKD Exchange Rate</Label>
                <Input
                  id="usdToHkdRate"
                  type="number"
                  step="0.0001"
                  {...form.register("usdToHkdRate")}
                  placeholder="7.8000"
                  data-testid="input-exchange-rate"
                />
                <p className="text-xs text-muted-foreground">
                  Used for HKD on invoices when no per-currency override below.
                </p>
              </div>
            </div>

            {/* Per-currency FX overrides — used by every invoice/receipt
                PDF when the client's invoiceCurrency matches a row here.
                Lookup order at render: this manual override → fxRatesAuto
                (refreshed daily from Frankfurter / ECB) → static default. */}
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">USD → local-currency rates</Label>
                <div className="flex items-center gap-2">
                  {settings?.fxRatesAutoUpdatedAt && (
                    <span className="text-xs text-muted-foreground">
                      Auto-updated {new Date(settings.fxRatesAutoUpdatedAt).toLocaleString()}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refreshFxMutation.mutate()}
                    disabled={refreshFxMutation.isPending}
                    data-testid="button-refresh-fx"
                  >
                    {refreshFxMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Refresh now
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Multiplier for <strong>1 USD → currency</strong>. Empty rows fall through to the
                auto-refreshed Frankfurter rate (placeholder); auto rates fall through to the static
                defaults if Frankfurter doesn't list the code. Manual values typed here override both.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {SUPPORTED_INVOICE_CURRENCIES.filter((c) => c.code !== "USD").map((c) => {
                  const auto = (settings?.fxRatesAuto as Record<string, number> | null | undefined)?.[c.code];
                  const placeholder = auto != null
                    ? String(auto)
                    : String(DEFAULT_USD_FX_RATES[c.code] ?? "");
                  return (
                    <div key={c.code} className="space-y-1">
                      <Label htmlFor={`fxRate-${c.code}`} className="text-xs">
                        USD → {c.code}
                        {auto != null && (
                          <span className="text-muted-foreground ml-1 font-normal">(auto: {auto})</span>
                        )}
                      </Label>
                      <Input
                        id={`fxRate-${c.code}`}
                        type="number"
                        step="0.0001"
                        placeholder={placeholder}
                        {...form.register(`fxRates.${c.code}` as const)}
                        data-testid={`input-fx-rate-${c.code.toLowerCase()}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label htmlFor="paymentNotes">Additional Payment Notes</Label>
              <Textarea 
                id="paymentNotes" 
                {...form.register("paymentNotes")} 
                placeholder="e.g., Please include invoice number in payment reference"
                rows={3}
                data-testid="input-payment-notes"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            type="submit" 
            size="lg"
            disabled={updateMutation.isPending}
            data-testid="button-save-payment-settings-bottom"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Payment Settings
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
}
