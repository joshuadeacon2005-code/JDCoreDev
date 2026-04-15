import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  TrendingUp, TrendingDown, Bell, Plus, Settings, Newspaper, 
  Trash2, RefreshCw, Loader2, ExternalLink, X
} from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import type { TrackedCoin, PriceAlert, CryptoNotificationSettings, PriceHistory } from "@shared/schema";

function formatPrice(price: number): string {
  if (price >= 1) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (price >= 0.01) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  } else if (price >= 0.0001) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  } else {
    return price.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 });
  }
}

type CoinWithPrice = TrackedCoin & {
  currentPrice: {
    priceUsd: number;
    priceHkd: number;
    marketCap: number;
    volume24h: number;
    percentChange1h: number;
    percentChange24h: number;
    percentChange7d: number;
  } | null;
};

type CoinSearchResult = {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  large: string;
  blockchain?: string;
};

type NewsArticle = {
  title: string;
  description: string;
  url: string;
  sourceName: string;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string;
};

export default function CryptoTracker() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("portfolio");
  const [showAddCoinDialog, setShowAddCoinDialog] = useState(false);
  const [showAddAlertDialog, setShowAddAlertDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedCoinForAlert, setSelectedCoinForAlert] = useState<string | null>(null);

  const { data: coinsWithPrices, isLoading: loadingCoins, refetch: refetchCoins } = useQuery<CoinWithPrice[]>({
    queryKey: ["/api/admin/crypto/coins/prices"],
    refetchInterval: 60000,
  });

  const { data: alerts } = useQuery<PriceAlert[]>({
    queryKey: ["/api/admin/crypto/alerts"],
  });

  const { data: settings } = useQuery<CryptoNotificationSettings>({
    queryKey: ["/api/admin/crypto/settings"],
  });

  const refreshPricesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/crypto/check-prices");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/coins/prices"] });
      toast({ title: "Prices refreshed" });
    },
    onError: () => {
      toast({ title: "Failed to refresh prices", variant: "destructive" });
    },
  });

  const activeAlertCount = alerts?.filter(a => a.status === "active").length || 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-crypto-title">Crypto Tracker</h1>
            <p className="text-muted-foreground">
              Monitor cryptocurrency prices with real-time alerts
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => refreshPricesMutation.mutate()}
              disabled={refreshPricesMutation.isPending}
              data-testid="button-refresh-prices"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshPricesMutation.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowSettingsDialog(true)}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button onClick={() => setShowAddCoinDialog(true)} data-testid="button-add-coin">
              <Plus className="h-4 w-4 mr-2" />
              Add Coin
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="portfolio" data-testid="tab-portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="alerts" data-testid="tab-alerts">
              Alerts
              {activeAlertCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeAlertCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="news" data-testid="tab-news">News</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio" className="mt-6">
            {loadingCoins ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-8 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-20" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : coinsWithPrices && coinsWithPrices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coinsWithPrices.map((coin) => (
                  <CoinCard 
                    key={coin.id} 
                    coin={coin} 
                    onAddAlert={() => {
                      setSelectedCoinForAlert(coin.coinId);
                      setShowAddAlertDialog(true);
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground mb-4">No cryptocurrencies being tracked</p>
                  <Button onClick={() => setShowAddCoinDialog(true)} data-testid="button-add-first-coin">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Coin
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="alerts" className="mt-6">
            <AlertsList 
              alerts={alerts || []} 
              coins={coinsWithPrices || []}
            />
          </TabsContent>

          <TabsContent value="news" className="mt-6">
            <NewsGrid coins={coinsWithPrices || []} />
          </TabsContent>
        </Tabs>
      </div>

      <AddCoinDialog 
        open={showAddCoinDialog} 
        onOpenChange={setShowAddCoinDialog} 
      />

      <AddAlertDialog 
        open={showAddAlertDialog} 
        onOpenChange={setShowAddAlertDialog}
        coins={coinsWithPrices || []}
        selectedCoinId={selectedCoinForAlert}
      />

      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        settings={settings}
      />
    </AdminLayout>
  );
}

function CoinCard({ coin, onAddAlert }: { coin: CoinWithPrice; onAddAlert: () => void }) {
  const { toast } = useToast();
  const isPositive = (coin.currentPrice?.percentChange24h || 0) >= 0;
  
  const { data: priceHistoryData } = useQuery<PriceHistory[]>({
    queryKey: ["/api/admin/crypto/coins", coin.coinId, "history"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/crypto/coins/${encodeURIComponent(coin.coinId)}/history?limit=48`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 60000,
  });

  const chartData = priceHistoryData?.slice().reverse().map((h) => ({
    time: new Date(h.recordedAt).getTime(),
    price: parseFloat(h.priceUsd),
  })) || [];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/admin/crypto/coins/${coin.coinId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/coins/prices"] });
      toast({ title: "Coin removed" });
    },
  });

  return (
    <Card data-testid={`card-coin-${coin.coinId}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          {coin.iconUrl && (
            <img src={coin.iconUrl} alt={coin.symbol} className="w-8 h-8 rounded-full" />
          )}
          <div>
            <CardTitle className="text-lg">{coin.symbol}</CardTitle>
            <p className="text-sm text-muted-foreground">{coin.name}</p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          data-testid={`button-delete-coin-${coin.coinId}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      
      <CardContent>
        {coin.currentPrice ? (
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-bold font-mono" data-testid={`text-price-${coin.coinId}`}>
                ${formatPrice(coin.currentPrice.priceUsd)}
              </div>
              <div className="text-sm text-muted-foreground font-mono">
                HK${formatPrice(coin.currentPrice.priceHkd)}
              </div>
            </div>
            
            <div className={`flex items-center gap-1 text-sm ${isPositive ? "text-green-600" : "text-red-600"}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span data-testid={`text-change-${coin.coinId}`}>
                {Math.abs(coin.currentPrice.percentChange24h).toFixed(2)}%
              </span>
              <span className="text-muted-foreground">24h</span>
            </div>

            {chartData.length > 1 && (
              <div className="h-16 w-full" data-testid={`chart-${coin.coinId}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <YAxis domain={['dataMin', 'dataMax']} hide />
                    <Tooltip
                      contentStyle={{ fontSize: '12px', padding: '4px 8px' }}
                      labelFormatter={(value) => format(new Date(value), 'MMM d, h:mm a')}
                      formatter={(value: number) => [`$${formatPrice(value)}`, 'Price']}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={isPositive ? "#16a34a" : "#dc2626"}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            
            <div className="pt-1 flex gap-2">
              <Button size="sm" variant="outline" onClick={onAddAlert} data-testid={`button-add-alert-${coin.coinId}`}>
                <Bell className="h-3 w-3 mr-1" />
                Alert
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">Loading price...</div>
        )}
      </CardContent>
    </Card>
  );
}

function AddCoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCoin, setSelectedCoin] = useState<CoinSearchResult | null>(null);
  const [searchSource, setSearchSource] = useState<"coingecko" | "solana">("coingecko");
  const [manualAddress, setManualAddress] = useState("");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualName, setManualName] = useState("");

  const { data: searchResults, isLoading: searching } = useQuery<CoinSearchResult[]>({
    queryKey: ["/api/admin/crypto/search", searchQuery, searchSource],
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchQuery });
      if (searchSource === "solana") params.append("source", "solana");
      const response = await fetch(`/api/admin/crypto/search?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to search");
      return response.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const addCoinMutation = useMutation({
    mutationFn: async (coinData: { coinId: string; symbol: string; name: string; blockchain: string; iconUrl?: string }) => {
      return apiRequest("POST", "/api/admin/crypto/coins", coinData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/coins/prices"] });
      toast({ title: "Coin added successfully" });
      onOpenChange(false);
      setSearchQuery("");
      setSelectedCoin(null);
      setManualAddress("");
      setManualSymbol("");
      setManualName("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add coin", description: error.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (selectedCoin) {
      addCoinMutation.mutate({
        coinId: selectedCoin.id,
        symbol: selectedCoin.symbol,
        name: selectedCoin.name,
        blockchain: selectedCoin.blockchain || searchSource,
        iconUrl: selectedCoin.thumb,
      });
    }
  };

  const handleAddManual = () => {
    if (manualAddress && manualSymbol && manualName) {
      addCoinMutation.mutate({
        coinId: manualAddress,
        symbol: manualSymbol,
        name: manualName,
        blockchain: "solana",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Cryptocurrency</DialogTitle>
          <DialogDescription>
            Search for a cryptocurrency or add a Solana token by contract address
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={searchSource === "coingecko" ? "default" : "outline"}
              onClick={() => { setSearchSource("coingecko"); setSelectedCoin(null); setSearchQuery(""); }}
              className="flex-1"
              data-testid="button-source-coingecko"
            >
              CoinGecko
            </Button>
            <Button
              variant={searchSource === "solana" ? "default" : "outline"}
              onClick={() => { setSearchSource("solana"); setSelectedCoin(null); setSearchQuery(""); }}
              className="flex-1"
              data-testid="button-source-solana"
            >
              Solana / Jupiter
            </Button>
          </div>

          <div>
            <Label>Search {searchSource === "solana" ? "Solana Token" : "Coin"}</Label>
            <Input
              placeholder={searchSource === "solana" ? "BFS, JUP, SOL, or paste address..." : "Bitcoin, Ethereum, etc."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-coin"
            />
          </div>
          
          {searching && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          
          {searchResults && searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-2">
              {searchResults.map((coin) => (
                <div
                  key={coin.id}
                  className={`p-3 border rounded-lg cursor-pointer hover-elevate ${selectedCoin?.id === coin.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setSelectedCoin(coin)}
                  data-testid={`coin-result-${coin.id}`}
                >
                  <div className="flex items-center gap-2">
                    {coin.thumb && <img src={coin.thumb} alt={coin.symbol} className="w-6 h-6 rounded-full" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{coin.name}</div>
                      <div className="text-sm text-muted-foreground truncate">{coin.symbol}</div>
                    </div>
                    {searchSource === "solana" && (
                      <Badge variant="secondary" className="text-xs">Solana</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchSource === "solana" && searchResults?.length === 0 && searchQuery.length >= 2 && !searching && (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-3">Token not found? Add manually by contract address:</p>
              <div className="space-y-3">
                <div>
                  <Label>Contract Address</Label>
                  <Input
                    placeholder="2k8yZaJjf61unHriuqdmvbxe7CUhEYML5kVJDbcotKjU"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    data-testid="input-manual-address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Symbol</Label>
                    <Input
                      placeholder="BFS"
                      value={manualSymbol}
                      onChange={(e) => setManualSymbol(e.target.value)}
                      data-testid="input-manual-symbol"
                    />
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input
                      placeholder="Beast Financial Services"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      data-testid="input-manual-name"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleAddManual}
                  disabled={!manualAddress || !manualSymbol || !manualName || addCoinMutation.isPending}
                  className="w-full"
                  data-testid="button-add-manual"
                >
                  {addCoinMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Token Manually
                </Button>
              </div>
            </Card>
          )}
          
          {selectedCoin && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">Selected: {selectedCoin.name} ({selectedCoin.symbol})</p>
              {searchSource === "solana" && (
                <p className="text-xs text-muted-foreground truncate mt-1">{selectedCoin.id}</p>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedCoin || addCoinMutation.isPending}
            data-testid="button-confirm-add-coin"
          >
            {addCoinMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Coin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddAlertDialog({ 
  open, 
  onOpenChange, 
  coins,
  selectedCoinId 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  coins: CoinWithPrice[];
  selectedCoinId: string | null;
}) {
  const { toast } = useToast();
  const [coinId, setCoinId] = useState(selectedCoinId || "");
  const [alertType, setAlertType] = useState<string>("price_above");
  const [targetPrice, setTargetPrice] = useState("");
  const [percentChange, setPercentChange] = useState("");
  const [notifySms, setNotifySms] = useState(false);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const [label, setLabel] = useState("");

  const createAlertMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/crypto/alerts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/alerts"] });
      toast({ title: "Alert created" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create alert", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setCoinId("");
    setAlertType("price_above");
    setTargetPrice("");
    setPercentChange("");
    setNotifySms(false);
    setNotifyWhatsapp(true);
    setLabel("");
  };

  const handleSubmit = () => {
    const data: any = {
      coinId: coinId || selectedCoinId,
      alertType,
      notifySms,
      notifyWhatsapp,
      label: label || null,
    };

    if (alertType === "price_above" || alertType === "price_below") {
      data.targetPrice = targetPrice;
    } else {
      data.percentChange = percentChange;
    }

    createAlertMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Price Alert</DialogTitle>
          <DialogDescription>
            Get notified when price conditions are met
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>Cryptocurrency</Label>
            <Select value={coinId || selectedCoinId || ""} onValueChange={setCoinId}>
              <SelectTrigger data-testid="select-alert-coin">
                <SelectValue placeholder="Select coin" />
              </SelectTrigger>
              <SelectContent>
                {coins.map((coin) => (
                  <SelectItem key={coin.coinId} value={coin.coinId}>
                    {coin.name} ({coin.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Alert Type</Label>
            <Select value={alertType} onValueChange={setAlertType}>
              <SelectTrigger data-testid="select-alert-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_above">Price goes above</SelectItem>
                <SelectItem value="price_below">Price goes below</SelectItem>
                <SelectItem value="percent_increase">% Increase (24h)</SelectItem>
                <SelectItem value="percent_decrease">% Decrease (24h)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(alertType === "price_above" || alertType === "price_below") ? (
            <div>
              <Label>Target Price (USD)</Label>
              <Input
                type="number"
                placeholder="50000"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                data-testid="input-target-price"
              />
            </div>
          ) : (
            <div>
              <Label>Percent Change (%)</Label>
              <Input
                type="number"
                placeholder="10"
                value={percentChange}
                onChange={(e) => setPercentChange(e.target.value)}
                data-testid="input-percent-change"
              />
            </div>
          )}

          <div>
            <Label>Label (optional)</Label>
            <Input
              placeholder="My BTC alert"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              data-testid="input-alert-label"
            />
          </div>

          <div className="space-y-2">
            <Label>Notification Methods</Label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={notifySms} onCheckedChange={setNotifySms} id="notify-sms" />
                <Label htmlFor="notify-sms">SMS</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={notifyWhatsapp} onCheckedChange={setNotifyWhatsapp} id="notify-whatsapp" />
                <Label htmlFor="notify-whatsapp">WhatsApp</Label>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={createAlertMutation.isPending || !(coinId || selectedCoinId)}
            data-testid="button-confirm-create-alert"
          >
            {createAlertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertsList({ alerts, coins }: { alerts: PriceAlert[]; coins: CoinWithPrice[] }) {
  const { toast } = useToast();

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/crypto/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/alerts"] });
      toast({ title: "Alert deleted" });
    },
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/crypto/alerts/${id}`, { 
        status: status === "active" ? "disabled" : "active" 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/alerts"] });
    },
  });

  const getCoinName = (coinId: string) => {
    const coin = coins.find(c => c.coinId === coinId);
    return coin ? `${coin.name} (${coin.symbol})` : coinId;
  };

  const getAlertDescription = (alert: PriceAlert) => {
    switch (alert.alertType) {
      case "price_above":
        return `Price above $${Number(alert.targetPrice).toLocaleString()}`;
      case "price_below":
        return `Price below $${Number(alert.targetPrice).toLocaleString()}`;
      case "percent_increase":
        return `+${alert.percentChange}% in 24h`;
      case "percent_decrease":
        return `-${alert.percentChange}% in 24h`;
      default:
        return alert.alertType;
    }
  };

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Bell className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No price alerts configured</p>
          <p className="text-sm text-muted-foreground">Add coins and create alerts to get notified</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="font-medium">{getCoinName(alert.coinId)}</div>
                <div className="text-sm text-muted-foreground">{getAlertDescription(alert)}</div>
                {alert.label && <div className="text-xs text-muted-foreground">{alert.label}</div>}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant={alert.status === "active" ? "default" : alert.status === "triggered" ? "secondary" : "outline"}>
                {alert.status}
              </Badge>
              
              <div className="flex gap-1">
                {alert.notifySms && <Badge variant="outline" className="text-xs">SMS</Badge>}
                {alert.notifyWhatsapp && <Badge variant="outline" className="text-xs">WhatsApp</Badge>}
              </div>

              <Switch
                checked={alert.status === "active"}
                onCheckedChange={() => toggleAlertMutation.mutate({ id: alert.id, status: alert.status || "active" })}
                disabled={alert.status === "triggered"}
              />
              
              <Button
                size="icon"
                variant="ghost"
                onClick={() => deleteAlertMutation.mutate(alert.id)}
                data-testid={`button-delete-alert-${alert.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NewsGrid({ coins }: { coins: CoinWithPrice[] }) {
  const [selectedCoinId, setSelectedCoinId] = useState<string>(coins[0]?.coinId || "");

  const { data: news, isLoading } = useQuery<NewsArticle[]>({
    queryKey: ["/api/admin/crypto/coins", selectedCoinId, "news"],
    enabled: !!selectedCoinId,
  });

  if (coins.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Add coins to see related news</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Label>Select Coin</Label>
        <Select value={selectedCoinId} onValueChange={setSelectedCoinId}>
          <SelectTrigger className="w-48" data-testid="select-news-coin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {coins.map((coin) => (
              <SelectItem key={coin.coinId} value={coin.coinId}>
                {coin.name} ({coin.symbol})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : news && news.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {news.map((article, idx) => (
            <Card key={idx} className="hover-elevate" data-testid={`card-news-${idx}`}>
              <CardContent className="p-4">
                <a 
                  href={article.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium line-clamp-2">{article.title}</h3>
                    <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                  {article.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{article.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{article.sourceName}</span>
                    <span>•</span>
                    <span>{format(new Date(article.publishedAt), "MMM d, yyyy")}</span>
                  </div>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No news available for this coin</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SettingsDialog({ 
  open, 
  onOpenChange, 
  settings 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  settings?: CryptoNotificationSettings;
}) {
  const { toast } = useToast();
  const [recipientPhone, setRecipientPhone] = useState(settings?.recipientPhoneNumber || "");
  const [recipientWhatsapp, setRecipientWhatsapp] = useState(settings?.recipientWhatsappNumber || "");
  const [enableSms, setEnableSms] = useState(settings?.enableSms ?? true);
  const [enableWhatsapp, setEnableWhatsapp] = useState(settings?.enableWhatsapp ?? true);
  const [quietStart, setQuietStart] = useState(settings?.quietHoursStart || "");
  const [quietEnd, setQuietEnd] = useState(settings?.quietHoursEnd || "");

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", "/api/admin/crypto/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto/settings"] });
      toast({ title: "Settings updated" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      recipientPhoneNumber: recipientPhone || null,
      recipientWhatsappNumber: recipientWhatsapp || null,
      enableSms,
      enableWhatsapp,
      quietHoursStart: quietStart || null,
      quietHoursEnd: quietEnd || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notification Settings</DialogTitle>
          <DialogDescription>
            Configure how you receive price alerts
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>SMS Phone Number</Label>
            <Input
              placeholder="+1234567890"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              data-testid="input-sms-phone"
            />
            <p className="text-xs text-muted-foreground mt-1">Include country code</p>
          </div>

          <div>
            <Label>WhatsApp Number</Label>
            <Input
              placeholder="+1234567890"
              value={recipientWhatsapp}
              onChange={(e) => setRecipientWhatsapp(e.target.value)}
              data-testid="input-whatsapp-phone"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={enableSms} onCheckedChange={setEnableSms} id="enable-sms" />
              <Label htmlFor="enable-sms">Enable SMS</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={enableWhatsapp} onCheckedChange={setEnableWhatsapp} id="enable-whatsapp" />
              <Label htmlFor="enable-whatsapp">Enable WhatsApp</Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quiet Hours Start</Label>
              <Input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                data-testid="input-quiet-start"
              />
            </div>
            <div>
              <Label>Quiet Hours End</Label>
              <Input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                data-testid="input-quiet-end"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">No notifications will be sent during quiet hours</p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            data-testid="button-save-settings"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
