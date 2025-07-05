// app/jobcards/page.tsx
"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, Calendar as CalendarIcon, FileCheck, History, AlertTriangle, Settings } from "lucide-react"
import { format } from "date-fns"
import { useGoogleSheet, parseGvizDate } from "@/lib/g-sheets"

// Shadcn UI components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

// Type Definitions
interface Order {
  key: number;
  _rowIndex: number;
  deliveryOrderNo: string;
  firmName: string;
  partyName: string;
  productName: string;
  orderQuantity: number;
  expectedDeliveryDate: string;
  priority: string;
  note: string;
}

interface JobCard {
    key: number;
    _rowIndex: number;
    jobCardNo: string;
    firmName: string;
    supervisorName: string;
    deliveryOrderNo: string;
    partyName: string;
    productName: string;
    orderQuantity: number;
    dateOfProduction: string;
    shift: string;
    notes: string;
    createdAt: string;
    totalMade: number; 
    expectedDeliveryDate: string;
    priority: string;
}

interface GvizRow {
  c: ({ v: any; f?: string; } | null)[]
}

// Constants
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec";
const PRODUCTION_SHEET = "Production";
const JOBCARDS_SHEET = "JobCards";
const MASTER_SHEET = "Master";

// Column definitions
const PENDING_ORDERS_COLUMNS_META = [
  { header: "Action", dataKey: "actionColumn", toggleable: false, alwaysVisible: true },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true, alwaysVisible: true },
  { header: "Party Name", dataKey: "partyName", toggleable: true },
  { header: "Product Name", dataKey: "productName", toggleable: true },
  { header: "Order Quantity", dataKey: "orderQuantity", toggleable: true },
  { header: "Expected Delivery Date", dataKey: "expectedDeliveryDate", toggleable: true },
  { header: "Priority", dataKey: "priority", toggleable: true },
  { header: "Note", dataKey: "note", toggleable: true },
];

const HISTORY_COLUMNS_META = [
  { header: "Job Card No.", dataKey: "jobCardNo", toggleable: true, alwaysVisible: true },
  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },
  { header: "Quantity", dataKey: "totalMade", toggleable: true },
  { header: "Expected Delivery Date", dataKey: "expectedDeliveryDate", toggleable: true },
  { header: "Priority", dataKey: "priority", toggleable: true },
  { header: "Date of Production", dataKey: "dateOfProduction", toggleable: true },
  { header: "Supervisor Name", dataKey: "supervisorName", toggleable: true },
  { header: "Shift", dataKey: "shift", toggleable: true },
  { header: "Notes", dataKey: "notes", toggleable: true },
];


export default function JobCardsPage() {
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [historyJobCards, setHistoryJobCards] = useState<JobCard[]>([]);
  const [supervisors, setSupervisors] = useState<string[]>([]);
  const [shifts, setShifts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const [visiblePendingColumns, setVisiblePendingColumns] = useState<Record<string, boolean>>({});
  const [visibleHistoryColumns, setVisibleHistoryColumns] = useState<Record<string, boolean>>({});
  
  const [formData, setFormData] = useState({
    supervisorName: "",
    dateOfProduction: new Date(),
    shift: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({});

  const { fetchData: fetchProductionData } = useGoogleSheet(PRODUCTION_SHEET);
  const { fetchData: fetchJobCardsData } = useGoogleSheet(JOBCARDS_SHEET);
  const { fetchData: fetchMasterData } = useGoogleSheet(MASTER_SHEET);

  useEffect(() => {
    const initializeVisibility = (columnsMeta: any[]) => {
      const visibility: Record<string, boolean> = {};
      columnsMeta.forEach((col) => {
        visibility[col.dataKey] = col.alwaysVisible || col.toggleable;
      });
      return visibility;
    };
    setVisiblePendingColumns(initializeVisibility(PENDING_ORDERS_COLUMNS_META));
    setVisibleHistoryColumns(initializeVisibility(HISTORY_COLUMNS_META));
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productionTable, jobCardsTable, masterTable] = await Promise.all([
        fetchProductionData(),
        fetchJobCardsData(),
        fetchMasterData(),
      ]);

      const processGvizTable = (table: any, rowIndexOffset = 2) => {
        if (!table || !table.rows || table.rows.length < 1) return [];
        // --- THIS LINE REMOVES THE HEADER ROW FROM THE GOOGLE SHEET ---
        return table.rows.slice(1).map((row: GvizRow, originalIndex: number) => {
            if (!row.c || !row.c.some((cell) => cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== "")) {
              return null;
            }
            const rowData: any = { _rowIndex: originalIndex + rowIndexOffset };
            row.c.forEach((cell, cellIndex) => {
              const colId = table.cols[cellIndex].id || `col${cellIndex}`;
              const value = cell && cell.v !== undefined && cell.v !== null ? cell.v : "";
              rowData[colId] = value;
            });
            return rowData;
          }).filter((row: any) => row !== null);
      };

      const allProductionData = processGvizTable(productionTable);
      const allJobCardsData = processGvizTable(jobCardsTable);
      const allMasterData = processGvizTable(masterTable);

      const filteredRows = allProductionData.filter((row) => {
        const hasColX = row.X !== null && String(row.X).trim() !== "";
        const emptyColY = !row.Y || String(row.Y).trim() === "";
        return hasColX && emptyColY;
      });

      const processedOrders: Order[] = filteredRows.map((row) => ({
        key: row._rowIndex,
        _rowIndex: row._rowIndex,
        deliveryOrderNo: String(row.B || "").trim(),
        firmName: String(row.C || "").trim(),
        partyName: String(row.D || "").trim(),
        productName: String(row.E || "").trim(),
        orderQuantity: Number(row.F || 0),
        expectedDeliveryDate: row.K ? format(parseGvizDate(row.K), "dd/MM/yyyy") : "",
        priority: String(row.L || ""),
        note: String(row.M || ""),
      }));
      setPendingOrders(processedOrders);

      const processedHistory: JobCard[] = allJobCardsData
        .map((row: any) => {
          const prodDate = parseGvizDate(row.I);
          const createdDate = parseGvizDate(row.A);
          const expectedDelDate = parseGvizDate(row.M);
          return {
            key: row._rowIndex,
            _rowIndex: row._rowIndex,
            jobCardNo: String(row.B || ""),
            firmName: String(row.C || ""),
            supervisorName: String(row.D || ""),
            deliveryOrderNo: String(row.E || ""),
            partyName: String(row.F || ""),
            productName: String(row.G || ""),
            orderQuantity: Number(row.H || 0),
            dateOfProduction: prodDate ? format(prodDate, "dd/MM/yyyy") : "",
            shift: String(row.J || ""),
            notes: String(row.O || ""),
            createdAt: createdDate ? format(createdDate, "dd/MM/yyyy HH:mm:ss") : "",
            totalMade: Number(row.K || 0), 
            expectedDeliveryDate: expectedDelDate ? format(expectedDelDate, "dd/MM/yyyy") : "",
            priority: String(row.L || ""),
          };
        })
        // --- CHANGE: This improved filter ensures only valid Job Cards are shown ---
        .filter((card: JobCard) => {
            if (!card.jobCardNo || !card.jobCardNo.startsWith("JC-")) return false;
            const numberPart = card.jobCardNo.split('-')[1];
            return numberPart && !isNaN(parseInt(numberPart, 10));
        })
        .sort((a: JobCard, b: JobCard) => {
          const numA = Number.parseInt(a.jobCardNo.split("-")[1] || "0", 10);
          const numB = Number.parseInt(b.jobCardNo.split("-")[1] || "0", 10);
          return numB - numA;
        });
      setHistoryJobCards(processedHistory);

      const supervisorsList: string[] = [...new Set(allMasterData.map((row: any) => String(row.B || "")).filter(Boolean))];
      const shiftsList: string[] = [...new Set(allMasterData.map((row: any) => String(row.C || "")).filter(Boolean))];
      setSupervisors(supervisorsList);
      setShifts(shiftsList);

    } catch (err: any) {
      setError(`Failed to load data. Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [fetchProductionData, fetchJobCardsData, fetchMasterData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleOpenDialog = (order: Order) => {
    setSelectedOrder(order);
    setFormData({
      supervisorName: "",
      dateOfProduction: new Date(),
      shift: "",
      notes: "",
    });
    setFormErrors({});
    setIsDialogOpen(true);
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.supervisorName) newErrors.supervisorName = "Supervisor name is required";
    if (!formData.dateOfProduction) newErrors.dateOfProduction = "Production date is required";
    if (!formData.shift) newErrors.shift = "Shift is required";
    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (!selectedOrder || !selectedOrder.deliveryOrderNo) {
      alert("Error: Missing selected order details. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm:ss");
      const existingJobCard = historyJobCards.find((card) => card.deliveryOrderNo === selectedOrder.deliveryOrderNo);
      const isUpdate = !!existingJobCard;

      let nextJobCardNumber = 1;
      if (historyJobCards.length > 0) {
        const jobCardNumbers = historyJobCards.map(card => {
          const numPart = card.jobCardNo.split('-')[1];
          return numPart ? parseInt(numPart, 10) : 0;
        }).filter(num => !isNaN(num));

        if (jobCardNumbers.length > 0) {
          nextJobCardNumber = Math.max(...jobCardNumbers) + 1;
        }
      }

      const jobCardNumber = isUpdate
        ? existingJobCard.jobCardNo
        : `JC-${String(nextJobCardNumber).padStart(3, "0")}`;

      const jobCardRowData = [
        timestamp,
        jobCardNumber,
        selectedOrder.firmName,
        formData.supervisorName,
        selectedOrder.deliveryOrderNo,
        selectedOrder.partyName,
        selectedOrder.productName,
        selectedOrder.orderQuantity,
        format(formData.dateOfProduction, "dd/MM/yyyy"),
        formData.shift,
        formData.notes || "",
      ];

      const body = new URLSearchParams({
        sheetName: JOBCARDS_SHEET,
        action: isUpdate ? "update" : "insert",
        rowData: JSON.stringify(jobCardRowData),
      });

      if (isUpdate && existingJobCard) {
        body.append("rowIndex", existingJobCard._rowIndex.toString());
      }

      const res = await fetch(WEB_APP_URL, { method: "POST", body });
      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || `Failed to ${isUpdate ? "update" : "create"} Job Card.`);
      }

      alert(`Job Card ${jobCardNumber} ${isUpdate ? "updated" : "created"} successfully!`);
      setIsDialogOpen(false);
      await loadAllData();
    } catch (err: any) {
      setError(err.message);
      alert(`Critical Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleColumn = (tab: string, dataKey: string, checked: boolean) => {
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns;
    setter((prev) => ({ ...prev, [dataKey]: checked }));
  };

  const handleSelectAllColumns = (tab: string, columnsMeta: any[], checked: boolean) => {
    const newVisibility: Record<string, boolean> = {};
    columnsMeta.forEach((col) => {
      if (col.toggleable && !col.alwaysVisible) newVisibility[col.dataKey] = checked;
    });
    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns;
    setter((prev) => ({ ...prev, ...newVisibility }));
  };

  const visiblePendingOrdersColumns = useMemo(
    () => PENDING_ORDERS_COLUMNS_META.filter((col) => visiblePendingColumns[col.dataKey]),
    [visiblePendingColumns],
  );

  const visibleHistoryJobCardsColumns = useMemo(
    () => HISTORY_COLUMNS_META.filter((col) => visibleHistoryColumns[col.dataKey]),
    [visibleHistoryColumns],
  );

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-purple-600" /> <p className="ml-4 text-lg">Loading Data...</p></div>;
  if (error) return <div className="p-8 text-center text-red-600 bg-red-50 rounded-md"><AlertTriangle className="h-12 w-12 mx-auto mb-4" /><p className="text-lg font-semibold">Error Loading Data</p><p className="text-sm">{error}</p><Button onClick={loadAllData} className="mt-4">Retry</Button></div>;

  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen">
      <Card className="shadow-md border-none">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-gray-800"><FileCheck className="h-6 w-6 text-purple-600" />Job Card Management</CardTitle>
          <CardDescription className="text-gray-700">Create and manage job cards for production orders</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 lg:p-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full sm:w-[450px] grid-cols-2 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" /> Pending Orders{" "}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">{pendingOrders.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" /> Job Card History{" "}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">{historyJobCards.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="flex-1 flex flex-col mt-0">
              <Card className="shadow-sm border border-border flex-1 flex flex-col">
                <CardHeader className="py-3 px-4 bg-muted/30">
                   <div className="flex justify-between items-center bg-purple-50 rounded-md p-2">
                      <CardTitle className="flex items-center text-md font-semibold text-foreground"><FileCheck className="h-5 w-5 text-primary mr-2" />Pending for Production ({pendingOrders.length})</CardTitle>
                    <Popover>
                      <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs bg-transparent"><Settings className="mr-1.5 h-3.5 w-3.5" />View Columns</Button></PopoverTrigger>
                      <PopoverContent className="w-[220px] p-3"><div className="grid gap-2">
                          <p className="text-sm font-medium">Toggle Columns</p>
                          <div className="flex items-center justify-between mt-1 mb-2">
                            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleSelectAllColumns("pending", PENDING_ORDERS_COLUMNS_META, true)}>Select All</Button>
                            <span className="text-gray-300 mx-1">|</span>
                            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleSelectAllColumns("pending", PENDING_ORDERS_COLUMNS_META, false)}>Deselect All</Button>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {PENDING_ORDERS_COLUMNS_META.filter((col) => col.toggleable).map((col) => (
                              <div key={`toggle-pending-${col.dataKey}`} className="flex items-center space-x-2">
                                <Checkbox id={`toggle-pending-${col.dataKey}`} checked={!!visiblePendingColumns[col.dataKey]} onCheckedChange={(checked) => handleToggleColumn("pending", col.dataKey, Boolean(checked))} disabled={col.alwaysVisible} />
                                <Label htmlFor={`toggle-pending-${col.dataKey}`} className="text-xs font-normal cursor-pointer">{col.header}</Label>
                              </div>))}
                          </div></div></PopoverContent>
                    </Popover>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 flex flex-col">
                  {pendingOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center flex-1">
                      <FileCheck className="h-12 w-12 text-purple-500 mb-3" /><p className="font-medium text-foreground">No Pending Orders Found</p>
                    </div>
                  ) : (
                    <div className="overflow-auto rounded-b-lg" style={{ maxHeight: '60vh' }}>
                      <Table><TableHeader className="bg-muted/50 sticky top-0 z-10"><TableRow>{visiblePendingOrdersColumns.map((col) => (<TableHead key={col.dataKey} className="whitespace-nowrap text-xs">{col.header}</TableHead>))}</TableRow></TableHeader>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.key} className="hover:bg-purple-50/50">
                              {visiblePendingOrdersColumns.map((column) => (
                                <TableCell key={column.dataKey} className={`whitespace-nowrap text-xs ${column.dataKey === "deliveryOrderNo" ? "font-medium text-primary" : "text-gray-700"}`}>
                                  {column.dataKey === "actionColumn" ? (<Button onClick={() => handleOpenDialog(order)} size="sm" disabled={isSubmitting} className="text-xs h-7 px-2 py-1 bg-purple-600 text-white hover:bg-purple-700">Create Job Card</Button>) : (order[column.dataKey as keyof Order] || "-")}
                                </TableCell>))}
                            </TableRow>))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="flex-1 flex flex-col mt-0">
              <Card className="shadow-sm border border-border flex-1 flex flex-col">
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <div className="flex justify-between items-center bg-purple-50 rounded-md p-2">
                    <CardTitle className="flex items-center text-md font-semibold text-foreground"><History className="h-5 w-5 text-primary mr-2" />Job Card History ({historyJobCards.length})</CardTitle>
                    <Popover>
                      <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs bg-transparent"><Settings className="mr-1.5 h-3.5 w-3.5" />View Columns</Button></PopoverTrigger>
                      <PopoverContent className="w-[220px] p-3"><div className="grid gap-2">
                          <p className="text-sm font-medium">Toggle Columns</p>
                          <div className="flex items-center justify-between mt-1 mb-2">
                            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleSelectAllColumns("history", HISTORY_COLUMNS_META, true)}>Select All</Button>
                            <span className="text-gray-300 mx-1">|</span>
                            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleSelectAllColumns("history", HISTORY_COLUMNS_META, false)}>Deselect All</Button>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {HISTORY_COLUMNS_META.filter((col) => col.toggleable).map((col) => (
                              <div key={`toggle-history-${col.dataKey}`} className="flex items-center space-x-2">
                                <Checkbox id={`toggle-history-${col.dataKey}`} checked={!!visibleHistoryColumns[col.dataKey]} onCheckedChange={(checked) => handleToggleColumn("history", col.dataKey, Boolean(checked))} disabled={col.alwaysVisible}/>
                                <Label htmlFor={`toggle-history-${col.dataKey}`} className="text-xs font-normal cursor-pointer">{col.header}</Label>
                              </div>))}
                          </div></div></PopoverContent>
                    </Popover>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 flex flex-col">
                  {historyJobCards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
                      <History className="h-12 w-12 text-purple-500 mb-3" /><p className="font-medium text-foreground">No Job Cards Found</p>
                    </div>
                  ) : (
                    <div className="overflow-auto rounded-b-lg" style={{ maxHeight: '60vh' }}>
                      <Table><TableHeader className="bg-muted/50 sticky top-0 z-10"><TableRow>{visibleHistoryJobCardsColumns.map((col) => (<TableHead key={col.dataKey} className="whitespace-nowrap text-xs">{col.header}</TableHead>))}</TableRow></TableHeader>
                        <TableBody>
                          {historyJobCards.map((card) => (
                            <TableRow key={card.key} className="hover:bg-purple-50/50">
                              {visibleHistoryJobCardsColumns.map((column) => (
                                <TableCell key={column.dataKey} className={`whitespace-nowrap text-xs ${column.dataKey === "jobCardNo" ? "font-medium text-primary" : "text-gray-700"}`}>{card[column.dataKey as keyof JobCard] || "-"}</TableCell>))}
                            </TableRow>))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Job Card for DO: {selectedOrder?.deliveryOrderNo}</DialogTitle>
            <DialogDescription>Fill out the production details below. Fields with * are required.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><Label>Firm Name</Label><Input value={selectedOrder?.firmName || ""} readOnly className="bg-muted" /></div>
                <div><Label>Party Name</Label><Input value={selectedOrder?.partyName || ""} readOnly className="bg-muted" /></div>
                <div><Label>Product Name</Label><Input value={selectedOrder?.productName || ""} readOnly className="bg-muted" /></div>
                <div><Label>Order Quantity</Label><Input value={selectedOrder?.orderQuantity} readOnly type="number" className="bg-muted" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div>
                  <Label htmlFor="supervisor">Supervisor Name *</Label>
                  <Select value={formData.supervisorName} onValueChange={(v) => handleFormChange("supervisorName", v)}>
                    <SelectTrigger id="supervisor" className={formErrors.supervisorName ? "border-red-500" : ""}><SelectValue placeholder="Select Supervisor..." /></SelectTrigger>
                    <SelectContent>{supervisors.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                  </Select>
                  {formErrors.supervisorName && (<p className="text-xs text-red-600 mt-1">{formErrors.supervisorName}</p>)}
                </div>

                <div>
                  <Label htmlFor="date-of-prod">Date of Production *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button id="date-of-prod" variant="outline" className={cn("w-full justify-start font-normal",!formData.dateOfProduction && "text-muted-foreground", formErrors.dateOfProduction && "border-red-500")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dateOfProduction ? format(formData.dateOfProduction, "PPP") : (<span>Pick a date</span>)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.dateOfProduction} onSelect={(d) => handleFormChange("dateOfProduction", d)} initialFocus /></PopoverContent>
                  </Popover>
                  {formErrors.dateOfProduction && (<p className="text-xs text-red-600 mt-1">{formErrors.dateOfProduction}</p>)}
                </div>

                <div>
                  <Label htmlFor="shift">Shift *</Label>
                  <Select value={formData.shift} onValueChange={(v) => handleFormChange("shift", v)}>
                    <SelectTrigger id="shift" className={formErrors.shift ? "border-red-500" : ""}><SelectValue placeholder="Select Shift..." /></SelectTrigger>
                    <SelectContent>{shifts.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                  </Select>
                  {formErrors.shift && <p className="text-xs text-red-600 mt-1">{formErrors.shift}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={formData.notes} onChange={(e) => handleFormChange("notes", e.target.value)} placeholder="Enter any production notes..."/>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-purple-600 text-white hover:bg-purple-700">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Job Card</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}