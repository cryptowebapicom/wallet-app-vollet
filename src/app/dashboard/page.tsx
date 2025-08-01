"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Plus,
  QrCode,
  Settings,
  Shield,
  Wallet,
  Zap,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  LogOut,
  Send,
  WalletIcon,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { CryptoWebApi } from "@/lib/cryptowebapi";
import { CryptoWebApiClient } from 'cryptowebapi-connector-js';
import { useAccountStore } from "@/store/account";
import { RouteGuard } from "@/components/route-guard";
import { Wallet as WalletType, getAllWallets, saveWallet } from "@/lib/accountDb";
import { encryptPrivateKey } from "@/lib/crypto";

// Initialize API clients
const apiClient = new CryptoWebApi(process.env.NEXT_PUBLIC_CRYPTOWEBAPI_KEY || "");
const cryptoWebApiClient = new CryptoWebApiClient({
  apiKey: process.env.NEXT_PUBLIC_CRYPTOWEBAPI_KEY || "",
});

// Types
interface Token {
  symbol: string;
  name: string;
  balance: number;
  balanceUSD: number;
  price: number;
  change24h: number;
}

interface Transaction {
  id: string;
  type: "send" | "receive";
  amount: number;
  symbol: string;
  to?: string;
  from?: string;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
  hash: string;
}

interface Wallet {
  id: string;
  name: string;
  address: string;
  network: "ethereum" | "bnb";
  balance: number;
  balanceUSD: number;
  change24h: number;
  changePercent24h: number;
  tokens: Token[];
  transactions: Transaction[];
}


export default function DashboardPage() {
  const router = useRouter();
  const { lock, db } = useAccountStore();

  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [newlyCreatedWallet, setNewlyCreatedWallet] = useState<{
    address: string;
    privateKey: string;
    mnemonic?: string;
    network: "ethereum" | "bnb";
    name: string;
  } | null>(null);

  // Load wallets from IndexedDB on component mount
  useEffect(() => {
    const loadWallets = async () => {
      if (db) {
        try {
          const loadedWallets = await getAllWallets(db);
          setWallets(loadedWallets);
        } catch (error) {
          console.error("Error loading wallets:", error);
        }
      }
    };

    loadWallets();
  }, [db]);

  // Form state for adding wallets
  const [newWalletForm, setNewWalletForm] = useState({
    name: "",
    address: "",
    network: "ethereum" as "ethereum" | "bnb",
    balance: "",
    balanceUSD: "",
  });

  // Form state for creating wallets
  const [createWalletForm, setCreateWalletForm] = useState({
    name: "",
    network: "ethereum" as "ethereum" | "bnb",
    passphrase: "",
  });

  // Loading state for wallet creation
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);

  // Calculations
  const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balanceUSD, 0);
  const totalChange = wallets.reduce((sum, wallet) => sum + wallet.change24h, 0);
  const totalChangePercent = totalBalance > 0 ? (totalChange / (totalBalance - totalChange)) * 100 : 0;

  // Utility functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Format address for display
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Format time for display
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Event handlers
  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newWalletForm.name || !newWalletForm.address || !newWalletForm.balance || !newWalletForm.balanceUSD || !db) {
      return;
    }

    const balanceNum = Number.parseFloat(newWalletForm.balance);
    const balanceUSDNum = Number.parseFloat(newWalletForm.balanceUSD);

    const newWallet: WalletType = {
      id: Date.now().toString(),
      name: newWalletForm.name,
      address: newWalletForm.address,
      network: newWalletForm.network,
      balance: balanceNum,
      balanceUSD: balanceUSDNum,
      change24h: 0,
      changePercent24h: 0,
      tokens: [],
      transactions: [],
    };

    try {
      // Save to IndexedDB
      await saveWallet(db, newWallet);

      // Update state
      setWallets([...wallets, newWallet]);
      setShowAddModal(false);
      setNewWalletForm({
        name: "",
        address: "",
        network: "ethereum",
        balance: "",
        balanceUSD: "",
      });
    } catch (error) {
      console.error("Error saving wallet:", error);
    }
  };

  const handleWalletSelect = (wallet: WalletType) => {
    setSelectedWallet(wallet);
  };

  const handleBackToList = () => {
    setSelectedWallet(null);
  };

  // Handle wallet creation
  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createWalletForm.name || !createWalletForm.network || !createWalletForm.passphrase || !db) {
      return;
    }

    setIsCreatingWallet(true);

    try {
      // Create wallet using CryptoWebApiClient
      const newWallet = await cryptoWebApiClient.createWallet({ 
        network: createWalletForm.network 
      });

      // Check if privateKey exists in the response
      if (!newWallet.key) {
        console.log(newWallet);
        throw new Error('Private key is missing in the wallet creation response');
      }

      // Encrypt private key and mnemonic with passphrase
      const encryptedPrivateKey = await encryptPrivateKey(newWallet.key, createWalletForm.passphrase);

      // Check if mnemonic exists in the response
      let encryptedMnemonic = undefined;
      if (newWallet.mnemonic && true) {
        encryptedMnemonic = await encryptPrivateKey(newWallet.mnemonic, createWalletForm.passphrase);
      }

      // Create wallet object
      const walletData: WalletType = {
        id: Date.now().toString(),
        name: createWalletForm.name,
        address: newWallet.address,
        network: createWalletForm.network,
        balance: 0,
        balanceUSD: 0,
        change24h: 0,
        changePercent24h: 0,
        tokens: [],
        transactions: [],
        encryptedPrivateKey,
        encryptedMnemonic,
      };

      // Save to IndexedDB
      await saveWallet(db, walletData);

      // Update state
      setWallets([...wallets, walletData]);

      // Store the newly created wallet data for the success screen
      setNewlyCreatedWallet({
        address: newWallet.address,
        privateKey: newWallet.key,
        mnemonic: newWallet.mnemonic,
        network: createWalletForm.network,
        name: createWalletForm.name
      });

      // Show success modal instead of closing create modal
      setShowCreateModal(false);
      setShowSuccessModal(true);

      // Reset form
      setCreateWalletForm({
        name: "",
        network: "ethereum",
        passphrase: "",
      });
    } catch (error) {
      console.error("Error creating wallet:", error);
      // Show error message to the user
      alert(`Error creating wallet2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingWallet(false);
    }
  };

  // Render wallet list view or wallet detail view
  return (
    <RouteGuard>
      <div className="min-h-screen text-gray-900 bg-white">
        {selectedWallet ? (
          // Wallet Detail View
          <>
            {/* Header */}
            <div className="flex items-center gap-4 p-6 border-b border-gray-200 bg-white">
              <Button variant="ghost" size="icon" onClick={handleBackToList} className="text-gray-600 hover:bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{selectedWallet.name}</h1>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{formatAddress(selectedWallet.address)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-500 hover:text-gray-700"
                    onClick={() => copyToClipboard(selectedWallet.address)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`ml-auto ${
                  selectedWallet.network === "ethereum" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                }`}
              >
                {selectedWallet.network === "ethereum" ? "Ethereum" : "BNB Chain"}
              </Badge>
            </div>

            {/* Balance Section */}
            <div className="p-6 text-center bg-white">
              <div className="text-4xl font-bold mb-2 text-gray-900">{formatCurrency(selectedWallet.balanceUSD)}</div>
              <div
                className={`flex items-center justify-center gap-2 text-lg ${
                  selectedWallet.change24h >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {selectedWallet.change24h >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                <span>
                  {selectedWallet.change24h >= 0 ? "+" : ""}
                  {formatCurrency(selectedWallet.change24h)}
                </span>
                <span>
                  {selectedWallet.change24h >= 0 ? "+" : ""}
                  {selectedWallet.changePercent24h.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 mb-8">
              <div className="flex gap-3 justify-center">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                  onClick={() => {}}
                >
                  Receive
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                  onClick={() => {}}
                >
                  Buy
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                  onClick={() => router.push("/send")}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6">
              <Tabs defaultValue="tokens" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-gray-100">
                  <TabsTrigger value="tokens" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    Tokens
                  </TabsTrigger>
                  <TabsTrigger
                    value="transactions"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    Transactions
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tokens" className="space-y-4 mt-6">
                  {selectedWallet.tokens.map((token, index) => (
                    <Card key={index} className="bg-white border-gray-200 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-white">{token.symbol}</span>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{token.name}</div>
                              <div className="text-sm text-gray-500">
                                {token.balance.toFixed(4)} {token.symbol}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900">{formatCurrency(token.balanceUSD)}</div>
                            <div className={`text-sm ${token.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {token.change24h >= 0 ? "+" : ""}
                              {token.change24h.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4 mt-6">
                  {selectedWallet.transactions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No transactions found</div>
                  ) : (
                    selectedWallet.transactions.map((tx) => (
                      <Card key={tx.id} className="bg-white border-gray-200 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  tx.type === "send" ? "bg-red-100" : "bg-green-100"
                                }`}
                              >
                                {tx.type === "send" ? (
                                  <ArrowUpRight className="w-5 h-5 text-red-600" />
                                ) : (
                                  <ArrowDownLeft className="w-5 h-5 text-green-600" />
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900 capitalize">{tx.type}</div>
                                <div className="text-sm text-gray-500">
                                  {tx.type === "send" ? "To" : "From"}: {formatAddress(tx.to || tx.from || "")}
                                </div>
                                <div className="text-xs text-gray-400">{formatTime(tx.timestamp)}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-semibold ${tx.type === "send" ? "text-red-600" : "text-green-600"}`}>
                                {tx.type === "send" ? "-" : "+"}
                                {tx.amount} {tx.symbol}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Badge variant={tx.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                                  {tx.status}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 text-gray-500 hover:text-gray-700"
                                  onClick={() => {}}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          // Wallet List View
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <WalletIcon className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-gray-900">BluePay Wallet</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setBalanceVisible(!balanceVisible)}
                  className="text-gray-600 hover:bg-gray-100"
                >
                  {balanceVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-600 hover:bg-gray-100"
                  onClick={() => router.push("/settings")}
                >
                  <Settings className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-600 hover:bg-gray-100"
                  onClick={() => {
                    lock();
                    router.push("/login-or-create");
                  }}
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Total Portfolio Value */}
            <div className="p-6 text-center bg-white">
              <div className="text-5xl font-bold mb-2 text-gray-900">
                {balanceVisible ? formatCurrency(totalBalance) : "••••••••"}
              </div>
              <div
                className={`flex items-center justify-center gap-2 text-lg ${
                  totalChange >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {totalChange >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {balanceVisible ? (
                  <>
                    <span>
                      {totalChange >= 0 ? "+" : ""}
                      {formatCurrency(totalChange)}
                    </span>
                    <span>
                      {totalChange >= 0 ? "+" : ""}
                      {totalChangePercent.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span>••••••••</span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 mb-8">
              <div className="flex gap-3 justify-center">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                  onClick={() => {}}
                >
                  Receive
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                  onClick={() => {}}
                >
                  Buy
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                  onClick={() => router.push("/send")}
                >
                  Send
                </Button>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6 py-3 min-w-[80px]"
                >
                  Create
                </Button>
              </div>
            </div>

            {/* Wallets List */}
            <div className="px-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Your Wallets</h2>
              </div>

              {wallets.map((wallet) => (
                <Card
                  key={wallet.id}
                  className="bg-white border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
                  onClick={() => handleWalletSelect(wallet)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-lg font-bold text-white">{wallet.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{wallet.name}</div>
                          <div className="text-sm text-gray-500">{formatAddress(wallet.address)}</div>
                          <Badge
                            variant="secondary"
                            className={`mt-1 text-xs ${
                              wallet.network === "ethereum" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                            }`}
                          >
                            {wallet.network === "ethereum" ? "Ethereum" : "BNB Chain"}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">
                          {balanceVisible ? formatCurrency(wallet.balanceUSD) : "••••••••"}
                        </div>
                        <div
                          className={`text-sm flex items-center gap-1 ${
                            wallet.change24h >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {wallet.change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {balanceVisible ? (
                            <span>
                              {wallet.change24h >= 0 ? "+" : ""}
                              {wallet.changePercent24h.toFixed(2)}%
                            </span>
                          ) : (
                            <span>••••</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Add Wallet Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="bg-white border-gray-200 text-gray-900">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Add New Wallet</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddWallet} className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-gray-700">
                  Wallet Name
                </Label>
                <Input
                  id="name"
                  value={newWalletForm.name}
                  onChange={(e) => setNewWalletForm({ ...newWalletForm, name: e.target.value })}
                  placeholder="My Wallet"
                  className="bg-white border-gray-300 text-gray-900"
                  required
                />
              </div>

              <div>
                <Label htmlFor="network" className="text-gray-700">
                  Network
                </Label>
                <Select
                  value={newWalletForm.network}
                  onValueChange={(value: "ethereum" | "bnb") => setNewWalletForm({ ...newWalletForm, network: value })}
                >
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="ethereum">Ethereum</SelectItem>
                    <SelectItem value="bnb">BNB Chain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="address" className="text-gray-700">
                  Wallet Address
                </Label>
                <Input
                  id="address"
                  value={newWalletForm.address}
                  onChange={(e) => setNewWalletForm({ ...newWalletForm, address: e.target.value })}
                  placeholder={
                    newWalletForm.network === "ethereum" ? "0x..." : "bnb..."
                  }
                  className="bg-white border-gray-300 text-gray-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="balance" className="text-gray-700">
                    Balance
                  </Label>
                  <Input
                    id="balance"
                    type="number"
                    step="0.0001"
                    value={newWalletForm.balance}
                    onChange={(e) => setNewWalletForm({ ...newWalletForm, balance: e.target.value })}
                    placeholder="0.0"
                    className="bg-white border-gray-300 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="balanceUSD" className="text-gray-700">
                    Balance (USD)
                  </Label>
                  <Input
                    id="balanceUSD"
                    type="number"
                    step="0.01"
                    value={newWalletForm.balanceUSD}
                    onChange={(e) => setNewWalletForm({ ...newWalletForm, balanceUSD: e.target.value })}
                    placeholder="0.00"
                    className="bg-white border-gray-300 text-gray-900"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  Add Wallet
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Wallet Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="bg-white border-gray-200 text-gray-900">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Create New Wallet</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateWallet} className="space-y-4">
              <div>
                <Label htmlFor="createName" className="text-gray-700">
                  Wallet Name
                </Label>
                <Input
                  id="createName"
                  value={createWalletForm.name}
                  onChange={(e) => setCreateWalletForm({ ...createWalletForm, name: e.target.value })}
                  placeholder="My Wallet"
                  className="bg-white border-gray-300 text-gray-900"
                  required
                />
              </div>

              <div>
                <Label htmlFor="createNetwork" className="text-gray-700">
                  Network
                </Label>
                <Select
                  value={createWalletForm.network}
                  onValueChange={(value: "ethereum" | "bnb") => setCreateWalletForm({ ...createWalletForm, network: value })}
                >
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="ethereum">Ethereum</SelectItem>
                    <SelectItem value="bnb">BNB Chain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="createPassphrase" className="text-gray-700">
                  Passphrase
                </Label>
                <Input
                  id="createPassphrase"
                  type="password"
                  value={createWalletForm.passphrase}
                  onChange={(e) => setCreateWalletForm({ ...createWalletForm, passphrase: e.target.value })}
                  placeholder="Enter a secure passphrase"
                  className="bg-white border-gray-300 text-gray-900"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This passphrase will be used to encrypt your wallet's private key and mnemonic.
                  Make sure to remember it as it cannot be recovered.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={isCreatingWallet}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={isCreatingWallet}
                >
                  {isCreatingWallet ? "Creating..." : "Create Wallet"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Wallet Creation Success Modal */}
        <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
          <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-center">Wallet Created Successfully!</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Your wallet has been created and saved. Please save the following information in a secure location.
                  <strong className="block mt-2 text-red-600">
                    Warning: Never share your private key or mnemonic phrase with anyone!
                  </strong>
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-700 font-semibold">Wallet Name</Label>
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-900">{newlyCreatedWallet?.name}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700 font-semibold">Network</Label>
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-900">
                      {newlyCreatedWallet?.network === "ethereum" ? "Ethereum" : "BNB Chain"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700 font-semibold">Wallet Address</Label>
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-900 text-sm break-all">{newlyCreatedWallet?.address}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-500 hover:text-gray-700"
                      onClick={() => copyToClipboard(newlyCreatedWallet?.address || "")}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700 font-semibold">Private Key</Label>
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <span className="text-gray-900 text-sm break-all">{newlyCreatedWallet?.privateKey}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-500 hover:text-gray-700"
                      onClick={() => copyToClipboard(newlyCreatedWallet?.privateKey || "")}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>

                {newlyCreatedWallet?.mnemonic && (
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-semibold">Mnemonic Phrase (Seed Phrase)</Label>
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                      <span className="text-gray-900 text-sm break-all">{newlyCreatedWallet.mnemonic}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={() => copyToClipboard(newlyCreatedWallet.mnemonic || "")}
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-sm text-yellow-800">
                <p className="font-semibold mb-2">Important Security Information:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Write down your mnemonic phrase and keep it in a secure location.</li>
                  <li>Store your private key securely - it provides full access to your wallet.</li>
                  <li>Never share these details with anyone or enter them on untrusted websites.</li>
                  <li>Make multiple backups of this information.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <Button 
                onClick={() => {
                  setShowSuccessModal(false);
                  setNewlyCreatedWallet(null);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-8"
              >
                I've Saved My Wallet Information
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RouteGuard>
  );
}
